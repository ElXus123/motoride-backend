import { getBearing, getDistance } from './geoUtils';

/**
 * Navegación sobre el trazado original (GPX / ruta del grupo).
 * El trazado NO se recalcula: todas las distancias son a lo largo de la propia polilínea.
 * Coordenadas en convención GeoJSON [lon, lat].
 */

export type RouteManeuver = {
  kind: 'turn' | 'roundabout';
  /** Distancia a lo largo del trazado hasta el giro (o hasta la entrada de la rotonda), m. */
  alongM: number;
  /** Solo rotonda: distancia a lo largo del trazado hasta la salida, m. */
  exitAlongM: number | null;
  lat: number;
  lng: number;
  /** Modificador tipo OSRM: left, right, slight left, slight right, sharp left, sharp right, uturn. */
  modifier: string;
  /** Rumbo del trazado justo después de la maniobra (grados, 0 = norte). */
  bearingAfter: number;
};

export type RouteIndex = {
  coords: number[][];
  cumM: number[];
  totalM: number;
  maneuvers: RouteManeuver[];
};

export type RouteProjection = {
  lat: number;
  lng: number;
  segmentIndex: number;
  alongT: number;
  /** Distancia desde el inicio del trazado hasta la proyección, m. */
  alongM: number;
  /** Distancia desde la posición real hasta el trazado, m. */
  offRouteM: number;
};

export type RouteStatus = {
  proj: RouteProjection;
  onRoute: boolean;
  alongM: number;
  remainingM: number;
  /** Próxima maniobra (no incluye la llegada). */
  next: RouteManeuver | null;
  /** Metros por el trazado hasta la próxima maniobra (o hasta la salida si estás dentro de una rotonda). */
  nextDistM: number | null;
  inRoundabout: boolean;
  /** Maniobra posterior a `next`, para la línea "luego ...". */
  afterNext: RouteManeuver | null;
};

/** Ventana (m) para medir el giro en cada vértice. */
const TURN_WINDOW_M = 25;
/** Giro mínimo (grados) para considerarlo maniobra. */
const MIN_TURN_DEG = 28;
/** Dos picos del mismo signo más cerca que esto se funden. */
const PEAK_MERGE_M = 15;

/** Rotonda: curvatura sostenida del mismo signo, muestreada cada CURV_STEP_M metros. */
const CURV_STEP_M = 5;
/** Giro mínimo (grados) por paso de muestreo para contar como curvatura. */
const RB_MIN_STEP_DEG = 4;
/** Giro total mínimo de la rotonda (grados), radio medio máximo (m) y longitud máxima de un tramo (m). */
const RB_MIN_SUM_DEG = 240;
const RB_MAX_RADIUS_M = 30;
const RB_MAX_LEN_M = 260;

/** Histéresis de salida de ruta (m): se sale a partir de OFF_ROUTE_ENTER_M y se vuelve por debajo de OFF_ROUTE_EXIT_M. */
const OFF_ROUTE_ENTER_M = 60;
const OFF_ROUTE_EXIT_M = 35;

/** Ángulo normalizado a (-180, 180]. */
export function normalizeDeltaDeg(a: number): number {
  return ((a + 540) % 360) - 180;
}

function sameSign(a: number, b: number): boolean {
  return (a > 0 && b > 0) || (a < 0 && b < 0);
}

function modifierFromTurn(th: number): string {
  const abs = Math.abs(th);
  const dir = th > 0 ? 'right' : 'left';
  if (abs >= 150) return 'uturn';
  if (abs >= 100) return `sharp ${dir}`;
  if (abs >= 45) return dir;
  return `slight ${dir}`;
}

