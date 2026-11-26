/**
 * Nivel de curvas para la planificación de rutas (BAJO / MEDIO / ALTO).
 *
 * Todo sale de la geometría real que devuelve OSRM: se muestrea el trazado cada ~25 m, se mide el
 * cambio de rumbo en ventanas de ~50 m a cada lado y se cuentan los tramos sostenidos con giro
 * >= CURVE_TURN_DEG. No se inventa ningún trazado: los puntos intermedios solo sirven para pedir a
 * OSRM rutas alternativas por carreteras existentes, y se descartan si OSRM los recoloca lejos.
 */

export type CurveLevel = 'bajo' | 'medio' | 'alto';

export type CurveLevelConfig = {
  id: CurveLevel;
  label: string;
  description: string;
  /** Desvío máximo sobre la distancia de la ruta directa (0.05 = +5 %). */
  maxDetour: number;
  /** Nº de puntos intermedios que se prueban (cada uno = 1 petición OSRM). */
  candidates: number;
  /** Mínimo de curvas por km para no avisar de que el trayecto es poco revirado. 0 = sin aviso. */
  minCurvesPerKm: number;
};

export const CURVE_LEVELS: Record<CurveLevel, CurveLevelConfig> = {
  bajo: {
    id: 'bajo',
    label: 'Bajo',
    description: 'Tramos tranquilos, pocas curvas',
    maxDetour: 0.05,
    candidates: 2,
    minCurvesPerKm: 0,
  },
  medio: {
    id: 'medio',
    label: 'Medio',
    description: 'Equilibrado',
    maxDetour: 0.15,
    candidates: 4,
    minCurvesPerKm: 1,
  },
  alto: {
    id: 'alto',
    label: 'Alto',
    description: 'Muy revirado',
    maxDetour: 0.3,
    candidates: 6,
    minCurvesPerKm: 2,
  },
};

export const CURVE_LEVEL_ORDER: CurveLevel[] = ['bajo', 'medio', 'alto'];

/** Muestreo del trazado (m) y ventana de medida de rumbo (muestras a cada lado). */
const SAMPLE_STEP_M = 25;
const WINDOW_SAMPLES = 2;
/** Giro mínimo (grados) en una muestra para considerarla parte de una curva. */
const CURVE_TURN_DEG = 20;
/** Giro acumulado mínimo (grados) para que un tramo cuente como curva (filtra ruido). */
const CURVE_MIN_TOTAL_DEG = 30;
/** Huecos de hasta 2 muestras (~50 m) entre tramos de giro se unen en una sola curva. */
const CURVE_MERGE_GAP_SAMPLES = 2;
/** Si OSRM recoloca un punto intermedio a más de esta distancia, la ruta se descarta. */
const MAX_WAYPOINT_SNAP_M = 1500;

export type LonLat = [number, number];

export type CurveStats = {
  lengthKm: number;
  curveCount: number;
  curvesPerKm: number;
  /** Suma de giros significativos (grados) a lo largo del trazado. */
  totalTurnDeg: number;
};

const EARTH_R = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rumbo inicial de a hacia b, en grados 0-360. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δλ = toRad(b[0] - a[0]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Diferencia absoluta entre dos rumbos, en grados 0-180. */
export function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Remuestrea la polilínea a paso fijo (m). Entrada y salida en [lon, lat]. */
export function resamplePolyline(coords: LonLat[], stepM = SAMPLE_STEP_M): LonLat[] {
  if (coords.length < 2) return coords.slice();
  const out: LonLat[] = [coords[0]!];
  let carry = 0; // distancia ya recorrida desde el último punto emitido
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const segLen = haversineM(a, b);
    if (segLen === 0) continue;
    let d = stepM - carry;
    while (d <= segLen) {
      const t = d / segLen;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += stepM;
    }
    carry = segLen - (d - stepM);
  }
  const last = coords[coords.length - 1]!;
  const tail = out[out.length - 1]!;
  if (haversineM(tail, last) > 1) out.push(last);
  return out;
}

/**
 * Cuenta curvas en una geometría de OSRM ([lon, lat][]).
 * Curva = tramo de muestras con giro >= CURVE_TURN_DEG (medido sobre ~100 m) cuyo giro acumulado
 * alcanza CURVE_MIN_TOTAL_DEG.
 */
