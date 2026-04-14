import { getDistance, getBearing } from './geoUtils';

export function getLineCoordinates(geo: any): number[][] {
  if (!geo) return [];
  if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) return geo.coordinates;
  if (geo.type === 'Feature' && geo.geometry?.type === 'LineString') return geo.geometry.coordinates || [];
  if (geo.type === 'FeatureCollection' && Array.isArray(geo.features)) {
    const line = geo.features.find((f: any) => f?.geometry?.type === 'LineString');
    return line?.geometry?.coordinates || [];
  }
  return [];
}

export type SnapResult = {
  lat: number;
  lng: number;
  distanceMeters: number;
  /** Segmento [i] → [i+1] sobre el que se proyectó */
  segmentIndex: number;
  /** Posición en el segmento 0–1 */
  alongT: number;
};

/**
 * Proyecta el GPS sobre la polilínea (misma lógica que antes, con índice de segmento).
 */
export function snapPointToRouteDetailed(lat: number, lng: number, routeGeo: any): SnapResult {
  const coords = getLineCoordinates(routeGeo);
  if (coords.length < 2) {
    return { lat, lng, distanceMeters: Number.POSITIVE_INFINITY, segmentIndex: 0, alongT: 0 };
  }

  let best: SnapResult = {
    lat,
    lng,
    distanceMeters: Number.POSITIVE_INFINITY,
    segmentIndex: 0,
    alongT: 0,
  };
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  const toXY = (pLat: number, pLng: number) => ({ x: pLng * cosLat, y: pLat });

  const p = toXY(lat, lng);
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toXY(coords[i][1], coords[i][0]);
    const b = toXY(coords[i + 1][1], coords[i + 1][0]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) continue;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const projX = a.x + abx * t;
    const projY = a.y + aby * t;
    const projLat = projY;
    const projLng = projX / cosLat;
    const d = getDistance(lat, lng, projLat, projLng);
    if (d < best.distanceMeters) {
      best = { lat: projLat, lng: projLng, distanceMeters: d, segmentIndex: i, alongT: t };
    }
  }

  return best;
}

export function routeSegmentBearing(coords: number[][], segmentIndex: number): number {
  const i = Math.max(0, Math.min(segmentIndex, coords.length - 2));
  const a = coords[i];
  const b = coords[i + 1];
  return getBearing(a[1], a[0], b[1], b[0]);
}

/**
 * Rumbo "de conducción" a lo largo de la ruta: tangente al segmento actual,
 * mezclando con el siguiente al acercarse al vértice (menos saltos en curvas).
 */
export function routeDrivingBearing(coords: number[][], segmentIndex: number, alongT: number): number {
  if (coords.length < 2) return 0;
  const i = Math.max(0, Math.min(segmentIndex, coords.length - 2));
  const b0 = routeSegmentBearing(coords, i);
  if (i >= coords.length - 2) return b0;
  const b1 = routeSegmentBearing(coords, i + 1);
  if (alongT < 0.55) return b0;
  const w = (alongT - 0.55) / 0.45;
  return lerpAngleDegrees(b0, b1, Math.min(1, w));
}

/** Interpolación circular corta entre ángulos en grados */
export function lerpAngleDegrees(from: number, to: number, alpha: number): number {
  if (alpha <= 0) return from;
  if (alpha >= 1) return to;
  let diff = ((to - from + 540) % 360) - 180;
  return ((from + diff * alpha) % 360 + 360) % 360;
}
