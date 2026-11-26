import { requestJson } from './network';
import { projectOntoRoute, type RouteIndex } from './routeProgress';

/**
 * Paradas sugeridas a lo largo del trazado (gasolineras, cafés y miradores) desde OpenStreetMap / Overpass.
 *
 * Límites de uso (política pública de Overpass):
 * - Una consulta por tramo del trazado: la ruta se muestrea cada SAMPLE_EVERY_M y cada consulta cubre
 *   POINTS_PER_QUERY muestras (~60 km) con un corredor de CORRIDOR_M alrededor de la polilínea.
 * - Tope de MAX_QUERIES consultas por ruta; el resto del trazado no se consulta.
 * - Las consultas son secuenciales, con una pausa entre ellas, y el resultado se cachea por ruta.
 * - Nunca se consulta por cada fijo GPS: solo al pedir la lista de paradas.
 */

export type RouteStopKind = 'fuel' | 'cafe' | 'viewpoint';

export type RouteStop = {
  /** Identificador OSM, p. ej. "node/123456". */
  id: string;
  kind: RouteStopKind;
  name: string | null;
  lat: number;
  lng: number;
  /** Distancia a lo largo del trazado hasta el punto más cercano a la parada, m. */
  alongM: number;
  /** Distancia en línea recta desde la parada hasta el trazado, m. */
  offRouteM: number;
};

export const STOP_KIND_LABEL: Record<RouteStopKind, string> = {
  fuel: 'Gasolinera',
  cafe: 'Café',
  viewpoint: 'Mirador',
};

/** Servidor principal y espejo público de Overpass (se usa el espejo solo si el principal falla, sin ráfagas). */
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const SAMPLE_EVERY_M = 4000;
const POINTS_PER_QUERY = 16;
const MAX_QUERIES = 6;
const CORRIDOR_M = 1000;
/** Solo se listan paradas a menos de esta distancia del trazado (m). */
export const MAX_STOP_OFF_ROUTE_M = 800;
const MAX_STOPS = 80;
const PAUSE_BETWEEN_QUERIES_MS = 1000;
/** Overpass: tiempo por intento (principal: 2 intentos; espejo: 1) y tope total de la búsqueda. */
const OVERPASS_TIMEOUT_MS = 25000;
const OVERPASS_PRIMARY_RETRIES = 1;
const TOTAL_TIMEOUT_MS = 120000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Muestras [lat, lon] del trazado cada SAMPLE_EVERY_M metros, incluido el final. */
export function sampleRouteLatLon(index: RouteIndex): [number, number][] {
  const { coords, cumM, totalM } = index;
  const out: [number, number][] = [];
  let next = 0;
  for (let i = 0; i < coords.length; i++) {
    if (cumM[i] >= next) {
      out.push([coords[i][1], coords[i][0]]);
      next = cumM[i] + SAMPLE_EVERY_M;
    }
  }
  const last = coords[coords.length - 1];
  const lastOut = out[out.length - 1];
  if (last && (!lastOut || lastOut[0] !== last[1] || lastOut[1] !== last[0]) && totalM > 0) {
    out.push([last[1], last[0]]);
  }
  return out;
}

/** Consultas Overpass por tramo. Tramos consecutivos comparten un punto para no dejar huecos. */
export function buildStopQueries(index: RouteIndex): string[] {
  const pts = sampleRouteLatLon(index);
  if (pts.length < 2) return [];
  const queries: string[] = [];
  const step = POINTS_PER_QUERY - 1;
  for (let start = 0; start < pts.length - 1 && queries.length < MAX_QUERIES; start += step) {
    const chunk = pts.slice(start, start + POINTS_PER_QUERY);
    if (chunk.length < 2) break;
    const around = `around:${CORRIDOR_M},${chunk.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join(',')}`;
    queries.push(
      `[out:json][timeout:25];(` +
        `nwr["amenity"="fuel"](${around});` +
        `nwr["amenity"="cafe"](${around});` +
        `nwr["tourism"="viewpoint"](${around});` +
        `);out center 400;`
    );
  }
  return queries;
}

/** Clave estable de la ruta para la caché (misma ruta → mismas consultas). */
export function routeCacheKey(index: RouteIndex): string {
  const a = index.coords[0];
  const b = index.coords[index.coords.length - 1];
  return `${index.coords.length}|${index.totalM.toFixed(0)}|${a[0].toFixed(5)},${a[1].toFixed(5)}|${b[0].toFixed(5)},${b[1].toFixed(5)}`;
}