/** Punto (lon, lat) a `s` metros del inicio, interpolado sobre el trazado. */
function pointAtM(pts: number[][], cumM: number[], s: number): [number, number] {
  const n = pts.length;
  if (s <= 0) return [pts[0][0], pts[0][1]];
  if (s >= cumM[n - 1]) return [pts[n - 1][0], pts[n - 1][1]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumM[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cumM[hi] - cumM[lo];
  const t = span > 0 ? (s - cumM[lo]) / span : 0;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
}

/** Construye el índice del trazado: distancias acumuladas y maniobras detectadas en la propia geometría. */
export function buildRouteIndex(lineCoords: number[][]): RouteIndex | null {
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) return null;

  // Solo se eliminan duplicados exactos (<0.5 m); el resto del trazado queda tal cual.
  const pts: number[][] = [];
  for (const c of lineCoords) {
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const last = pts[pts.length - 1];
    if (last && getDistance(last[1], last[0], c[1], c[0]) < 0.5) continue;
    pts.push([c[0], c[1]]);
  }
  const n = pts.length;
  if (n < 2) return null;

  const cumM: number[] = new Array(n);
  cumM[0] = 0;
  for (let i = 1; i < n; i++) {
    cumM[i] = cumM[i - 1] + getDistance(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]);
  }
  const totalM = cumM[n - 1];

  // Giro en cada vértice: rumbo de entrada (ventana atrás) vs rumbo de salida (ventana delante).
  const theta = new Float64Array(n);
  const bearingOut = new Float64Array(n);
  let j = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    while (j + 1 < i && cumM[i] - cumM[j + 1] >= TURN_WINDOW_M) j++;
    if (k < i) k = i;
    while (k < n - 1 && cumM[k] - cumM[i] < TURN_WINDOW_M) k++;
    if (cumM[i] - cumM[j] < TURN_WINDOW_M || cumM[k] - cumM[i] < TURN_WINDOW_M) {
      bearingOut[i] = NaN;
      continue;
    }
    const bIn = getBearing(pts[j][1], pts[j][0], pts[i][1], pts[i][0]);
    const bOut = getBearing(pts[i][1], pts[i][0], pts[k][1], pts[k][0]);
    theta[i] = normalizeDeltaDeg(bOut - bIn);
    bearingOut[i] = bOut;
  }

  // Picos: máximos locales de |giro| dentro de la ventana, por encima del umbral.
  type Peak = { i: number; th: number };
  const rawPeaks: Peak[] = [];
  for (let i = 0; i < n; i++) {
    const v = Math.abs(theta[i]);
    if (v < MIN_TURN_DEG || Number.isNaN(bearingOut[i])) continue;
    let isMax = true;
    for (let m = i - 1; m >= 0 && cumM[i] - cumM[m] <= TURN_WINDOW_M; m--) {
      if (Math.abs(theta[m]) > v) { isMax = false; break; }
    }
    if (isMax) {
      for (let m = i + 1; m < n && cumM[m] - cumM[i] <= TURN_WINDOW_M; m++) {
        if (Math.abs(theta[m]) > v) { isMax = false; break; }
      }
    }
    if (!isMax) continue;
    const last = rawPeaks[rawPeaks.length - 1];
    if (last && sameSign(last.th, theta[i]) && cumM[i] - cumM[last.i] <= PEAK_MERGE_M) {
      if (v > Math.abs(last.th)) rawPeaks[rawPeaks.length - 1] = { i, th: theta[i] };
      continue;
    }
    rawPeaks.push({ i, th: theta[i] });
  }

  // Rotondas: curvatura sostenida y del mismo signo (giro total >= 240°, radio medio <= 30 m).
  // El rumbo del trazado se muestrea cada 5 m con cuerdas de 10 m para no depender del ruido entre vértices.
  const roundabouts: RouteManeuver[] = [];
  const rbRanges: { startM: number; endM: number }[] = [];
  const K = Math.floor(totalM / CURV_STEP_M);
  const bearings: number[] = [];
  for (let s = 0; s <= K; s++) {
    const s0 = s * CURV_STEP_M;
    const a = pointAtM(pts, cumM, Math.max(0, s0 - CURV_STEP_M));
    const b = pointAtM(pts, cumM, Math.min(totalM, s0 + CURV_STEP_M));
    bearings.push(getBearing(a[1], a[0], b[1], b[0]));
  }
  const dh: number[] = [];
  for (let s = 0; s < bearings.length - 1; s++) dh.push(normalizeDeltaDeg(bearings[s + 1] - bearings[s]));

  let q = 0;
  while (q < dh.length) {
    if (Math.abs(dh[q]) < RB_MIN_STEP_DEG) {
      q++;
      continue;
    }
    const sgn = dh[q] > 0;
    let e = q;
    let sumDeg = 0;
    while (
      e < dh.length &&
      Math.abs(dh[e]) >= RB_MIN_STEP_DEG &&
      (dh[e] > 0) === sgn &&
      (e - q + 1) * CURV_STEP_M <= RB_MAX_LEN_M
    ) {
      sumDeg += Math.abs(dh[e]);
      e++;
    }
    const lenM = (e - q) * CURV_STEP_M;
    const sumRad = (sumDeg * Math.PI) / 180;
    const radiusM = sumRad > 0 ? lenM / sumRad : Number.POSITIVE_INFINITY;
    if (sumDeg >= RB_MIN_SUM_DEG && radiusM <= RB_MAX_RADIUS_M && lenM >= 30) {
      const startM = q * CURV_STEP_M;
      const endM = Math.min(totalM, e * CURV_STEP_M);
      rbRanges.push({ startM, endM });
      const entry = pointAtM(pts, cumM, startM);
      roundabouts.push({
        kind: 'roundabout',
        alongM: startM,
        exitAlongM: endM,
        lat: entry[1],
        lng: entry[0],
        modifier: '',
        bearingAfter: bearings[Math.min(e, bearings.length - 1)],
      });
    }
    q = Math.max(e, q + 1);
  }

  // Giros puntuales fuera de las rotondas.
  const inRoundabout = (m: number) => rbRanges.some((r) => m >= r.startM - 10 && m <= r.endM + 10);
  const maneuvers: RouteManeuver[] = [...roundabouts];
  for (const p of rawPeaks) {
    const along = cumM[p.i];
    if (inRoundabout(along)) continue;
    maneuvers.push({
      kind: 'turn',
      alongM: along,
      exitAlongM: null,
      lat: pts[p.i][1],
      lng: pts[p.i][0],
      modifier: modifierFromTurn(p.th),
      bearingAfter: bearingOut[p.i],
    });
  }
  maneuvers.sort((a, b) => a.alongM - b.alongM);

  return { coords: pts, cumM, totalM, maneuvers };
}

