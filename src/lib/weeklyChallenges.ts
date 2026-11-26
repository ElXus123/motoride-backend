/**
 * Retos semanales (cálculo puro, sin dependencias de Firebase).
 * - Un reto por semana ISO (lunes 00:00 a lunes siguiente, hora local), elegido por hash del id de semana
 *   entre los retos ACTIVOS (ordenados por id para que todos los dispositivos elijan igual).
 * - Los retos vienen de la colección `weeklyChallenges` (editable desde el panel de admin) o, si no hay
 *   configuración válida, de WEEKLY_CHALLENGES (valores por defecto de este fichero).
 * - Se evalúa con los documentos existentes de `rideHistory` del usuario.
 * - Al completarlo se cobra UNA vez por semana: `users.weeklyChallengeLastClaimed` (ej. "2026-W48")
 *   + copia local en localStorage para evitar doble cobro sin red.
 */

export const WEEKLY_CHALLENGE_REWARD_POINTS = 300;

/** Subconjunto de un documento `rideHistory` que necesita el reto. */
export type WeeklyRideInput = {
  endTime?: number;
  distance?: number;
  leftTurns?: number;
  rightTurns?: number;
  maxLeanLeft?: number;
  maxLeanRight?: number;
  /** Personas que iban en la ruta (1 = solo). Ausente en rutas guardadas antes de este campo. */
  participantCount?: number;
};

/**
 * Métricas disponibles:
 * - km: suma de km de la semana.
 * - rides: número de rutas.
 * - curves: suma de curvas (izq + dcha).
 * - leanRides: rutas con inclinación máxima >= minLean.
 * - longRides: rutas con distancia >= minKm.
 * - groupKm: suma de km en rutas de grupo (2 o más personas).
 * - kmAndCurves: suma de km >= target Y suma de curvas >= targetCurves (ambos a la vez).
 */
export type WeeklyChallengeMetric = 'km' | 'rides' | 'curves' | 'leanRides' | 'longRides' | 'groupKm' | 'kmAndCurves';

export const WEEKLY_CHALLENGE_METRICS: { id: WeeklyChallengeMetric; label: string; hint: string }[] = [
  { id: 'km', label: 'Kilómetros', hint: 'Suma los km de todas las rutas de la semana.' },
  { id: 'rides', label: 'Número de rutas', hint: 'Cuenta las rutas completadas.' },
  { id: 'curves', label: 'Curvas', hint: 'Suma las curvas izquierda + derecha.' },
  { id: 'leanRides', label: 'Rutas con inclinación', hint: 'Cuenta rutas con inclinación máxima igual o mayor a un grado.' },
  { id: 'longRides', label: 'Rutas largas', hint: 'Cuenta rutas de al menos X km.' },
  { id: 'groupKm', label: 'Km en grupo', hint: 'Suma km solo de rutas con 2 o más personas.' },
  { id: 'kmAndCurves', label: 'Km y curvas', hint: 'Exige km totales y curvas totales a la vez.' },
];

export type WeeklyChallengeConfig = {
  /** Id estable (en Firestore = id del documento). Minúsculas, números, guion y guion bajo. */
  id: string;
  title: string;
  description: string;
  metric: WeeklyChallengeMetric;
  /** Objetivo principal: km, rutas o curvas según la métrica. */
  target: number;
  /** Solo `kmAndCurves`: curvas totales exigidas. */
  targetCurves?: number;
  /** Solo `leanRides`: grados de inclinación mínimos por ruta (por defecto 35). */
  minLean?: number;
  /** Solo `longRides`: km mínimos por ruta (por defecto 80). */
  minKm?: number;
  rewardPoints: number;
  enabled: boolean;
  /** Marco de temporada que el reto promociona (informativo; el desbloqueo lo gestiona el sistema de marcos). */
  seasonFrameId?: string | null;
};

export type WeeklyChallengeDef = WeeklyChallengeConfig & {
  /** Unidad para mostrar el progreso principal. */
  unit: 'km' | 'rutas' | 'curvas';
};

export const WEEKLY_CHALLENGE_ID_RE = /^[a-z0-9_-]{1,40}$/;
export const WEEKLY_CHALLENGE_LIMITS = {
  titleMax: 60,
  descriptionMax: 200,
  targetMin: 1,
  targetMax: 100000,
  rewardMin: 0,
  rewardMax: 5000,
  minLeanMax: 90,
  minKmMax: 1000,
  seasonFrameIdMax: 40,
} as const;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const rideKm = (r: WeeklyRideInput) => Math.max(0, num(r.distance));
const rideCurves = (r: WeeklyRideInput) => Math.max(0, num(r.leftTurns) + num(r.rightTurns));
const rideMaxLean = (r: WeeklyRideInput) => Math.max(Math.abs(num(r.maxLeanLeft)), Math.abs(num(r.maxLeanRight)));
/** Solo cuenta como ruta de grupo con 2 o más participantes guardados en la ruta. */
const isGroupRide = (r: WeeklyRideInput) => Math.floor(num(r.participantCount)) >= 2;

