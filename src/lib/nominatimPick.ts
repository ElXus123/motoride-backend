/**
 * Elige el mejor resultado de Nominatim cuando la consulta libre devuelve
 * un POI aleatorio en lugar de la ciudad (p. ej. "Huesca, Aragón, España").
 */

export type NominatimItem = {
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  class?: string;
  importance?: number | string;
  address?: Record<string, string>;
};

function scoreItem(item: NominatimItem, queryLower: string): number {
  let s = 0;
  const imp = Number(item.importance);
  if (Number.isFinite(imp)) s += imp * 3;

  const t = (item.type || '').toLowerCase();
  const c = (item.class || '').toLowerCase();
  const addr = item.address || {};

  if (t === 'administrative' || t === 'city' || t === 'town' || t === 'village' || t === 'municipality') s += 12;
  if (c === 'place' && (t === 'city' || t === 'town' || t === 'village')) s += 10;
  if (t === 'suburb' || t === 'neighbourhood' || t === 'farm' || t === 'house' || t === 'building') s -= 8;

  const city = (addr.city || addr.town || addr.village || addr.municipality || '').toLowerCase();
  const state = (addr.state || addr.region || '').toLowerCase();
  const q = queryLower;
  if (city && q.includes(city)) s += 6;
  if (state && q.includes(state)) s += 3;

  const name = (item.display_name || '').toLowerCase();
  const parts = q.split(/[,\s]+/).filter((p) => p.length > 2);
  for (const p of parts) {
    if (name.includes(p)) s += 1.5;
  }

  return s;
}

/** Ordena resultados de mayor a mejor puntuación y devuelve el primero. */
export function pickBestNominatimResult(items: NominatimItem[] | null | undefined, query: string): NominatimItem | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const sorted = sortNominatimResults(items, query);
  return sorted[0] ?? null;
}

/** Lista ordenada (mejor primero) para sugerencias. */
export function sortNominatimResults(items: NominatimItem[], query: string): NominatimItem[] {
  const q = query.trim().toLowerCase();
  return [...items].sort((a, b) => scoreItem(b, q) - scoreItem(a, q));
}