/** Proyección del punto real sobre el trazado (plano local por segmento; válido a escala de rutas). */
export function projectOntoRoute(index: RouteIndex, lat: number, lng: number, lastAlongM: number | null): RouteProjection {
  const { coords, cumM } = index;
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  const px = lng * cosLat;
  const py = lat;

  let best: RouteProjection | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0] * cosLat;
    const ay = coords[i][1];
    const bx = coords[i + 1][0] * cosLat;
    const by = coords[i + 1][1];
    const abx = bx - ax;
    const aby = by - ay;
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
    const projLng = (ax + abx * t) / cosLat;
    const projLat = ay + aby * t;
    const d = getDistance(lat, lng, projLat, projLng);
    const along = cumM[i] + t * (cumM[i + 1] - cumM[i]);
    // Penaliza retroceder de golpe (trazados que pasan dos veces por el mismo sitio).
    const score = d + (lastAlongM != null && along < lastAlongM - 40 ? 150 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = { lat: projLat, lng: projLng, segmentIndex: i, alongT: t, alongM: along, offRouteM: d };
    }
  }

  if (!best) {
    return { lat, lng, segmentIndex: 0, alongT: 0, alongM: 0, offRouteM: Number.POSITIVE_INFINITY };
  }
  return best;
}

/** Estado de navegación a partir de la posición actual y el estado previo (histéresis de desvío). */
export function evaluateRouteStatus(
  index: RouteIndex,
  lat: number,
  lng: number,
  prev: { onRoute: boolean; alongM: number | null }
): RouteStatus {
  const proj = projectOntoRoute(index, lat, lng, prev.alongM);
  const onRoute = prev.onRoute
    ? proj.offRouteM <= OFF_ROUTE_ENTER_M
    : proj.offRouteM <= OFF_ROUTE_EXIT_M;
  const along = proj.alongM;
  const remainingM = Math.max(0, index.totalM - along);

  // Maniobra actual: la primera cuyo final (salida si es rotonda) aún no se ha pasado (margen 10 m).
  const ms = index.maneuvers;
  let idx = ms.findIndex((m) => (m.kind === 'roundabout' ? m.exitAlongM ?? m.alongM : m.alongM) >= along - 10);
  if (idx < 0) idx = ms.length;
  const next = idx < ms.length ? ms[idx] : null;
  const afterNext = idx + 1 < ms.length ? ms[idx + 1] : null;

  let nextDistM: number | null = null;
  let inRoundabout = false;
  if (next) {
    if (next.kind === 'roundabout' && along >= next.alongM && next.exitAlongM != null) {
      inRoundabout = true;
      nextDistM = Math.max(0, next.exitAlongM - along);
    } else {
      nextDistM = Math.max(0, next.alongM - along);
    }
  }

  return { proj, onRoute, alongM: along, remainingM, next, nextDistM, inRoundabout, afterNext };
}