export function weeklyChallengeUnit(metric: WeeklyChallengeMetric): WeeklyChallengeDef['unit'] {
  if (metric === 'km' || metric === 'groupKm' || metric === 'kmAndCurves') return 'km';
  if (metric === 'curves') return 'curvas';
  return 'rutas';
}

/** Valores por defecto (se usan si no hay configuración válida en Firestore). */
export const WEEKLY_CHALLENGES: WeeklyChallengeConfig[] = [
  {
    id: 'km250',
    title: 'Semana de kilómetros',
    description: 'Acumula 250 km esta semana.',
    metric: 'km',
    target: 250,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
  {
    id: 'rides5',
    title: 'Rodaje constante',
    description: 'Completa 5 rutas esta semana.',
    metric: 'rides',
    target: 5,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
  {
    id: 'lean35x5',
    title: 'Tumbada habitual',
    description: 'Haz 5 rutas con inclinación de 35° o más.',
    metric: 'leanRides',
    target: 5,
    minLean: 35,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
  {
    id: 'curves250',
    title: 'Eses a tope',
    description: 'Supera 250 curvas esta semana.',
    metric: 'curves',
    target: 250,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
  {
    id: 'long120',
    title: 'Ruta larga',
    description: 'Completa una ruta de 120 km o más.',
    metric: 'longRides',
    target: 1,
    minKm: 120,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
  {
    id: 'kmcurves',
    title: 'Trazado revirado',
    description: 'Suma 200 km y 50 curvas esta semana.',
    metric: 'kmAndCurves',
    target: 200,
    targetCurves: 50,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
  {
    id: 'group200',
    title: '200 km en grupo',
    description: 'Suma 200 km en rutas de grupo (2 o más personas) esta semana.',
    metric: 'groupKm',
    target: 200,
    rewardPoints: WEEKLY_CHALLENGE_REWARD_POINTS,
    enabled: true,
    seasonFrameId: null,
  },
];

/** Valida y normaliza un documento crudo de Firestore. Devuelve null si no es válido. */
export function parseWeeklyChallengeConfig(id: string, raw: unknown): WeeklyChallengeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const metric = WEEKLY_CHALLENGE_METRICS.find((m) => m.id === d.metric)?.id;
  if (!WEEKLY_CHALLENGE_ID_RE.test(id) || !metric) return null;
  const title = typeof d.title === 'string' ? d.title.trim() : '';
  const description = typeof d.description === 'string' ? d.description.trim() : '';
  const target = Number(d.target);
  const rewardPoints = Number(d.rewardPoints);
  if (!title || title.length > WEEKLY_CHALLENGE_LIMITS.titleMax) return null;
  if (!Number.isFinite(target) || target < WEEKLY_CHALLENGE_LIMITS.targetMin || target > WEEKLY_CHALLENGE_LIMITS.targetMax) return null;
  if (!Number.isFinite(rewardPoints) || rewardPoints < 0 || rewardPoints > WEEKLY_CHALLENGE_LIMITS.rewardMax) return null;
  const out: WeeklyChallengeConfig = {
    id,
    title,
    description: description.slice(0, WEEKLY_CHALLENGE_LIMITS.descriptionMax),
    metric,
    target,
    rewardPoints,
    enabled: d.enabled !== false,
    seasonFrameId: typeof d.seasonFrameId === 'string' && d.seasonFrameId ? d.seasonFrameId : null,
  };
  if (metric === 'kmAndCurves') {
    const tc = Number(d.targetCurves);
    if (!Number.isFinite(tc) || tc < 1 || tc > WEEKLY_CHALLENGE_LIMITS.targetMax) return null;
    out.targetCurves = tc;
  }
  if (metric === 'leanRides') {
    const ml = d.minLean == null ? 35 : Number(d.minLean);
    if (!Number.isFinite(ml) || ml < 0 || ml > WEEKLY_CHALLENGE_LIMITS.minLeanMax) return null;
    out.minLean = ml;
  }
  if (metric === 'longRides') {
    const mk = d.minKm == null ? 80 : Number(d.minKm);
    if (!Number.isFinite(mk) || mk < 0 || mk > WEEKLY_CHALLENGE_LIMITS.minKmMax) return null;
    out.minKm = mk;
  }
  return out;
}

/**
 * Validación de un borrador (formulario del admin). Devuelve el primer error en español o null.
 * Mismos rangos que las reglas de Firestore (firestore.rules, colección weeklyChallenges).
 */
export function validateWeeklyChallengeDraft(c: WeeklyChallengeConfig): string | null {
  if (!WEEKLY_CHALLENGE_ID_RE.test(c.id)) return 'El identificador del reto no es válido.';
  if (!c.title.trim()) return 'Pon un título.';
  if (c.title.trim().length > WEEKLY_CHALLENGE_LIMITS.titleMax) return `El título no puede superar ${WEEKLY_CHALLENGE_LIMITS.titleMax} caracteres.`;
  if (c.description.length > WEEKLY_CHALLENGE_LIMITS.descriptionMax) return `La descripción no puede superar ${WEEKLY_CHALLENGE_LIMITS.descriptionMax} caracteres.`;
  const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
  if (!inRange(c.target, WEEKLY_CHALLENGE_LIMITS.targetMin, WEEKLY_CHALLENGE_LIMITS.targetMax))
    return 'El objetivo debe estar entre 1 y 100000.';
  if (!inRange(c.rewardPoints, WEEKLY_CHALLENGE_LIMITS.rewardMin, WEEKLY_CHALLENGE_LIMITS.rewardMax))
    return 'La recompensa debe estar entre 0 y 5000 puntos.';
  if (c.metric === 'kmAndCurves' && !inRange(Number(c.targetCurves), 1, WEEKLY_CHALLENGE_LIMITS.targetMax))
    return 'Indica las curvas totales (1 a 100000).';
  if (c.metric === 'leanRides' && !inRange(Number(c.minLean), 0, WEEKLY_CHALLENGE_LIMITS.minLeanMax))
    return 'La inclinación mínima debe estar entre 0 y 90 grados.';
  if (c.metric === 'longRides' && !inRange(Number(c.minKm), 0, WEEKLY_CHALLENGE_LIMITS.minKmMax))
    return 'Los km mínimos por ruta deben estar entre 0 y 1000.';
  if (c.seasonFrameId && c.seasonFrameId.length > WEEKLY_CHALLENGE_LIMITS.seasonFrameIdMax)
    return 'El identificador del marco es demasiado largo (máx. 40).';
  return null;
}

/** Id nuevo a partir del título: slug + sufijo temporal para que no colisione. */
export function makeWeeklyChallengeId(title: string, now = Date.now()): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${slug || 'reto'}-${now.toString(36)}`.slice(0, 40);
}

/** Retos activos en orden estable (por id). Si ninguno está activo, cae en los por defecto. */
export function getActiveWeeklyChallenges(list: readonly WeeklyChallengeConfig[] = WEEKLY_CHALLENGES): WeeklyChallengeConfig[] {
  const fromList = list.filter((c) => c.enabled);
  const source = fromList.length > 0 ? fromList : WEEKLY_CHALLENGES.filter((c) => c.enabled);
  return source.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Identificador ISO de la semana de una fecha, p. ej. "2026-W48". Usa la fecha local. */
export function getIsoWeekKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Jueves de la misma semana ISO determina el año ISO.
  const dayNum = (d.getDay() + 6) % 7; // lunes = 0
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayNum + 3);
  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstThursdayDayNum = (firstThursday.getDay() + 6) % 7;
  const week1Thursday = new Date(isoYear, 0, 4 - firstThursdayDayNum + 3);
  const week = 1 + Math.round((thursday.getTime() - week1Thursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Rango [inicio, fin) en ms de una semana ISO (lunes 00:00 local). Null si el id no es válido. */
export function getIsoWeekRange(weekKey: string): { start: number; end: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(year, 0, 4);
  const jan4DayNum = (jan4.getDay() + 6) % 7;
  const start = new Date(year, 0, 4 - jan4DayNum + (week - 1) * 7);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start: start.getTime(), end: end.getTime() };
}

/**
 * Reto de la semana: mismo id de semana y misma lista de retos activos → mismo reto en todos los dispositivos.
 * Nota: si el admin cambia la lista activa a mitad de semana, el reto de esa semana puede cambiar.
 */
export function pickWeeklyChallenge(
  weekKey: string,
  list: readonly WeeklyChallengeConfig[] = WEEKLY_CHALLENGES
): WeeklyChallengeDef {
  const active = getActiveWeeklyChallenges(list);
  let h = 2166136261;
  for (let i = 0; i < weekKey.length; i++) {
    h ^= weekKey.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const c = active[h % active.length];
  return { ...c, unit: weeklyChallengeUnit(c.metric) };
}

export type WeeklyChallengePart = { label: string; value: number; target: number; unit: WeeklyChallengeDef['unit'] };

export type WeeklyChallengeProgress = {
  weekKey: string;
  challenge: WeeklyChallengeDef;
  /** Progreso principal (km, rutas o curvas según la métrica). */
  progress: number;
  target: number;
  /** Progreso global 0..1 (en `kmAndCurves` es el mínimo de ambas partes). */
  ratio: number;
  completed: boolean;
  ridesInWeek: number;
  /** Desglose por partes; en retos de una sola métrica hay una única parte. */
  parts: WeeklyChallengePart[];
  /** Texto de lo que falta, p. ej. "Faltan 12 km y 5 curvas". */
  remainingText: string;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','));

/** Evalúa el reto de una semana con los rides del usuario (se filtran por endTime dentro de la semana). */
export function evaluateWeeklyChallenge(
  weekKey: string,
  rides: WeeklyRideInput[],
  list: readonly WeeklyChallengeConfig[] = WEEKLY_CHALLENGES
): WeeklyChallengeProgress {
  const challenge = pickWeeklyChallenge(weekKey, list);
  const range = getIsoWeekRange(weekKey);
  const inWeek = range
    ? rides.filter((r) => {
        const t = num(r.endTime);
        return t >= range.start && t < range.end;
      })
    : [];

  const sumKm = inWeek.reduce((a, r) => a + rideKm(r), 0);
  const sumCurves = inWeek.reduce((a, r) => a + rideCurves(r), 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const unit = challenge.unit;
  const countIf = (pred: (r: WeeklyRideInput) => boolean) => inWeek.reduce((a, r) => a + (pred(r) ? 1 : 0), 0);

  let parts: WeeklyChallengePart[];
  switch (challenge.metric) {
    case 'km':
      parts = [{ label: 'km', value: r1(sumKm), target: challenge.target, unit }];
      break;
    case 'groupKm':
      parts = [
        {
          label: 'km en grupo',
          value: r1(inWeek.reduce((a, r) => a + (isGroupRide(r) ? rideKm(r) : 0), 0)),
          target: challenge.target,
          unit,
        },
      ];
      break;
    case 'curves':
      parts = [{ label: 'curvas', value: sumCurves, target: challenge.target, unit }];
      break;
    case 'rides':
      parts = [{ label: 'rutas', value: inWeek.length, target: challenge.target, unit }];
      break;
    case 'leanRides': {
      const min = challenge.minLean ?? 35;
      parts = [{ label: 'rutas con inclinación', value: countIf((r) => rideMaxLean(r) >= min), target: challenge.target, unit }];
      break;
    }
    case 'longRides': {
      const min = challenge.minKm ?? 80;
      parts = [{ label: 'rutas largas', value: countIf((r) => rideKm(r) >= min), target: challenge.target, unit }];
      break;
    }
    case 'kmAndCurves':
      parts = [
        { label: 'km', value: r1(sumKm), target: challenge.target, unit: 'km' },
        { label: 'curvas', value: sumCurves, target: challenge.targetCurves ?? 1, unit: 'curvas' },
      ];
      break;
  }

  const ratios = parts.map((p) => (p.target > 0 ? Math.min(1, p.value / p.target) : 1));
  const ratio = Math.min(...ratios);
  const completed = parts.every((p) => p.value >= p.target);
  const missing = parts
    .filter((p) => p.value < p.target)
    .map((p) => `${fmt(Math.max(0, Math.round((p.target - p.value) * 10) / 10))} ${p.unit}`);
  const remainingText = completed
    ? 'Objetivo alcanzado'
    : `Faltan ${missing.join(' y ')}`;

  const main = parts[0];
  return {
    weekKey,
    challenge,
    progress: main.value,
    target: main.target,
    ratio,
    completed,
    ridesInWeek: inWeek.length,
    parts,
    remainingText,
  };
}

/**
 * ¿Se puede cobrar la recompensa de esta semana? Falso si ya consta en Firestore
 * (`weeklyChallengeLastClaimed`) o en la copia local.
 */
export function canClaimWeeklyReward(
  weekKey: string,
  lastClaimedInDb: unknown,
  localClaimedWeeks: readonly string[] = []
): boolean {
  if (typeof lastClaimedInDb === 'string' && lastClaimedInDb === weekKey) return false;
  if (localClaimedWeeks.includes(weekKey)) return false;
  return true;
}

export const WEEKLY_CLAIMS_LOCAL_STORAGE_KEY = 'motoride_weekly_claims_v1';

/** Lectura tolerante de las semanas cobradas en este dispositivo. */
export function readLocalClaimedWeeks(uid: string): string[] {
  try {
    const raw = localStorage.getItem(`${WEEKLY_CLAIMS_LOCAL_STORAGE_KEY}:${uid}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(-12) : [];
  } catch {
    return [];
  }
}

export function rememberLocalClaimedWeek(uid: string, weekKey: string): void {
  try {
    const next = [...readLocalClaimedWeeks(uid).filter((w) => w !== weekKey), weekKey].slice(-12);
    localStorage.setItem(`${WEEKLY_CLAIMS_LOCAL_STORAGE_KEY}:${uid}`, JSON.stringify(next));
  } catch {
    /* almacenamiento no disponible: la comprobación de Firestore sigue activa */
  }
}