export function computeCurveStats(coords: LonLat[]): CurveStats {
  const pts = resamplePolyline(coords);
  let lengthM = 0;
  for (let i = 1; i < pts.length; i++) lengthM += haversineM(pts[i - 1]!, pts[i]!);
  const lengthKm = lengthM / 1000;
  const empty: CurveStats = { lengthKm, curveCount: 0, curvesPerKm: 0, totalTurnDeg: 0 };
  const w = WINDOW_SAMPLES;
  if (pts.length < 2 * w + 1) return empty;

  // Giro (con signo) en cada muestra interior: rumbo de entrada frente al de salida.
  const turns: number[] = new Array(pts.length).fill(0);
  for (let i = w; i < pts.length - w; i++) {
    const before = bearingDeg(pts[i - w]!, pts[i]!);
    const after = bearingDeg(pts[i]!, pts[i + w]!);
    let d = after - before;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turns[i] = d;
  }

  // Tramos consecutivos con |giro| >= umbral y mismo sentido.
  type Run = { start: number; end: number; total: number };
  const runs: Run[] = [];
  let cur: Run | null = null;
  let curSign = 0;
  for (let i = w; i < pts.length - w; i++) {
    const t = turns[i]!;
    const sign = Math.sign(t);
    if (Math.abs(t) >= CURVE_TURN_DEG) {
      if (cur && sign === curSign) {
        cur.end = i;
        cur.total += Math.abs(t);
      } else {
        if (cur) runs.push(cur);
        cur = { start: i, end: i, total: Math.abs(t) };
        curSign = sign;
      }
    }
  }
  if (cur) runs.push(cur);

  // Unir tramos separados por huecos cortos.
  const merged: Run[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && r.start - prev.end <= CURVE_MERGE_GAP_SAMPLES + 1) {
      prev.end = r.end;
      prev.total += r.total;
    } else {
      merged.push({ ...r });
    }
  }

  const significant = merged.filter((r) => r.total >= CURVE_MIN_TOTAL_DEG);
  const totalTurnDeg = significant.reduce((s, r) => s + r.total, 0);
  return {
    lengthKm,
    curveCount: significant.length,
    curvesPerKm: lengthKm > 0 ? significant.length / lengthKm : 0,
    totalTurnDeg,
  };
}

export type OsrmRouteResult = {
  distance: number; // m
  duration: number; // s
  coords: LonLat[];
  /** Ubicación real donde OSRM ha colocado cada waypoint de entrada (mismo orden). */
  snapped?: LonLat[];
};

export type RouteFetcher = (waypoints: LonLat[]) => Promise<OsrmRouteResult | null>;

export type CurvePlanCandidate = {
  /** null = ruta directa */
  waypoint: LonLat | null;
  distance: number;
  duration: number;
  detourPct: number;
  stats: CurveStats;
  coords: LonLat[];
};

export type CurvePlanResult =
  | {
      ok: true;
      chosen: CurvePlanCandidate;
      direct: CurvePlanCandidate;
      candidates: CurvePlanCandidate[];
      /** Aviso para el usuario (p. ej. no hay suficientes curvas para el nivel). */
      warning: string | null;
    }
  | { ok: false; reason: 'no-route' };

/**
 * Puntos intermedios candidatos: a ambos lados de la recta S→D, a 35/50/65 % del trayecto y a
 * un 20-25 % de la distancia en perpendicular. Orden fijo: los primeros son los que más
 * probabilidad tienen de pasar por zonas reviradas sin alejarse demasiado.
 */
