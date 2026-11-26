/**
 * Mapa base. Carto Voyager devuelve «API KEY REQUIRED» sin clave, Stadia y MapTiler exigen clave
 * (401/403 sin ella) y OpenStreetMap prohíbe el uso intensivo desde apps, así que por defecto se usa
 * Esri World Street Map: sin clave, nombres en español, CORS abierto y el más rápido de los probados.
 * AVISO: el endpoint legacy server.arcgisonline.com funciona hoy sin clave, pero Esri orienta las apps
 * nuevas al servicio de basemap con token de su cuenta; puede cortarse en cualquier momento.
 * Se puede cambiar con `VITE_MAP_TILE_URL` (plantilla Leaflet con {z}, {x}, {y}),
 * p. ej. Carto con clave: https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?api_key=TU_CLAVE
 */
const DEFAULT_BASE_MAP_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

export const BASE_MAP_TILE_URL: string =
  (import.meta.env.VITE_MAP_TILE_URL as string | undefined)?.trim() || DEFAULT_BASE_MAP_TILE_URL;

export const BASE_MAP_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';

/** Zoom máximo real del proveedor (más allá Leaflet escala la última tesela). */
export const BASE_MAP_MAX_NATIVE_ZOOM = 19;

/** URL concreta de una tesela del mapa base (para precarga en caché). */
export function baseMapTileUrl(z: number, x: number, y: number): string {
  return BASE_MAP_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/** GIF 1×1 transparente (capas encima del mapa base; el fondo claro del pane se ve debajo). */
export const LEAFLET_TRANSPARENT_ERROR_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Tesela de error clara alineada con Carto Voyager: evita “cuadros negros” si falla una petición. */
export const LEAFLET_LIGHT_ERROR_TILE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e2e8"/></svg>'
  );
