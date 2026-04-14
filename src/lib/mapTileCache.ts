/**
 * Mismo nombre que en `public/sw.js` (TILE_CACHE) para que la precarga desde la app
 * y las peticiones del mapa compartan almacenamiento persistente.
 */
export const MAP_TILE_CACHE_NAME = 'map-tiles-v3';

/** Misma URL base que `TileLayer` (subdominio fijo = claves de caché consistentes). */
export const CARTO_VOYAGER_TILE_BASE = 'https://a.basemaps.cartocdn.com/rastertiles/voyager';

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
 * Teselas Carto Voyager en un radio ~`radiusM` m alrededor de (lat,lng), por cada zoom.
 * Limita ancho en teselas para no bloquear el hilo ni saturar red.
 */
export function collectCartoPrefetchUrls(
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
    const n = Math.pow(2, z);
    const maxI = n - 1;

    for (let dx = -half; dx <= half; dx++) {
      for (let dy = -half; dy <= half; dy++) {
        const x = Math.max(0, Math.min(maxI, cx + dx));
        const y = Math.max(0, Math.min(maxI, cy + dy));
        const u = `${CARTO_VOYAGER_TILE_BASE}/${z}/${x}/${y}.png`;
        if (seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
        if (urls.length >= maxTotal) return urls;
      }
    }
  }
  return urls;
}

/**
 * Rellena Cache API (mismo bucket que el SW) o dispara carga en <img> si no hay caches.
 * fetch en modo cors para respuestas no opacas y poder guardarlas bien.
 */
export async function prefetchCartoTileUrls(urls: string[], concurrency = 8): Promise<void> {
  if (urls.length === 0) return;

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
    const chunk = Math.ceil(n / workers);
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const from = w * chunk;
        const to = Math.min(from + chunk, n);
        for (let idx = from; idx < to; idx++) {
          const url = urls[idx];
          if (!url) continue;
          try {
            const req = new Request(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
            const hit = await cache.match(req);
            if (hit) continue;
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res.clone());
          } catch {
            // best-effort
          }
        }
      })
    );
  } catch {
    for (const url of urls) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
    }
  }
}

export function prefetchAroundUser(
  lat: number,
  lng: number,
  mapZoom: number,
  radiusM = 5000
): Promise<void> {
  const levels = zoomLevelsForPrefetch(mapZoom);
  const urls = collectCartoPrefetchUrls(lat, lng, levels, radiusM, 380);
  return prefetchCartoTileUrls(urls);
}