export function buildCandidateWaypoints(start: LonLat, dest: LonLat, count: number): LonLat[] {
  const cosLat = Math.cos(toRad((start[1] + dest[1]) / 2));
  const dx = (dest[0] - start[0]) * cosLat;
  const dy = dest[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const px = -dy / len;
  const py = dx / len;
  const specs: Array<{ t: number; off: number }> = [
    { t: 0.5, off: 0.25 },
    { t: 0.5, off: -0.25 },
    { t: 0.35, off: 0.2 },
    { t: 0.65, off: -0.2 },
    { t: 0.35, off: -0.2 },
    { t: 0.65, off: 0.2 },
  ];
  return specs.slice(0, count).map(({ t, off }) => {
    const mx = start[0] + (dest[0] - start[0]) * t;
    const my = start[1] + (dest[1] - start[1]) * t;
    // off = fracción de la longitud del tramo, expresada en grados (lon corregida por latitud).
    const ox = (px * off * len) / cosLat;
    const oy = py * off * len;
    return [mx + ox, my + oy] as LonLat;
  });
}

/** Elige la ruta según el nivel. Pura: no hace peticiones. */
export function pickCurveCandidate(
  level: CurveLevel,
  direct: CurvePlanCandidate,
  candidates: CurvePlanCandidate[]
): { chosen: CurvePlanCandidate; warning: string | null } {
  const cfg = CURVE_LEVELS[level];
  const pool = [direct, ...candidates.filter((c) => c.detourPct / 100 <= cfg.maxDetour + 1e-9)];
  let chosen: CurvePlanCandidate;
  if (level === 'bajo') {
    // Carreteras tranquilas: la de menos curvas/km dentro del desvío permitido (empate: la más corta).
    chosen = pool.reduce((best, c) => {
      const d = c.stats.curvesPerKm - best.stats.curvesPerKm;
      if (d < -1e-6) return c;
      if (Math.abs(d) <= 1e-6 && c.distance < best.distance) return c;
      return best;
    });
  } else {
    // Medio / alto: la de más curvas/km dentro del desvío permitido (empate: la directa).
    chosen = pool.reduce((best, c) => (c.stats.curvesPerKm > best.stats.curvesPerKm + 1e-6 ? c : best));
  }

  let warning: string | null = null;
  if (cfg.minCurvesPerKm > 0 && chosen.stats.curvesPerKm < cfg.minCurvesPerKm) {
    warning =
      `No hay suficientes curvas para el nivel ${cfg.label.toLowerCase()} en este trayecto ` +
      `(${chosen.stats.curveCount} curvas, ${chosen.stats.curvesPerKm.toFixed(1)}/km con hasta +${Math.round(cfg.maxDetour * 100)} % de desvío). ` +
      `Se usa la mejor opción encontrada.`;
  }
  return { chosen, warning };
}

/**
 * Planifica la ruta según el nivel de curvas. `fetchRoute` pide a OSRM una ruta por los waypoints
 * dados (el primero es el origen y el último el destino). Las peticiones son secuenciales.
 */
export async function planCurveRoute(params: {
  start: LonLat;
  dest: LonLat;
  level: CurveLevel;
  fetchRoute: RouteFetcher;
  onProgress?: (done: number, total: number) => void;
}): Promise<CurvePlanResult> {
  const { start, dest, level, fetchRoute, onProgress } = params;
  const cfg = CURVE_LEVELS[level];

  const directRoute = await fetchRoute([start, dest]);
  if (!directRoute || directRoute.distance <= 0) return { ok: false, reason: 'no-route' };
  const direct: CurvePlanCandidate = {
    waypoint: null,
    distance: directRoute.distance,
    duration: directRoute.duration,
    detourPct: 0,
    stats: computeCurveStats(directRoute.coords),
    coords: directRoute.coords,
  };

  const waypoints = buildCandidateWaypoints(start, dest, cfg.candidates);
  const candidates: CurvePlanCandidate[] = [];
  let done = 0;
  onProgress?.(done, waypoints.length);
  for (const wp of waypoints) {
    try {
      const r = await fetchRoute([start, wp, dest]);
      const snapOk = !r?.snapped?.[1] || haversineM(r.snapped[1], wp) <= MAX_WAYPOINT_SNAP_M;
      if (r && snapOk) {
        candidates.push({
          waypoint: wp,
          distance: r.distance,
          duration: r.duration,
          detourPct: Math.max(0, ((r.distance - direct.distance) / direct.distance) * 100),
          stats: computeCurveStats(r.coords),
          coords: r.coords,
        });
      }
    } catch {
      /* candidato fallido: se ignora */
    }
    done++;
    onProgress?.(done, waypoints.length);
  }

  const { chosen, warning } = pickCurveCandidate(level, direct, candidates);
  return { ok: true, chosen, direct, candidates, warning };
}
