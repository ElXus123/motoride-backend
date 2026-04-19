/**
 * Medallas / logros para MotoRide.
 */

import { calculateLevel } from './utils';

export type UserMedalStats = {
  totalDistance?: number;
  totalLeftTurns?: number;
  totalRightTurns?: number;
  statsMaxSpeedKmh?: number;
  statsMaxLeanDeg?: number;
  ridesCompletedCount?: number;
  statsHadSpeedSample?: boolean;
  level?: number;
  points?: number;
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
  return num(u.totalLeftTurns || 0) + num(u.totalRightTurns || 0);
}

export type MedalDefinition = {
  id: string;
  title: string;
  subtitle: string;
  ring: string;
  core: string;
  accent: string;
  isUnlocked: (u: UserMedalStats) => boolean;
};

export function getMedalIcon(id: string) {
  return 'star';
}

/**
 * Medallas / logros reorganizados por categoría.
 * Cada medalla tiene un diseño consistente: anillo + centro + acento.
 */
export const MEDAL_DEFINITIONS: MedalDefinition[] = [
  /* ─────────────────────────────────────────────────────
     🏁 CAT: Inicio - Los primeros pasos
   ───────────────────────────────────────────────────── */
  { id: 'first_ride', title: 'Primer rodaje', subtitle: 'Tu primera ruta terminada.', ring: '#f97316', core: '#18181b', accent: '#fdba74', isUnlocked: (u) => num(u.ridesCompletedCount) >= 1 },
  { id: 'ten_rides', title: 'Décima vuelta', subtitle: '10 rutas dominadas.', ring: '#64748b', core: '#0f172a', accent: '#e2e8f0', isUnlocked: (u) => num(u.ridesCompletedCount) >= 10 },
  { id: 'fifty_rides', title: 'Rodador', subtitle: '50 rutas en asfalto.', ring: '#0ea5e9', core: '#082f49', accent: '#bae6fd', isUnlocked: (u) => num(u.ridesCompletedCount) >= 50 },

  /* ─────────────────────────────────────────────────────
     📏 CAT: Distancia - Kilómetros rodados
   ───────────────────────────────────────────────────── */
  { id: 'twentyfive_km', title: 'Arrancada', subtitle: '25 km en el cuentakilómetros.', ring: '#92400e', core: '#292524', accent: '#fdba74', isUnlocked: (u) => num(u.totalDistance) >= 25 },
  { id: 'fifty_km', title: 'Culiebre', subtitle: '50 km rodados.', ring: '#78716c', core: '#292524', accent: '#fcd34d', isUnlocked: (u) => num(u.totalDistance) >= 50 },
  { id: 'one_hundred_km', title: 'Centuria', subtitle: '100 km bajo la rueda.', ring: '#b45309', core: '#1c1917', accent: '#fde68a', isUnlocked: (u) => num(u.totalDistance) >= 100 },
  { id: 'two_hundred_km', title: 'Ducenta', subtitle: '200 km de pura rueda.', ring: '#0d9488', core: '#042f2e', accent: '#5eead4', isUnlocked: (u) => num(u.totalDistance) >= 200 },
  { id: 'three_hundred_km', title: 'Tramo largo', subtitle: '300 km totales.', ring: '#15803d', core: '#052e16', accent: '#86efac', isUnlocked: (u) => num(u.totalDistance) >= 300 },
  { id: 'five_hundred_km', title: 'Medio millar', subtitle: '500 km de ruta.', ring: '#4f46e5', core: '#1e1b4b', accent: '#a5b4fc', isUnlocked: (u) => num(u.totalDistance) >= 500 },
  { id: 'seven_hundred_fifty_km', title: 'Carga plena', subtitle: '750 km acumulados.', ring: '#7c2d12', core: '#292524', accent: '#fca5a5', isUnlocked: (u) => num(u.totalDistance) >= 750 },
  { id: 'one_thousand_km', title: 'Milenario', subtitle: '1.000 km rodados.', ring: '#be123c', core: '#450a0a', accent: '#fda4af', isUnlocked: (u) => num(u.totalDistance) >= 1000 },
  { id: 'one_thousand_five_hundred_km', title: 'Motor templado', subtitle: '1.500 km de experiencia.', ring: '#9d174d', core: '#4c0519', accent: '#fbcfe8', isUnlocked: (u) => num(u.totalDistance) >= 1500 },
  { id: 'two_thousand_five_hundred_km', title: 'Gran raid', subtitle: '2.500 km en carretera.', ring: '#a855f7', core: '#2e1065', accent: '#e9d5ff', isUnlocked: (u) => num(u.totalDistance) >= 2500 },
  { id: 'five_thousand_km', title: 'Leyenda del asfalto', subtitle: '5.000 km totales.', ring: '#fbbf24', core: '#422006', accent: '#fef9c3', isUnlocked: (u) => num(u.totalDistance) >= 5000 },

  /* ─────────────────────────────────────────────────────
     🔄 CAT: Curvas - Eses y técnica
   ───────────────────────────────────────────────────── */
  { id: 'twentyfive_curves', title: 'Primeras eses', subtitle: '25 curvas superadas.', ring: '#4d7c0f', core: '#1a2e05', accent: '#d9f99d', isUnlocked: (u) => totalCurves(u) >= 25 },
  { id: 'one_hundred_curves', title: 'Tejedora', subtitle: '100 curvas dominadas.', ring: '#6366f1', core: '#1e1b4b', accent: '#c7d2fe', isUnlocked: (u) => totalCurves(u) >= 100 },
  { id: 'two_hundred_fifty_curves', title: 'Pasajero', subtitle: '250 curvas en el libro.', ring: '#8b5cf6', core: '#2e1065', accent: '#ede9fe', isUnlocked: (u) => totalCurves(u) >= 250 },
  { id: 'five_hundred_curves', title: 'Maestro curvas', subtitle: '500 curvas perfectas.', ring: '#ec4899', core: '#500724', accent: '#fbcfe8', isUnlocked: (u) => totalCurves(u) >= 500 },
  { id: 'one_thousand_curves', title: 'Dibujante', subtitle: '1.000 curvas en el ADN.', ring: '#db2777', core: '#500724', accent: '#fce7f3', isUnlocked: (u) => totalCurves(u) >= 1000 },

  /* ─────────────────────────────────────────────────────
     💨 CAT: Velocidad - Aceleración pura
   ───────────────────────────────────────────────────── */
  { id: 'speed_safe', title: 'Conductor prudente', subtitle: 'Nunca superaste 120 km/h.', ring: '#22c55e', core: '#052e16', accent: '#bbf7d0', isUnlocked: (u) => bool(u.statsHadSpeedSample) && num(u.statsMaxSpeedKmh) > 0 && num(u.statsMaxSpeedKmh) < 120 },
  { id: 'speed_over_120', title: 'Crack de velocidad', subtitle: 'Algun día superaste 120 km/h.', ring: '#eab308', core: '#422006', accent: '#fef08a', isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 120 },
  { id: 'speed_turtle', title: 'Tortuga', subtitle: 'Máximo bajo los 90 km/h.', ring: '#14b8a6', core: '#042f2e', accent: '#99f6e4', isUnlocked: (u) => bool(u.statsHadSpeedSample) && num(u.statsMaxSpeedKmh) > 0 && num(u.statsMaxSpeedKmh) < 90 },
  { id: 'club_80', title: 'Club 80', subtitle: 'Superaste 80 km/h.', ring: '#3b82f6', core: '#172554', accent: '#bfdbfe', isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 80 },
  { id: 'speed_hundred', title: 'Tonelada', subtitle: 'Alcanzaste 100 km/h.', ring: '#2563eb', core: '#1e3a8a', accent: '#dbeafe', isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 100 },
  { id: 'huracan', title: 'Huracán', subtitle: 'Superaste 150 km/h.', ring: '#f97316', core: '#431407', accent: '#ffedd5', isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 150 },

  /* ─────────────────────────────────────────────────────
     🏔️ CAT: Inclinación - Técnica extrema
   ───────────────────────────────────────────────────── */
  { id: 'lean_30', title: 'Tumbada', subtitle: 'Inclinación ≥ 30°.', ring: '#fb923c', core: '#431407', accent: '#ffedd5', isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 30 },
  { id: 'lean_epic_45', title: 'Tumbada épica', subtitle: 'Inclinación ≥ 45°.', ring: '#ea580c', core: '#431407', accent: '#fed7aa', isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 45 },
  { id: 'lean_line', title: 'Sobre la línea', subtitle: 'Inclinación ≥ 55°.', ring: '#dc2626', core: '#450a0a', accent: '#fecaca', isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 55 },

  /* ─────────────────────────────────────────────────────
     🔗 CAT: Combinados - Logros múltiples
   ───────────────────────────────────────────────────── */
  { id: 'mule', title: 'Mula', subtitle: '200 km y 10 rutas.', ring: '#44403c', core: '#0c0a09', accent: '#a8a29e', isUnlocked: (u) => num(u.totalDistance) >= 200 && num(u.ridesCompletedCount) >= 10 },
  { id: 'silver_road', title: 'Ruta plateada', subtitle: '800 km y 40 rutas.', ring: '#94a3b8', core: '#0f172a', accent: '#f1f5f9', isUnlocked: (u) => num(u.totalDistance) >= 800 && num(u.ridesCompletedCount) >= 40 },
  { id: 'gold_odyssey', title: 'Odisea dorada', subtitle: '2.000 km y 75 rutas.', ring: '#ca8a04', core: '#422006', accent: '#fef08a', isUnlocked: (u) => num(u.totalDistance) >= 2000 && num(u.ridesCompletedCount) >= 75 },
  { id: 'curve_hunter', title: 'Cazador de curvas', subtitle: '150 curvas y 300 km.', ring: '#7c3aed', core: '#2e1065', accent: '#ddd6fe', isUnlocked: (u) => totalCurves(u) >= 150 && num(u.totalDistance) >= 300 },
  { id: 'compass_rose', title: 'Rosa de los vientos', subtitle: '100 curvas y 15 rutas.', ring: '#0f766e', core: '#042f2e', accent: '#5eead4', isUnlocked: (u) => totalCurves(u) >= 100 && num(u.ridesCompletedCount) >= 15 },
  { id: 'peregrino', title: 'Peregrino', subtitle: '1.000 km y 20 rutas.', ring: '#a16207', core: '#422006', accent: '#fef08a', isUnlocked: (u) => num(u.totalDistance) >= 1000 && num(u.ridesCompletedCount) >= 20 },
  { id: 'chain_master', title: 'Maestro', subtitle: '50 rutas y 400 km.', ring: '#52525b', core: '#18181b', accent: '#e4e4e7', isUnlocked: (u) => num(u.ridesCompletedCount) >= 50 && num(u.totalDistance) >= 400 },
  { id: 'coffee_loop', title: 'Ruta del café', subtitle: '10 rutas y 80 km.', ring: '#78350f', core: '#292524', accent: '#fde68a', isUnlocked: (u) => num(u.ridesCompletedCount) >= 10 && num(u.totalDistance) >= 80 },
  { id: 'mirror_polish', title: 'Cromado', subtitle: '300 curvas y 600 km.', ring: '#94a3b8', core: '#0f172a', accent: '#f8fafc', isUnlocked: (u) => totalCurves(u) >= 300 && num(u.totalDistance) >= 600 },
  { id: 'night_style', title: 'Estilo nocturno', subtitle: '500 km y 25 rutas.', ring: '#312e81', core: '#0f172a', accent: '#a5b4fc', isUnlocked: (u) => num(u.totalDistance) >= 500 && num(u.ridesCompletedCount) >= 25 },

  /* ─────────────────────────────────────────────────────
     🎗️ CAT: Nivel - Progresión personal
   ───────────────────────────────────────────────────── */
  { id: 'level_5', title: 'Nivel V', subtitle: 'Alcanza el nivel 5.', ring: '#d97706', core: '#292524', accent: '#fde68a', isUnlocked: (u) => effectiveLevel(u) >= 5 },
  { id: 'level_10', title: 'Nivel X', subtitle: 'Alcanza el nivel 10.', ring: '#c084fc', core: '#2e1065', accent: '#f3e8ff', isUnlocked: (u) => effectiveLevel(u) >= 10 },
  { id: 'level_15', title: 'Nivel XV', subtitle: 'Alcanza el nivel 15.', ring: '#059669', core: '#022c22', accent: '#a7f3d0', isUnlocked: (u) => effectiveLevel(u) >= 15 },
  { id: 'level_20', title: 'Nivel XX', subtitle: 'Alcanza el nivel 20.', ring: '#ea580c', core: '#431407', accent: '#fed7aa', isUnlocked: (u) => effectiveLevel(u) >= 20 },
  { id: 'level_25', title: 'Nivel XXV', subtitle: 'Alcanza el nivel 25.', ring: '#e11d48', core: '#4c0519', accent: '#fecdd3', isUnlocked: (u) => effectiveLevel(u) >= 25 },

  /* ─────────────────────────────────────────────────────
     🌟 Wildcard
   ───────────────────────────────────────────────────── */
  { id: 'wildcard', title: 'Espíritu libre', subtitle: 'El universo lo decide.', ring: '#0f766e', core: '#042f2e', accent: '#5eead4', isUnlocked: (u) => true },
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

export function sanitizeMedalShowcaseTriple(raw: unknown, user: UserMedalStats | null | undefined): MedalShowcaseTriple {
  const unlocked = new Set(listUnlockedMedalIds(user));
  const t: MedalShowcaseTriple = ['', '', ''];
  if (!Array.isArray(raw)) return t;
  for (let i = 0; i < SHOWCASE_SLOTS; i++) {
    const id = typeof raw[i] === 'string' ? raw[i].trim() : '';
    t[i] = id && unlocked.has(id) ? id : '';
  }
  return t;
}
