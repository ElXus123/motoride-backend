import { getDistance } from './geoUtils';
import { requestJson } from './network';

type OpenMeteoForecast = {
  current?: {
    precipitation?: number;
    rain?: number;
    showers?: number;
  };
  hourly?: {
    precipitation?: number[];
    precipitation_probability?: number[];
  };
};

const PRECIP_MM_LIGHT = 0.04;
const PRECIP_HOURLY_MM = 0.12;
const PROB_HIGH = 48;

/**
 * ¿Hay lluvia / precipitación relevante ahora o en las próximas horas en este punto?
 * Open-Meteo sin API key; uso orientativo, no para decisiones críticas.
 */
export async function fetchPrecipitationRiskAt(lat: number, lon: number): Promise<boolean> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    '&current=precipitation,rain,showers&hourly=precipitation,precipitation_probability' +
    '&timezone=auto&forecast_days=1';
  try {
    const data = await requestJson<OpenMeteoForecast>(url, { timeoutMs: 9000, retries: 0 });
    const c = data?.current;
    if (c) {
      const p = Number(c.precipitation ?? 0);
      const r = Number(c.rain ?? 0);
      const s = Number(c.showers ?? 0);
      if (p > PRECIP_MM_LIGHT || r > PRECIP_MM_LIGHT || s > PRECIP_MM_LIGHT) return true;
    }
    const h = data?.hourly;
    if (h?.precipitation?.length) {
      const n = Math.min(6, h.precipitation.length);
      for (let i = 0; i < n; i++) {
        if (Number(h.precipitation[i] ?? 0) >= PRECIP_HOURLY_MM) return true;
      }
    }
    if (h?.precipitation_probability?.length) {
      const n = Math.min(6, h.precipitation_probability.length);
      for (let i = 0; i < n; i++) {
        if (Number(h.precipitation_probability[i] ?? 0) >= PROB_HIGH) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Puntos a lo largo de la polilínea [lon,lat] espaciados por distancia. */
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

export async function anyPrecipitationRiskAtPoints(
  points: { lat: number; lng: number }[],
  maxConcurrent = 4
): Promise<boolean> {
  if (points.length === 0) return false;
  const slice = points.slice(0, 16);
  for (let i = 0; i < slice.length; i += maxConcurrent) {
    const batch = slice.slice(i, i + maxConcurrent);
    const results = await Promise.all(batch.map((p) => fetchPrecipitationRiskAt(p.lat, p.lng)));
    if (results.some((x) => x)) return true;
  }
  return false;
}
