/**
 * Medallas / logros derivados de estadísticas en `users/{uid}`.
 * La vitrina: `profileShowcaseMedalIds` es un array de **3** strings (hueco = "").
 */

import { calculateLevel } from './utils';

export type UserMedalStats = {
  totalDistance?: unknown;
  totalLeftTurns?: unknown;
  totalRightTurns?: unknown;
  statsMaxSpeedKmh?: unknown;
  statsMaxLeanDeg?: unknown;
  ridesCompletedCount?: unknown;
  statsHadSpeedSample?: unknown;
  level?: unknown;
  points?: unknown;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function effectiveLevel(u: UserMedalStats): number {
  const pts = num(u.points);
  const lv = Math.max(1, Math.floor(Number(u.level) || 1));
  try {
    return calculateLevel(pts, lv).level;
  } catch {
    return lv;
  }
}

export type MedalDefinition = {
  id: string;
  title: string;
  subtitle: string;
  /** Colores decorativos (SVG / UI) */
  ring: string;
  core: string;
  accent: string;
  isUnlocked: (u: UserMedalStats) => boolean;
};

export const MEDAL_DEFINITIONS: MedalDefinition[] = [
  {
    id: 'spark_first_ride',
    title: 'Primer chispazo',
    subtitle: 'Completaste tu primera ruta registrada.',
    ring: '#f97316',
    core: '#18181b',
    accent: '#fdba74',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 1,
  },
  {
    id: 'km_50',
    title: '50 km club',
    subtitle: '50 km acumulados en perfil.',
    ring: '#78716c',
    core: '#292524',
    accent: '#fcd34d',
    isUnlocked: (u) => num(u.totalDistance) >= 50,
  },
  {
    id: 'km_100',
    title: 'Centuria',
    subtitle: '100 km acumulados.',
    ring: '#b45309',
    core: '#1c1917',
    accent: '#fde68a',
    isUnlocked: (u) => num(u.totalDistance) >= 100,
  },
  {
    id: 'km_200',
    title: 'Dos centurias',
    subtitle: '200 km acumulados.',
    ring: '#0d9488',
    core: '#042f2e',
    accent: '#5eead4',
    isUnlocked: (u) => num(u.totalDistance) >= 200,
  },
  {
    id: 'km_500',
    title: 'Medio millar',
    subtitle: '500 km acumulados.',
    ring: '#4f46e5',
    core: '#1e1b4b',
    accent: '#a5b4fc',
    isUnlocked: (u) => num(u.totalDistance) >= 500,
  },
  {
    id: 'km_1000',
    title: 'Milenario',
    subtitle: '1.000 km acumulados.',
    ring: '#be123c',
    core: '#450a0a',
    accent: '#fda4af',
    isUnlocked: (u) => num(u.totalDistance) >= 1000,
  },
  {
    id: 'km_2500',
    title: 'Gran raid',
    subtitle: '2.500 km acumulados.',
    ring: '#a855f7',
    core: '#2e1065',
    accent: '#e9d5ff',
    isUnlocked: (u) => num(u.totalDistance) >= 2500,
  },
  {
    id: 'lean_epic_45',
    title: 'Tumbada épica',
    subtitle: 'Inclinación máxima ≥ 45° en alguna ruta.',
    ring: '#ea580c',
    core: '#431407',
    accent: '#fed7aa',
    isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 45,
  },
  {
    id: 'flash_prudente',
    title: 'Flash prudente',
    subtitle: 'Con GPS de velocidad: nunca superaste 120 km/h.',
    ring: '#22c55e',
    core: '#052e16',
    accent: '#bbf7d0',
    isUnlocked: (u) =>
      bool(u.statsHadSpeedSample) && num(u.statsMaxSpeedKmh) > 0 && num(u.statsMaxSpeedKmh) < 120,
  },
  {
    id: 'flash_veloz',
    title: 'Flash velocidad',
    subtitle: 'Alguna vez superaste 120 km/h (circuito cerrado / vía adecuada).',
    ring: '#eab308',
    core: '#422006',
    accent: '#fef08a',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 120,
  },
  {
    id: 'curves_100',
    title: 'Tejedora de curvas',
    subtitle: '100 curvas contabilizadas (I + D).',
    ring: '#6366f1',
    core: '#1e1b4b',
    accent: '#c7d2fe',
    isUnlocked: (u) => num(u.totalLeftTurns) + num(u.totalRightTurns) >= 100,
  },
  {
    id: 'curves_500',
    title: 'Leyenda de curvas',
    subtitle: '500 curvas contabilizadas.',
    ring: '#ec4899',
    core: '#500724',
    accent: '#fbcfe8',
    isUnlocked: (u) => num(u.totalLeftTurns) + num(u.totalRightTurns) >= 500,
  },
  {
    id: 'rides_10',
    title: 'Asfalto fiel',
    subtitle: '10 rutas completadas.',
    ring: '#64748b',
    core: '#0f172a',
    accent: '#e2e8f0',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 10,
  },
  {
    id: 'rides_50',
    title: 'Rodador nato',
    subtitle: '50 rutas completadas.',
    ring: '#0ea5e9',
    core: '#082f49',
    accent: '#bae6fd',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 50,
  },
  {
    id: 'level_5',
    title: 'Sube marchas V',
    subtitle: 'Alcanza el nivel 5.',
    ring: '#d97706',
    core: '#292524',
    accent: '#fde68a',
    isUnlocked: (u) => effectiveLevel(u) >= 5,
  },
  {
    id: 'level_10',
    title: 'Sube marchas X',
    subtitle: 'Alcanza el nivel 10.',
    ring: '#c084fc',
    core: '#2e1065',
    accent: '#f3e8ff',
    isUnlocked: (u) => effectiveLevel(u) >= 10,
  },
  {
    id: 'night_style',
    title: 'Noche en ruta',
    subtitle: '500 km y 25 rutas: constancia nocturna.',
    ring: '#312e81',
    core: '#0f172a',
    accent: '#a5b4fc',
    isUnlocked: (u) => num(u.totalDistance) >= 500 && num(u.ridesCompletedCount) >= 25,
  },
];

const MEDAL_BY_ID: Record<string, MedalDefinition> = Object.fromEntries(MEDAL_DEFINITIONS.map((m) => [m.id, m]));

export function getMedalDefinition(id: string): MedalDefinition | undefined {
  return MEDAL_BY_ID[id];
}

export function listUnlockedMedalIds(user: UserMedalStats | null | undefined): string[] {
  if (!user) return [];
  return MEDAL_DEFINITIONS.filter((m) => m.isUnlocked(user)).map((m) => m.id);
}

const SHOWCASE_SLOTS = 3;

export type MedalShowcaseTriple = [string, string, string];

/** Tres ranuras fijas (cadena vacía = hueco); solo ids desbloqueados. */
export function sanitizeMedalShowcaseTriple(
  raw: unknown,
  user: UserMedalStats | null | undefined
): MedalShowcaseTriple {
  const unlocked = new Set(listUnlockedMedalIds(user));
  const t: MedalShowcaseTriple = ['', '', ''];
  if (!Array.isArray(raw)) return t;
  for (let i = 0; i < SHOWCASE_SLOTS; i++) {
    const id = typeof raw[i] === 'string' ? raw[i].trim() : '';
    t[i] = id && unlocked.has(id) ? id : '';
  }
  return t;
}
