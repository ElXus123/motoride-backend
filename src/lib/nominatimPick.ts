/**
 * Elige el mejor resultado de Nominatim cuando la consulta libre devuelve
 * un POI aleatorio en lugar de la ciudad (p. ej. "Huesca, Aragón, España").
 *
 * Importante: NO usar `string.includes` para tokens de lugar — "huesca" coincidiría
 * dentro de "Adahuesca" y desviaría la ruta. Se usa coincidencia por límite de palabra.
 */

export type NominatimItem = {
  lat?: string;
  lon?: string;
  /** Nombre propio del objeto OSM (p. ej. "Huesca/Uesca"); más limpio que display_name. */
  name?: string;
  display_name?: string;
  osm_type?: string;
  osm_id?: number;
  type?: string;
  class?: string;
  importance?: number | string;
  address?: Record<string, string>;
  /** p. ej. city, town, province — viene en JSON de Nominatim y ayuda a priorizar la ciudad sobre la provincia */
  addresstype?: string;
};

/** Letra (incl. ñ / acentos) para detectar si un carácter es parte de una palabra. */
const IS_LETTER = /[\p{L}]/u;

/**
 * `needle` aparece en `haystack` como palabra completa (no como subcadena de otra palabra).
 * Evita que "huesca" premie a "Adahuesca".
 */
export function matchesAsWholeWord(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 2) return false;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let from = 0;
  while (from <= h.length - n.length) {
    const i = h.indexOf(n, from);
    if (i < 0) break;
    const beforeOk = i === 0 || !IS_LETTER.test(h[i - 1]!);
    const afterOk = i + n.length >= h.length || !IS_LETTER.test(h[i + n.length]!);
    if (beforeOk && afterOk) return true;
    from = i + 1;
  }
  return false;
}