/* ----------------------------------------------------------------------------
 * Curvas del trazado y velocidad recomendada para tomarlas.
 * Solo se usa la geometría del propio trazado: no se inventan curvas.
 * ---------------------------------------------------------------------------- */

/**
 * Aceleración lateral de referencia (m/s²) para la velocidad recomendada: v = sqrt(a · r).
 * 2,0 m/s² ≈ 0,2 g, deliberadamente por debajo de lo que aguanta una moto y un conductor
 * con buen agarre, para que el aviso sea conservador (es una pauta, no un límite legal).
 */
export const CURVE_LAT_ACCEL_MS2 = 2.0;
/** Límites de la recomendación: nunca menos de 20 km/h ni más de 110 km/h en un aviso de curva. */
const CURVE_SPEED_MIN_KMH = 20;
const CURVE_SPEED_MAX_KMH = 110;
/** Muestreo del trazado para medir el rumbo en curva (m). */
const CURVE_SAMPLE_M = 5;
/** Giro mínimo por muestra (grados) para contar como curvatura: 1°/5 m ≈ radio de 290 m o menos. */
const CURVE_RATE_DEG = 1.0;
/** Giro acumulado mínimo y longitud mínima (m) para que un tramo sea curva. */
const CURVE_MIN_TOTAL_DEG = 30;
const CURVE_MIN_LEN_M = 20;
/** Giro acumulado a partir del cual el tramo es una rotonda (la detecta ya `buildRouteIndex`). */
const CURVE_ROUNDABOUT_DEG = 300;
/** Solo se avisan curvas con radio <= 250 m (tramos revirados); las más abiertas no molestan. */
export const CURVE_ALERT_MAX_RADIUS_M = 250;
/** Huecos de hasta 3 muestras (15 m) entre tramos de curvatura del mismo sentido se unen. */
const CURVE_MERGE_GAP_SAMPLES = 3;

export type RouteCurve = {
  /** Inicio y fin de la curva a lo largo del trazado, m. */
  startM: number;
  endM: number;
  /** Punto medio de la curva (vértice), m y coordenadas. */
  apexM: number;
  apexLat: number;
  apexLng: number;
  lengthM: number;
  /** Giro total de la curva (grados, valor absoluto). */
  totalDeg: number;
  /** Radio medio estimado: longitud / ángulo en radianes (r = L / θ). */
  radiusM: number;
  direction: 'left' | 'right';
  /** Velocidad recomendada para tomarla (km/h), redondeada a múltiplos de 5. */
  recommendedKmh: number;
};

/**
 * Velocidad recomendada según el radio: v = sqrt(a_lat · r), con a_lat = CURVE_LAT_ACCEL_MS2.
 * Ejemplos (con redondeo a la baja): r = 50 m → 35 km/h; r = 100 m → 50 km/h; r = 250 m → 80 km/h.
 */
export function recommendedCurveSpeedKmh(radiusM: number): number {
  const r = Math.max(1, radiusM);
  const kmh = Math.sqrt(CURVE_LAT_ACCEL_MS2 * r) * 3.6;
  const clamped = Math.max(CURVE_SPEED_MIN_KMH, Math.min(CURVE_SPEED_MAX_KMH, kmh));
  // Redondeo hacia abajo a múltiplos de 5: nunca recomienda más de lo que da la fórmula.
  return Math.floor(clamped / 5) * 5;
}

