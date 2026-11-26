import { baseMapTileUrl } from './leafletTiles';

/**
 * Mismo nombre que en `public/sw.js` (TILE_CACHE) para que la precarga desde la app
 * y las peticiones del mapa compartan almacenamiento persistente.
 */
export const MAP_TILE_CACHE_NAME = 'map-tiles-v4';

/** Máximo de teselas guardadas (≈ 8–10 KB cada una → ~20 MB como mucho). Las más antiguas salen primero. */
export const MAP_TILE_CACHE_MAX_ENTRIES = 2000;

const DEG = Math.PI / 180;

export function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

function metersPerTile(lat: number, z: number): number {
  return (40075016.686 * Math.max(0.2, Math.cos(lat * DEG))) / Math.pow(2, z);
}

/** Sin datos o con ahorro de datos activo: no precargar en segundo plano. */
function prefetchAllowed(): boolean {
  try {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!conn) return true;
    if (conn.saveData) return false;
    if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return false;
    return true;
  } catch {
    return true;
  }
}

/** Zooms a precargar: el actual (redondeado) ±1 y, si está muy alejado, acercar a uso en ruta. */
export function zoomLevelsForPrefetch(mapZoom: number): number[] {
  const z = Math.round(Number.isFinite(mapZoom) ? mapZoom : 15);
  const set = new Set<number>();
  for (let d = -1; d <= 1; d++) {
    const zz = z + d;
    if (zz >= 10 && zz <= 19) set.add(zz);
  }
  if (z < 14) {
    [14, 15, 16].forEach((x) => {
      if (x <= 19) set.add(x);
    });
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * URLs de teselas del mapa base en un radio ~`radiusM` m alrededor de (lat,lng), por cada zoom.
 * Limita ancho en teselas para no bloquear el hilo ni saturar red.
 */
export function collectBaseMapPrefetchUrls(
  lat: number,
  lng: number,
  zoomLevels: number[],
  radiusM = 5000,
  maxTotal = 360
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const z of zoomLevels) {
    const mTile = metersPerTile(lat, z);
    let half = Math.ceil(radiusM / mTile);
    half = Math.min(12, Math.max(2, half));

    const cx = lon2tile(lng, z);
    const cy = lat2tile(lat, z);
    const maxI = Math.pow(2, z) - 1;

    for (let dx = -half; dx <= half; dx++) {
      for (let dy = -half; dy <= half; dy++) {
        const x = Math.max(0, Math.min(maxI, cx + dx));
        const y = Math.max(0, Math.min(maxI, cy + dy));
        const u = baseMapTileUrl(z, x, y);
        if (seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
        if (urls.length >= maxTotal) return urls;
      }
    }
  }
  return urls;
}

/** Extrae coordenadas [lng, lat] de un GeoJSON de ruta (Feature, FeatureCollection, LineString, MultiLineString). */
export function lineCoordsFromGeoJSON(geo: unknown): [number, number][] {
  const out: [number, number][] = [];
  const pushLine = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    for (const c of coords) {
      if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') out.push([c[0], c[1]]);
    }
  };
  const visit = (g: any) => {
    if (!g) return;
    if (g.type === 'FeatureCollection' && Array.isArray(g.features)) g.features.forEach(visit);
    else if (g.type === 'Feature') visit(g.geometry);
    else if (g.type === 'LineString') pushLine(g.coordinates);
    else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) g.coordinates.forEach(pushLine);
  };
  visit(geo);
  return out;
}

/**
 * Teselas a lo largo de una ruta: muestrea cada ~150 m y añade vecinos ±1 para cubrir el ancho de pantalla.
 * Prioriza zoom 15 (uso habitual) y luego 14 y 16.
 */
export function collectRouteTileUrls(coords: [number, number][], maxTotal = 480): string[] {
  if (coords.length === 0) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  const zooms = [15, 14, 16, 13];

  // Muestreo por distancia aproximada (equirectangular, suficiente para ~150 m).
  const samples: [number, number][] = [];
  let lastLat = coords[0][1];
  let lastLng = coords[0][0];
  samples.push([lastLat, lastLng]);
  for (let i = 1; i < coords.length; i++) {
    const lat = coords[i][1];
    const lng = coords[i][0];
    const dy = (lat - lastLat) * 111320;
    const dx = (lng - lastLng) * 111320 * Math.cos(lat * DEG);
    if (Math.hypot(dx, dy) >= 150) {
      samples.push([lat, lng]);
      lastLat = lat;
      lastLng = lng;
    }
  }
  if (samples[samples.length - 1][0] !== coords[coords.length - 1][1]) {
    samples.push([coords[coords.length - 1][1], coords[coords.length - 1][0]]);
  }

  for (const z of zooms) {
    const maxI = Math.pow(2, z) - 1;
    for (const [lat, lng] of samples) {
      const cx = lon2tile(lng, z);
      const cy = lat2tile(lat, z);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const x = Math.max(0, Math.min(maxI, cx + dx));
          const y = Math.max(0, Math.min(maxI, cy + dy));
          const u = baseMapTileUrl(z, x, y);
          if (seen.has(u)) continue;
          seen.add(u);
          urls.push(u);
          if (urls.length >= maxTotal) return urls;
        }
      }
    }
  }
  return urls;
}

/**
 * Descarga teselas a la caché persistente (mismo bucket que el SW). Solo hace red para las que faltan.
 * Si Cache API no existe, dispara <img> como último recurso.
 */
export async function prefetchBaseMapTileUrls(urls: string[], concurrency = 6): Promise<void> {
  if (urls.length === 0 || !prefetchAllowed()) return;

  if (!('caches' in window)) {
    for (const url of urls) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
    }
    return;
  }

  try {
    const cache = await caches.open(MAP_TILE_CACHE_NAME);
    const n = urls.length;
    const workers = Math.min(concurrency, Math.max(1, n));
    let next = 0;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (next < n) {
          const url = urls[next++];
          if (!url) continue;
          try {
            const req = new Request(url, { mode: 'cors', credentials: 'omit' });
            if (await cache.match(req)) continue;
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res.clone());
          } catch {
            // best-effort
          }
        }
      })
    );
    void trimTileCache();
  } catch {
    for (const url of urls) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
    }
  }
}

/** Elimina las teselas más antiguas si la caché supera `max` entradas. */
export async function trimTileCache(max = MAP_TILE_CACHE_MAX_ENTRIES): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(MAP_TILE_CACHE_NAME);
    const keys = await cache.keys();
    const excess = keys.length - max;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch {
    /* best-effort */
  }
}

export function prefetchAroundUser(lat: number, lng: number, mapZoom: number, radiusM = 5000): Promise<void> {
  const levels = zoomLevelsForPrefetch(mapZoom);
  return prefetchBaseMapTileUrls(collectBaseMapPrefetchUrls(lat, lng, levels, radiusM, 380));
}

/** Precarga teselas a lo largo de una ruta (GeoJSON) para que se vea bien sin cobertura o al arrancar. */
export function prefetchRouteTiles(geo: unknown): Promise<void> {
  const coords = lineCoordsFromGeoJSON(geo);
  if (coords.length < 2) return Promise.resolve();
  return prefetchBaseMapTileUrls(collectRouteTileUrls(coords, 480));
}
