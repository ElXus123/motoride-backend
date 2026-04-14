/** GIF 1×1 transparente (capas encima del mapa base; el fondo claro del pane se ve debajo). */
export const LEAFLET_TRANSPARENT_ERROR_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Tesela de error clara alineada con Carto Voyager: evita “cuadros negros” si falla una petición. */
export const LEAFLET_LIGHT_ERROR_TILE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2e2e8"/></svg>'
  );