/** Minúsculas y sin tildes: «Aínsa» y «Ainsa» son el mismo topónimo. */
export function foldPlace(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Término de lugar que el usuario quiere (p. ej. "Huesca, Aragón, España" → "huesca").
 * Con coma: se toma la primera palabra del primer segmento (no "La Rioja" entero: "La, Rioja" → "la" evitado con artículos).
 */
function primaryPlaceToken(queryLower: string): string {
  const trimmed = queryLower.trim();
  const firstPart = trimmed.split(',')[0]?.trim() || trimmed;
  const words = firstPart.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  if (trimmed.includes(',')) {
    let i = 0;
    const articles = ['la', 'las', 'el', 'los'];
    if (words[0] && articles.includes(words[0].toLowerCase()) && words[1]) i = 1;
    return (words[i] || words[0] || '').toLowerCase();
  }

  const stop = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y']);
  const significant = words.filter((w) => w.length >= 3 && !stop.has(w.toLowerCase()));
  if (words[0]?.toLowerCase() === 'provincia' || words[0]?.toLowerCase() === 'comarca') {
    const last = significant[significant.length - 1];
    if (last) return last.toLowerCase();
  }
  return (significant[0] || words[0] || '').toLowerCase();
}

/**
 * Nominatim usa nombres bilingües p. ej. "Huesca/Uesca" — el primer tramo es el topónimo que el usuario busca.
 * Sin esto, "huesca" no coincide con la ciudad y además se penaliza como si fuera "Adahuesca".
 */
function firstToponymSegment(placeFieldLower: string): string {
  const pl = placeFieldLower.trim().toLowerCase();
  const slash = pl.indexOf('/');
  if (slash <= 0) return pl;
  return pl.slice(0, slash).trim();
}

/** ¿El campo ciudad/municipio del resultado corresponde al lugar buscado (incl. Huesca/Uesca)? */
function placeFieldMatchesPrimary(placeFieldLower: string, primary: string): boolean {
  if (!primary || primary.length < 2) return false;
  const pl = placeFieldLower.trim().toLowerCase();
  if (pl === primary) return true;
  const head = firstToponymSegment(pl);
  if (head === primary) return true;
  return matchesAsWholeWord(pl, primary);
}

/** Nombre principal del resultado: primer tramo de `name` (sin «/Uesca»), o el primer tramo de display_name. */
export function nominatimTitle(item: NominatimItem): string {
  const fromName = (item.name || '').split('/')[0]?.trim();
  if (fromName) return fromName;
  return (item.display_name || '').split(',')[0]?.trim() || '';
}

const POPULATED_ADDRTYPES = new Set(['city', 'town', 'village', 'municipality', 'hamlet']);

/** Población (ciudad/pueblo/municipio) cuyo nombre es exactamente el buscado: siempre primera. */
function isExactPopulatedMatch(item: NominatimItem, primaryFolded: string): boolean {
  if (!primaryFolded) return false;
  if (!POPULATED_ADDRTYPES.has((item.addresstype || '').toLowerCase())) return false;
  return foldPlace(nominatimTitle(item)) === primaryFolded;
}

function scoreItem(item: NominatimItem, queryLower: string): number {
  let s = 0;
  const imp = Number(item.importance);
  if (Number.isFinite(imp)) s += imp * 4;

  const t = (item.type || '').toLowerCase();
  const c = (item.class || '').toLowerCase();
  const addr = item.address || {};

  if (t === 'administrative' || t === 'city' || t === 'town' || t === 'village' || t === 'municipality') s += 12;
  if (c === 'place' && (t === 'city' || t === 'town' || t === 'village')) s += 10;
  if (t === 'suburb' || t === 'neighbourhood' || t === 'farm' || t === 'house' || t === 'building') s -= 8;

  const city = foldPlace(addr.city || addr.town || addr.village || addr.municipality || '');
  const state = foldPlace(addr.state || addr.region || '');
  const q = foldPlace(queryLower);
  const primary = primaryPlaceToken(q);

  const addrType = (item.addresstype || '').toLowerCase();
  // Para rutas: preferir población (ciudad/municipio) frente al polígono de provincia cuando ambos coinciden con la búsqueda.
  if (addrType === 'city' || addrType === 'town' || addrType === 'municipality' || addrType === 'village') {
    s += 22;
  }
  if (addrType === 'province' || addrType === 'state') {
    s -= 18;
  }

  // Coincidencia del lugar principal con la ciudad/municipio del resultado (p. ej. Huesca/Uesca, Huesca ≠ Adahuesca).
  const placeFields = [addr.city, addr.town, addr.village, addr.municipality, addr.city_district]
    .filter(Boolean)
    .map((x) => foldPlace(String(x)));
  if (primary.length >= 3) {
    for (const pl of placeFields) {
      if (placeFieldMatchesPrimary(pl, primary)) {
        s += 28;
        break;
      }
    }
    // Penalizar nombres que contienen el token como subcadena pero no son el mismo sitio (Adahuesca vs Huesca).
    for (const pl of placeFields) {
      if (placeFieldMatchesPrimary(pl, primary)) continue;
      if (pl.length > primary.length && pl.includes(primary) && pl !== primary) {
        s -= 22;
        break;
      }
    }
  }

  // Priorizar población cuyo nombre de ciudad coincide exactamente con el término buscado (p. ej. Huesca ≠ Adahuesca).
  if (primary.length >= 3 && city) {
    const head = firstToponymSegment(city);
    if (head === primary || head.startsWith(`${primary} /`) || head.startsWith(`${primary}/`)) {
      s += 38;
    }
  }

  if (city && matchesAsWholeWord(city, primary)) s += 6;
  else if (city && q.includes(city) && matchesAsWholeWord(q, city)) s += 6;

  if (state && matchesAsWholeWord(q, state)) s += 3;

  const name = foldPlace(item.display_name || '');
  const parts = q.split(/[,\s]+/).filter((p) => p.length > 2);
  for (const p of parts) {
    if (matchesAsWholeWord(name, p)) s += 2;
  }

  return s;
}

/**
 * Texto para la lista de sugerencias: título = municipio; subtítulo = comarca y provincia.
 * Así «Hoya de Huesca» (comarca) queda como dato secundario y no como nombre principal.
 */
export function formatNominatimSuggestion(item: NominatimItem): { title: string; subtitle: string } {
  const title = nominatimTitle(item) || (item.display_name || '').trim();
  const a = item.address || {};
  const titleKey = foldPlace(title);
  const parts: string[] = [];
  for (const raw of [a.county, a.province || a.state || a.region]) {
    const v = (raw || '').trim();
    if (!v || foldPlace(v) === titleKey) continue;
    if (parts.some((x) => foldPlace(x) === foldPlace(v))) continue;
    parts.push(v);
  }
  return { title, subtitle: parts.join(' · ') };
}

/** Niveles administrativos demasiado grandes: su lat/lon de Nominatim es el centroide del polígono
 *  (p. ej. provincia de Huesca ≈ 31 km de la ciudad), no un punto habitado; nunca son destino de ruta. */
const NON_ROUTABLE_ADDRTYPES = new Set(['country', 'state', 'region', 'province', 'county', 'state_district']);

/** ¿Sirve este resultado como destino de ruta (población, no provincia/comarca)? */
export function isRoutableNominatimResult(item: NominatimItem): boolean {
  const at = (item.addresstype || '').toLowerCase();
  if (at) return !NON_ROUTABLE_ADDRTYPES.has(at);
  const t = (item.type || '').toLowerCase();
  return !NON_ROUTABLE_ADDRTYPES.has(t);
}

/** Lista ordenada (mejor primero) solo con resultados enrutables. */
export function sortRoutableNominatimResults(items: NominatimItem[], query: string): NominatimItem[] {
  return sortNominatimResults(items.filter(isRoutableNominatimResult), query);
}

/** Ordena resultados de mayor a mejor puntuación y devuelve el primero enrutable (nunca provincia). */
export function pickBestNominatimResult(items: NominatimItem[] | null | undefined, query: string): NominatimItem | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const sorted = sortRoutableNominatimResults(items, query);
  return sorted[0] ?? null;
}

/**
 * Lista ordenada (mejor primero). Primero el municipio cuyo nombre es exactamente el buscado
 * (aunque Nominatim lo devuelva con otro rango), luego por puntuación.
 * Incluye provincias (uso de búsqueda), penalizadas.
 */
export function sortNominatimResults(items: NominatimItem[], query: string): NominatimItem[] {
  const q = foldPlace(query);
  const primary = primaryPlaceToken(q);
  const exactTier = (x: NominatimItem) => (isExactPopulatedMatch(x, primary) ? 1 : 0);
  return [...items].sort(
    (a, b) => exactTier(b) - exactTier(a) || scoreItem(b, q) - scoreItem(a, q)
  );
}
