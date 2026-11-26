/**
 * Agrupación provincia → localidad para "Explorar rutas planificadas".
 * Usa los campos que guarda cada ruta al crearla (province / municipality, en minúsculas).
 * Las rutas sin provincia van a «Sin provincia»; sin localidad, a «Sin localidad».
 * La visibilidad (routeListing) se filtra antes, con canShowRouteInExplore.
 */

export const EXPLORE_NONE_KEY = '__none__';

export type ExploreRouteLike = {
  province?: string;
  municipality?: string;
};

export type ExploreOption = {
  key: string;
  label: string;
  count: number;
};

export type ExploreProvinceOption = ExploreOption & {
  localities: ExploreOption[];
};

/** Minúsculas, sin espacios sobrantes; vacío si no hay dato. */
export function normalizePlaceKey(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

/** «castillo de jaca» → «Castillo De Jaca». Respeta guiones (Vitoria-Gasteiz → Vitoria-Gasteiz). */
export function formatPlaceLabel(key: string): string {
  return key
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => (part ? part.charAt(0).toLocaleUpperCase('es') + part.slice(1) : part))
        .join('-')
    )
    .join(' ');
}

/**
 * Comunidades autónomas: si una ruta antigua guardó la región (p. ej. «aragón» por el fallback
 * de `state` en la geocodificación inversa) en vez de la provincia, no es una provincia real.
 */
/** Solo nombres de comunidad que NO son también nombre de provincia (Madrid, Murcia, Navarra... se conservan). */
const REGION_NAMES = new Set([
  'andalucía', 'aragón', 'islas baleares', 'illes balears', 'canarias', 'castilla-la mancha',
  'castilla y león', 'cataluña', 'catalunya', 'comunidad valenciana', 'comunitat valenciana',
  'extremadura', 'galicia', 'región de murcia', 'país vasco', 'euskadi', 'comunidad de madrid',
]);

function routeProvinceKey(route: ExploreRouteLike): string {
  const key = normalizePlaceKey(route.province);
  if (!key || REGION_NAMES.has(key)) return EXPLORE_NONE_KEY;
  return key;
}

function routeLocalityKey(route: ExploreRouteLike): string {
  return normalizePlaceKey(route.municipality) || EXPLORE_NONE_KEY;
}

function labelFor(key: string, kind: 'province' | 'locality'): string {
  if (key === EXPLORE_NONE_KEY) return kind === 'province' ? 'Sin provincia' : 'Sin localidad';
  return formatPlaceLabel(key);
}

/**
 * Provincias con al menos una ruta, ordenadas alfabéticamente («Sin provincia» al final).
 * Cada una incluye sus localidades con el número de rutas.
 */
export function buildExploreProvinceOptions(routes: ExploreRouteLike[]): ExploreProvinceOption[] {
  const byProvince = new Map<string, { count: number; localities: Map<string, number> }>();
  for (const route of routes) {
    const pKey = routeProvinceKey(route);
    const lKey = routeLocalityKey(route);
    let entry = byProvince.get(pKey);
    if (!entry) {
      entry = { count: 0, localities: new Map() };
      byProvince.set(pKey, entry);
    }
    entry.count += 1;
    entry.localities.set(lKey, (entry.localities.get(lKey) ?? 0) + 1);
  }

  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  const compareKeys = (a: string, b: string) => {
    if (a === EXPLORE_NONE_KEY) return 1;
    if (b === EXPLORE_NONE_KEY) return -1;
    return collator.compare(a, b);
  };

  return [...byProvince.entries()]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([key, entry]) => ({
      key,
      label: labelFor(key, 'province'),
      count: entry.count,
      localities: [...entry.localities.entries()]
        .sort(([a], [b]) => compareKeys(a, b))
        .map(([lKey, count]) => ({ key: lKey, label: labelFor(lKey, 'locality'), count })),
    }));
}

/**
 * Rutas de una provincia (y, opcionalmente, de una localidad), ordenadas por fecha.
 * `localityKey` vacío = todas las localidades de la provincia.
 */
export function selectExploreRoutes<T extends ExploreRouteLike & { scheduledTimestamp?: number }>(
  routes: T[],
  provinceKey: string,
  localityKey: string
): T[] {
  if (!provinceKey) return [];
  return routes
    .filter((r) => routeProvinceKey(r) === provinceKey)
    .filter((r) => !localityKey || routeLocalityKey(r) === localityKey)
    .sort((a, b) => (a.scheduledTimestamp ?? 0) - (b.scheduledTimestamp ?? 0));
}