/** Curvas revirados del trazado (radio <= CURVE_ALERT_MAX_RADIUS_M), en orden de recorrido. */
export function detectRouteCurves(index: RouteIndex): RouteCurve[] {
  const { coords, cumM, totalM } = index;
  if (totalM < CURVE_MIN_LEN_M * 2) return [];

  // Muestras cada 5 m y rumbo tangente con ventana de ±10 m (suaviza el ruido entre vértices).
  const K = Math.floor(totalM / CURVE_SAMPLE_M);
  const pos: [number, number][] = [];
  for (let s = 0; s <= K; s++) pos.push(pointAtM(coords, cumM, Math.min(totalM, s * CURVE_SAMPLE_M)));
  const head: number[] = [];
  for (let s = 0; s <= K; s++) {
    const a = pos[Math.max(0, s - 2)];
    const b = pos[Math.min(K, s + 2)];
    head.push(getBearing(a[1], a[0], b[1], b[0]));
  }
  // Giro por muestra (positivo = a la derecha).
  const dh: number[] = [];
  for (let s = 0; s < K; s++) dh.push(normalizeDeltaDeg(head[s + 1] - head[s]));

  // Tramos consecutivos con curvatura del mismo sentido; se unen huecos cortos.
  type Run = { from: number; to: number; sign: number; total: number };
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let s = 0; s < dh.length; s++) {
    const d = dh[s];
    if (Math.abs(d) < CURVE_RATE_DEG) continue;
    const sign = d > 0 ? 1 : -1;
    if (cur && cur.sign === sign && s - cur.to <= CURVE_MERGE_GAP_SAMPLES + 1) {
      cur.to = s;
    } else {
      if (cur) runs.push(cur);
      cur = { from: s, to: s, sign, total: 0 };
    }
  }
  if (cur) runs.push(cur);

  const curves: RouteCurve[] = [];
  for (const r of runs) {
    let total = 0;
    for (let s = r.from; s <= r.to; s++) total += Math.abs(dh[s]);
    const startM = r.from * CURVE_SAMPLE_M;
    const endM = Math.min(totalM, (r.to + 1) * CURVE_SAMPLE_M);
    const lengthM = endM - startM;
    if (total < CURVE_MIN_TOTAL_DEG || total >= CURVE_ROUNDABOUT_DEG || lengthM < CURVE_MIN_LEN_M) continue;
    // Radio del tramo más cerrado: media del giro por muestra en las muestras con giro >= 80 % del máximo.
    // Los extremos de la curva se suavizan al medir el rumbo y «ensanchan» el radio; el punto más cerrado
    // es el que manda la velocidad, así que el cálculo queda del lado conservador.
    let maxAbs = 0;
    for (let s = r.from; s <= r.to; s++) maxAbs = Math.max(maxAbs, Math.abs(dh[s]));
    let plateauSum = 0;
    let plateauN = 0;
    for (let s = r.from; s <= r.to; s++) {
      if (Math.abs(dh[s]) >= 0.8 * maxAbs) {
        plateauSum += Math.abs(dh[s]);
        plateauN++;
      }
    }
    const tightRadPerSample = (plateauSum / Math.max(1, plateauN)) * (Math.PI / 180);
    const radiusM = tightRadPerSample > 0 ? CURVE_SAMPLE_M / tightRadPerSample : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(radiusM) || radiusM > CURVE_ALERT_MAX_RADIUS_M) continue;
    const apexM = (startM + endM) / 2;
    const apex = pointAtM(coords, cumM, apexM);
    curves.push({
      startM,
      endM,
      apexM,
      apexLat: apex[1],
      apexLng: apex[0],
      lengthM,
      totalDeg: total,
      radiusM,
      direction: r.sign > 0 ? 'right' : 'left',
      recommendedKmh: recommendedCurveSpeedKmh(radiusM),
    });
  }
  return curves;
}

export type CurveAhead = {
  curve: RouteCurve;
  /** Metros hasta la entrada de la curva (0 si ya estás dentro). */
  distM: number;
};

/** Próxima curva que aún no has terminado, si su entrada está a menos de `maxDistM`. */
export function nextCurveAhead(curves: RouteCurve[], alongM: number | null, maxDistM: number): CurveAhead | null {
  if (alongM == null || !Number.isFinite(alongM)) return null;
  for (const c of curves) {
    if (c.endM < alongM - 5) continue; // ya pasada
    const distM = Math.max(0, c.startM - alongM);
    if (distM > maxDistM) return null;
    return { curve: c, distM };
  }
  return null;
}

/* ----------------------------------------------------------------------------
 * Tiempo restante y hora estimada de llegada.
 * ---------------------------------------------------------------------------- */

/**
 * Velocidad media de referencia (km/h) mientras no hay datos del viaje (menos de 3 min o 2 km recorridos).
 * El trazado GPX no trae tipo de vía, así que se usa la densidad de curvas revirados como proxy:
 * - >= 3 curvas por km: tramo muy revirado (sierra), media baja.
 * - 1 a 3 curvas por km: mixto.
 * - < 1 curva por km: carretera abierta; aun así se usa una media prudente (incluye semáforos y tráfico).
 */
export function fallbackAverageSpeedKmh(totalM: number, curveCount: number): number {
  const km = Math.max(0.001, totalM / 1000);
  const perKm = curveCount / km;
  if (perKm >= 3) return 35;
  if (perKm >= 1) return 45;
  return 60;
}