function classify(tags: Record<string, string> | undefined): RouteStopKind | null {
  if (!tags) return null;
  if (tags.amenity === 'fuel') return 'fuel';
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  return null;
}

/** Convierte los elementos de Overpass en paradas proyectadas sobre el trazado. Puro: testable sin red. */
export function stopsFromElements(elements: any[], index: RouteIndex): RouteStop[] {
  const seen = new Set<string>();
  const stops: RouteStop[] = [];
  for (const el of elements) {
    const kind = classify(el?.tags);
    const lat = Number.isFinite(el?.lat) ? el.lat : el?.center?.lat;
    const lng = Number.isFinite(el?.lon) ? el.lon : el?.center?.lon;
    if (!kind || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const proj = projectOntoRoute(index, lat, lng, null);
    if (!Number.isFinite(proj.offRouteM) || proj.offRouteM > MAX_STOP_OFF_ROUTE_M) continue;
    const name = (el.tags.name as string | undefined) ?? (el.tags.brand as string | undefined) ?? null;
    stops.push({ id, kind, name, lat, lng, alongM: proj.alongM, offRouteM: proj.offRouteM });
  }
  stops.sort((x, y) => x.alongM - y.alongM);
  return stops.slice(0, MAX_STOPS);
}

/**
 * Una consulta Overpass: primero el servidor principal (con un reintento ante 502/503/504/429 o fallo de red),
 * y si falla, un único intento en el espejo. Si ambos fallan, se lanza el último error.
 */
async function postOverpass(query: string, signal?: AbortSignal): Promise<any> {
  let lastError: unknown = null;
  for (let u = 0; u < OVERPASS_URLS.length; u++) {
    try {
      return await requestJson<any>(OVERPASS_URLS[u], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        timeoutMs: OVERPASS_TIMEOUT_MS,
        retries: u === 0 ? OVERPASS_PRIMARY_RETRIES : 0,
        backoffMs: 2000,
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

const cache = new Map<string, RouteStop[]>();
const inFlight = new Map<string, Promise<RouteStop[]>>();

/** Paradas ya consultadas para esta ruta, o null si aún no se han pedido. */
export function getCachedRouteStops(index: RouteIndex): RouteStop[] | null {
  return cache.get(routeCacheKey(index)) ?? null;
}

/**
 * Pide las paradas de la ruta (una vez por ruta; llamadas simultáneas comparten la misma petición).
 * Si una consulta falla se lanza error y no se cachea, para poder reintentar.
 */
export function fetchRouteStops(index: RouteIndex, signal?: AbortSignal): Promise<RouteStop[]> {
  const key = routeCacheKey(index);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const queries = buildStopQueries(index);
    const elements: any[] = [];
    for (let i = 0; i < queries.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const data = await postOverpass(queries[i], signal);
      if (!data || !Array.isArray(data.elements)) throw new Error('overpass_bad_response');
      // Overpass responde 200 con un «remark» cuando la consulta se corta (tiempo, memoria...): eso no es «sin paradas».
      if (typeof data.remark === 'string' && data.elements.length === 0) {
        throw new Error('overpass_remark');
      }
      elements.push(...data.elements);
      if (i < queries.length - 1) await sleep(PAUSE_BETWEEN_QUERIES_MS);
    }
    const stops = stopsFromElements(elements, index);
    cache.set(key, stops);
    return stops;
  })();
  // Tope total: el panel nunca se queda «cargando» indefinidamente.
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => reject(new Error('overpass_total_timeout')), TOTAL_TIMEOUT_MS);
    work.finally(() => clearTimeout(id)).catch(() => undefined);
  });
  const run = Promise.race([work, timeout]).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, run);
  return run;
}

/**
 * Próxima parada elegida por el usuario que aún está por delante.
 * `chosenIds` son ids de RouteStop; devuelve la de menor alongM a partir de `alongM - backtrackM`.
 */
export function nextChosenStop(
  stops: RouteStop[],
  chosenIds: string[],
  alongM: number | null,
  backtrackM = 50
): { stop: RouteStop; distM: number } | null {
  if (alongM == null || !Number.isFinite(alongM) || chosenIds.length === 0) return null;
  const chosen = new Set(chosenIds);
  for (const s of stops) {
    if (!chosen.has(s.id)) continue;
    if (s.alongM < alongM - backtrackM) continue;
    return { stop: s, distM: Math.max(0, s.alongM - alongM) };
  }
  return null;
}
