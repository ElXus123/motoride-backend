import { getDistance } from './geoUtils';
import { requestJson } from './network';

/**
 * Aviso de lluvia en la ruta (Open-Meteo, sin API key; uso orientativo, no para decisiones críticas).
 *
 * - Se consulta lluvia actual y prevista en las próximas HOURS_AHEAD horas, en varios puntos del trazado
 *   que quedan por delante del motorista (no solo en su posición).
 * - Open-Meteo admite varias coordenadas por petición: los puntos se agrupan en lotes (BATCH_SIZE),
 *   así se cubre toda la ruta con muy pocas llamadas.
 * - La previsión horaria se filtra por la hora actual (el array diario empieza a las 00:00, no ahora).
 */

type OpenMeteoPoint = {
  current?: { precipitation?: number; rain?: number; showers?: number };
  hourly?: {
    time?: number[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
};

/** Umbrales: lluvia actual apreciable, mm/h previstos y probabilidad de precipitación. */
const PRECIP_MM_LIGHT = 0.04;
const PRECIP_HOURLY_MM = 0.12;
const PROB_HIGH = 48;
/** Horas por delante que se consideran (el motorista llega a los puntos del trazado en ese margen). */
const HOURS_AHEAD = 3;
/** Puntos por petición (Open-Meteo admite varias coordenadas en una sola llamada). */
const BATCH_SIZE = 40;
/** Tope de puntos por revisión, para no saturar el servicio. */
const MAX_POINTS = 80;
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** ¿Hay lluvia relevante en un punto (ahora o en las próximas HOURS_AHEAD horas)? Pura: testable sin red. */
export function riskFromOpenMeteoPoint(f: OpenMeteoPoint | null | undefined, nowSec: number = Date.now() / 1000): boolean {
  if (!f) return false;
  const c = f.current;
  if (c) {
    const p = Number(c.precipitation ?? 0);
    const r = Number(c.rain ?? 0);
    const s = Number(c.showers ?? 0);
    if (p > PRECIP_MM_LIGHT || r > PRECIP_MM_LIGHT || s > PRECIP_MM_LIGHT) return true;
  }
  const h = f.hourly;
  const times = h?.time ?? [];
  if (!times.length) return false;
  const from = nowSec - 3600; // la hora en curso cuenta entera
  const to = nowSec + HOURS_AHEAD * 3600;
  for (let i = 0; i < times.length; i++) {
    const t = Number(times[i]);
    if (!Number.isFinite(t) || t < from || t > to) continue;
    if (Number(h?.precipitation?.[i] ?? 0) >= PRECIP_HOURLY_MM) return true;
    if (Number(h?.precipitation_probability?.[i] ?? 0) >= PROB_HIGH) return true;
  }
  return false;
}

/** Consulta varios puntos en lotes. Devuelve true si alguno tiene lluvia prevista. Sin red o con error: false. */
export async function anyPrecipitationRiskAtPoints(points: { lat: number; lng: number }[]): Promise<boolean> {
  const unique = dedupeNearbyPoints(points, 3).slice(0, MAX_POINTS);
  if (unique.length === 0) return false;
  const nowSec = Date.now() / 1000;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const url =
      `${OPEN_METEO_URL}?latitude=${batch.map((p) => p.lat.toFixed(4)).join(',')}` +
      `&longitude=${batch.map((p) => p.lng.toFixed(4)).join(',')}` +
      '&current=precipitation,rain,showers&hourly=precipitation,precipitation_probability' +
      '&timeformat=unixtime&timezone=auto&forecast_days=2';
    try {
      const data = await requestJson<OpenMeteoPoint | OpenMeteoPoint[]>(url, { timeoutMs: 12000, retries: 1, backoffMs: 800 });
      // Con varias coordenadas la respuesta es un array (una entrada por punto); con una, un objeto.
      const list = Array.isArray(data) ? data : [data];
      if (list.some((f) => riskFromOpenMeteoPoint(f, nowSec))) return true;
    } catch {
      // Sin datos no se avisa: el resto de la app sigue igual.
    }
  }
  return false;
}

/** Compatibilidad: riesgo en un único punto. */
export function fetchPrecipitationRiskAt(lat: number, lon: number): Promise<boolean> {
  return anyPrecipitationRiskAtPoints([{ lat, lng: lon }]);
}

/** Puntos del trazado a lo largo de la polilínea [lon,lat] espaciados por distancia (desde el inicio). */
export function samplePolylineByDistance(coords: number[][], numSamples: number): { lat: number; lng: number }[] {
  if (!coords || coords.length < 2 || numSamples < 1) return [];
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getDistance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }
  if (total < 2) {
    return [{ lat: coords[0][1], lng: coords[0][0] }];
  }
  const out: { lat: number; lng: number }[] = [];
  for (let k = 1; k <= numSamples; k++) {
    const targetM = (total * k) / (numSamples + 1);
    let acc = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      const seg = getDistance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
      if (acc + seg >= targetM || i === coords.length - 2) {
        const t = seg > 0 ? Math.min(1, Math.max(0, (targetM - acc) / seg)) : 0;
        const lng = coords[i][0] + t * (coords[i + 1][0] - coords[i][0]);
        const lat = coords[i][1] + t * (coords[i + 1][1] - coords[i][1]);
        out.push({ lat, lng });
        break;
      }
      acc += seg;
    }
  }
  return out;
}

/**
 * Puntos del trazado que quedan por delante desde `fromM` (metros desde el inicio), cada `spacingM` metros,
 * hasta `aheadM` metros. Usa las distancias acumuladas del índice de ruta (routeProgress.ts).
 */
export function routePointsAhead(
  index: { coords: number[][]; cumM: number[]; totalM: number },
  fromM: number,
  aheadM = 60000,
  spacingM = 5000
): { lat: number; lng: number }[] {
  const { coords, cumM, totalM } = index;
  if (coords.length < 2 || totalM <= 0) return [];
  const start = Math.max(0, Math.min(totalM, fromM));
  const end = Math.min(totalM, start + aheadM);
  const out: { lat: number; lng: number }[] = [];
  for (let s = start; s <= end; s += spacingM) out.push(pointAtM(coords, cumM, s));
  if (end - start > 0 && (out.length === 0 || end - (start + (out.length - 1) * spacingM) > 1)) {
    out.push(pointAtM(coords, cumM, end));
  }
  return out;
}

function pointAtM(coords: number[][], cumM: number[], s: number): { lat: number; lng: number } {
  const n = coords.length;
  if (s <= 0) return { lat: coords[0][1], lng: coords[0][0] };
  if (s >= cumM[n - 1]) return { lat: coords[n - 1][1], lng: coords[n - 1][0] };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumM[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cumM[hi] - cumM[lo];
  const t = span > 0 ? (s - cumM[lo]) / span : 0;
  return {
    lat: coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t,
    lng: coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t,
  };
}

export function dedupeNearbyPoints(points: { lat: number; lng: number }[], decimals = 2): { lat: number; lng: number }[] {
  const seen = new Set<string>();
  const out: { lat: number; lng: number }[] = [];
  for (const p of points) {
    const k = `${p.lat.toFixed(decimals)},${p.lng.toFixed(decimals)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
