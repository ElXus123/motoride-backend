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

function totalCurves(u: UserMedalStats): number {
  return num(u.totalLeftTurns) + num(u.totalRightTurns);
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
    id: 'rides_5',
    title: 'Cinco tiradas',
    subtitle: '5 rutas completadas con grabación.',
    ring: '#57534e',
    core: '#1c1917',
    accent: '#d6d3d1',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 5,
  },
  {
    id: 'rides_25',
    title: 'Calendario rodante',
    subtitle: '25 rutas completadas.',
    ring: '#0369a1',
    core: '#0c4a6e',
    accent: '#7dd3fc',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 25,
  },
  {
    id: 'rides_100',
    title: 'Cien salidas',
    subtitle: '100 rutas completadas.',
    ring: '#1d4ed8',
    core: '#172554',
    accent: '#bfdbfe',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 100,
  },
  {
    id: 'km_25',
    title: 'Rueda en marcha',
    subtitle: '25 km acumulados en perfil.',
    ring: '#92400e',
    core: '#292524',
    accent: '#fdba74',
    isUnlocked: (u) => num(u.totalDistance) >= 25,
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
    id: 'km_300',
    title: 'Tramo serio',
    subtitle: '300 km acumulados.',
    ring: '#15803d',
    core: '#052e16',
    accent: '#86efac',
    isUnlocked: (u) => num(u.totalDistance) >= 300,
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
    id: 'km_750',
    title: 'Maletero viajero',
    subtitle: '750 km acumulados.',
    ring: '#7c2d12',
    core: '#292524',
    accent: '#fca5a5',
    isUnlocked: (u) => num(u.totalDistance) >= 750,
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
    id: 'km_1500',
    title: 'Motor templado',
    subtitle: '1.500 km acumulados.',
    ring: '#9d174d',
    core: '#4c0519',
    accent: '#fbcfe8',
    isUnlocked: (u) => num(u.totalDistance) >= 1500,
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
    id: 'km_5000',
    title: 'Leyenda del asfalto',
    subtitle: '5.000 km acumulados.',
    ring: '#fbbf24',
    core: '#422006',
    accent: '#fef9c3',
    isUnlocked: (u) => num(u.totalDistance) >= 5000,
  },
  {
    id: 'combo_asphalt_mule',
    title: 'Mula de asfalto',
    subtitle: '200 km y 10 rutas: constancia.',
    ring: '#44403c',
    core: '#0c0a09',
    accent: '#a8a29e',
    isUnlocked: (u) => num(u.totalDistance) >= 200 && num(u.ridesCompletedCount) >= 10,
  },
  {
    id: 'combo_silver_road',
    title: 'Ruta plateada',
    subtitle: '800 km y 40 rutas.',
    ring: '#94a3b8',
    core: '#0f172a',
    accent: '#f1f5f9',
    isUnlocked: (u) => num(u.totalDistance) >= 800 && num(u.ridesCompletedCount) >= 40,
  },
  {
    id: 'combo_gold_odyssey',
    title: 'Odisea dorada',
    subtitle: '2.000 km y 75 rutas.',
    ring: '#ca8a04',
    core: '#422006',
    accent: '#fef08a',
    isUnlocked: (u) => num(u.totalDistance) >= 2000 && num(u.ridesCompletedCount) >= 75,
  },
  {
    id: 'combo_curve_hunter',
    title: 'Cazador de apex',
    subtitle: '150 curvas y 300 km.',
    ring: '#7c3aed',
    core: '#2e1065',
    accent: '#ddd6fe',
    isUnlocked: (u) => totalCurves(u) >= 150 && num(u.totalDistance) >= 300,
  },
  {
    id: 'lean_30',
    title: 'Tumbada clásica',
    subtitle: 'Inclinación máxima ≥ 30°.',
    ring: '#fb923c',
    core: '#431407',
    accent: '#ffedd5',
    isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 30,
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
    id: 'lean_55',
    title: 'Línea de carreras',
    subtitle: 'Inclinación máxima ≥ 55° (solo en entorno seguro).',
    ring: '#dc2626',
    core: '#450a0a',
    accent: '#fecaca',
    isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 55,
  },
  {
    id: 'curves_25',
    title: 'Primeras eses',
    subtitle: '25 curvas contabilizadas.',
    ring: '#4d7c0f',
    core: '#1a2e05',
    accent: '#d9f99d',
    isUnlocked: (u) => totalCurves(u) >= 25,
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
    id: 'flash_tortuga',
    title: 'Flash tortuga',
    subtitle: 'Con muestra GPS: tu máximo vitalicio sigue por debajo de 90 km/h.',
    ring: '#14b8a6',
    core: '#042f2e',
    accent: '#99f6e4',
    isUnlocked: (u) =>
      bool(u.statsHadSpeedSample) && num(u.statsMaxSpeedKmh) > 0 && num(u.statsMaxSpeedKmh) < 90,
  },
  {
    id: 'speed_80',
    title: 'Club 80',
    subtitle: 'Alguna vez marcaste ≥ 80 km/h en GPS (vía adecuada).',
    ring: '#3b82f6',
    core: '#172554',
    accent: '#bfdbfe',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 80,
  },
  {
    id: 'speed_100',
    title: 'Tonelada horaria',
    subtitle: 'Máximo GPS ≥ 100 km/h.',
    ring: '#2563eb',
    core: '#1e3a8a',
    accent: '#dbeafe',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 100,
  },
  {
    id: 'speed_150',
    title: 'Huracán asfáltico',
    subtitle: 'Máximo GPS ≥ 150 km/h (autopista / circuito).',
    ring: '#f97316',
    core: '#431407',
    accent: '#ffedd5',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 150,
  },
  {
    id: 'curves_100',
    title: 'Tejedora de curvas',
    subtitle: '100 curvas contabilizadas (I + D).',
    ring: '#6366f1',
    core: '#1e1b4b',
    accent: '#c7d2fe',
    isUnlocked: (u) => totalCurves(u) >= 100,
  },
  {
    id: 'curves_500',
    title: 'Leyenda de curvas',
    subtitle: '500 curvas contabilizadas.',
    ring: '#ec4899',
    core: '#500724',
    accent: '#fbcfe8',
    isUnlocked: (u) => totalCurves(u) >= 500,
  },
  {
    id: 'curves_250',
    title: 'Pasajero de curva',
    subtitle: '250 curvas contabilizadas.',
    ring: '#8b5cf6',
    core: '#2e1065',
    accent: '#ede9fe',
    isUnlocked: (u) => totalCurves(u) >= 250,
  },
  {
    id: 'curves_1000',
    title: 'Dibujante de S',
    subtitle: '1.000 curvas contabilizadas.',
    ring: '#db2777',
    core: '#500724',
    accent: '#fce7f3',
    isUnlocked: (u) => totalCurves(u) >= 1000,
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
    id: 'level_15',
    title: 'Sube marchas XV',
    subtitle: 'Alcanza el nivel 15.',
    ring: '#059669',
    core: '#022c22',
    accent: '#a7f3d0',
    isUnlocked: (u) => effectiveLevel(u) >= 15,
  },
  {
    id: 'level_20',
    title: 'Sube marchas XX',
    subtitle: 'Alcanza el nivel 20.',
    ring: '#ea580c',
    core: '#431407',
    accent: '#fed7aa',
    isUnlocked: (u) => effectiveLevel(u) >= 20,
  },
  {
    id: 'level_25',
    title: 'Sube marchas XXV',
    subtitle: 'Alcanza el nivel 25.',
    ring: '#e11d48',
    core: '#4c0519',
    accent: '#fecdd3',
    isUnlocked: (u) => effectiveLevel(u) >= 25,
  },
  {
    id: 'compass_rose',
    title: 'Rosa de los vientos',
    subtitle: '100 curvas y 15 rutas: trazas variadas.',
    ring: '#0f766e',
    core: '#042f2e',
    accent: '#5eead4',
    isUnlocked: (u) => totalCurves(u) >= 100 && num(u.ridesCompletedCount) >= 15,
  },
  {
    id: 'pilgrim_moto',
    title: 'Peregrino motorizado',
    subtitle: '1.000 km y 20 rutas.',
    ring: '#a16207',
    core: '#422006',
    accent: '#fef08a',
    isUnlocked: (u) => num(u.totalDistance) >= 1000 && num(u.ridesCompletedCount) >= 20,
  },
  {
    id: 'chain_master',
    title: 'Maestro de cadena',
    subtitle: '50 rutas y 400 km: ritual de mantenimiento.',
    ring: '#52525b',
    core: '#18181b',
    accent: '#e4e4e7',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 50 && num(u.totalDistance) >= 400,
  },
  {
    id: 'coffee_loop',
    title: 'Ruta del café',
    subtitle: '10 rutas y al menos 80 km: salidas cortas pero seguidas.',
    ring: '#78350f',
    core: '#292524',
    accent: '#fde68a',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 10 && num(u.totalDistance) >= 80,
  },
  {
    id: 'mirror_polish',
    title: 'Cromado vivo',
    subtitle: '300 curvas y 600 km: brillo en cada giro.',
    ring: '#94a3b8',
    core: '#0f172a',
    accent: '#f8fafc',
    isUnlocked: (u) => totalCurves(u) >= 300 && num(u.totalDistance) >= 600,
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
