/**
 * Marcos de perfil (bordes del avatar) desbloqueables.
 * Reglas: nivel (cada 5 niveles), medallas existentes (achievements.ts), VIP (isPremium) y
 * marco de temporada (retos semanales). Cálculo puro a partir de stats del usuario.
 */

import { listUnlockedMedalIds, type UserMedalStats } from './achievements';
import { calculateLevel } from './levelProgress';

export type FrameTier = 'base' | 'plata' | 'oro' | 'elite';

export type FrameUnlockRule =
  | { type: 'default' }
  | { type: 'level'; level: number }
  | { type: 'medal'; medalId: string }
  | { type: 'premium' }
  | { type: 'weeklyChallenges'; claims: number };

export type FrameDefinition = {
  id: string;
  name: string;
  description: string;
  tier: FrameTier;
  unlock: FrameUnlockRule;
  /** Patrón visual del marco (lo usa AvatarFrame). */
  pattern: 'plain' | 'dashed' | 'knobs' | 'laurel' | 'crown' | 'halo';
  /** Dos colores del degradado del metal: [claro, oscuro]. */
  colors: [string, string];
};

export const NO_FRAME_ID = 'none';

export const FRAME_CATALOG: FrameDefinition[] = [
  { id: 'none', name: 'Sin marco', description: 'Solo el anillo de nivel.', tier: 'base', unlock: { type: 'default' }, pattern: 'plain', colors: ['#71717a', '#27272a'] },
  { id: 'road', name: 'Asfalto', description: 'Línea discontinua de carretera. Disponible desde el inicio.', tier: 'base', unlock: { type: 'level', level: 1 }, pattern: 'dashed', colors: ['#d4d4d8', '#52525b'] },

  { id: 'lvl_5', name: 'Neumático', description: 'Dibujo de neumático. Nivel 5.', tier: 'plata', unlock: { type: 'level', level: 5 }, pattern: 'knobs', colors: ['#e4e4e7', '#71717a'] },
  { id: 'lvl_10', name: 'Visera', description: 'Visera de casco. Nivel 10.', tier: 'plata', unlock: { type: 'level', level: 10 }, pattern: 'plain', colors: ['#fdba74', '#9a3412'] },
  { id: 'lvl_15', name: 'Laurel de ruta', description: 'Laurel de carretera. Nivel 15.', tier: 'oro', unlock: { type: 'level', level: 15 }, pattern: 'laurel', colors: ['#fde68a', '#b45309'] },
  { id: 'lvl_20', name: 'Curva de montaña', description: 'Trazado revirado en oro. Nivel 20.', tier: 'oro', unlock: { type: 'level', level: 20 }, pattern: 'dashed', colors: ['#fcd34d', '#92400e'] },
  { id: 'lvl_25', name: 'Halo de leyenda', description: 'Halo continuo de élite. Nivel 25.', tier: 'elite', unlock: { type: 'level', level: 25 }, pattern: 'halo', colors: ['#c4b5fd', '#5b21b6'] },

  { id: 'chrome_speed', name: 'Cromo', description: 'Cromo de velocímetro. Medalla «Tonelada» (100 km/h).', tier: 'plata', unlock: { type: 'medal', medalId: 'speed_hundred' }, pattern: 'plain', colors: ['#f8fafc', '#64748b'] },
  { id: 'curve_steel', name: 'Acero de curvas', description: 'Acero trenzado. Medalla «Tejedora» (100 curvas).', tier: 'plata', unlock: { type: 'medal', medalId: 'one_hundred_curves' }, pattern: 'knobs', colors: ['#c7d2fe', '#4338ca'] },
  { id: 'ember_lean', name: 'Ascua de inclinación', description: 'Brasas de rodilla. Medalla «Tumbada épica» (45°).', tier: 'oro', unlock: { type: 'medal', medalId: 'lean_epic_45' }, pattern: 'plain', colors: ['#fdba74', '#b91c1c'] },
  { id: 'gold_laurel', name: 'Laurel dorado', description: 'Laurel de odisea. Medalla «Odisea dorada».', tier: 'oro', unlock: { type: 'medal', medalId: 'gold_odyssey' }, pattern: 'laurel', colors: ['#fef08a', '#a16207'] },
  { id: 'legend_asphalt', name: 'Asfalto legendario', description: 'Corona de asfalto. Medalla «Leyenda del asfalto» (5.000 km).', tier: 'elite', unlock: { type: 'medal', medalId: 'five_thousand_km' }, pattern: 'halo', colors: ['#fef9c3', '#a16207'] },

  { id: 'season_pulse', name: 'Temporada', description: 'Marco de temporada: completa 4 retos semanales.', tier: 'oro', unlock: { type: 'weeklyChallenges', claims: 4 }, pattern: 'dashed', colors: ['#67e8f9', '#0e7490'] },
  { id: 'vip_crown', name: 'Corona VIP', description: 'Exclusivo para cuentas VIP.', tier: 'elite', unlock: { type: 'premium' }, pattern: 'crown', colors: ['#fde047', '#b45309'] },
];

const FRAME_BY_ID: Record<string, FrameDefinition> = Object.fromEntries(FRAME_CATALOG.map((f) => [f.id, f]));

/** Lista blanca de ids: las reglas de Firestore deben mantener la misma lista. */
export const ALLOWED_FRAME_IDS: readonly string[] = FRAME_CATALOG.map((f) => f.id);

export type FrameUserStats = UserMedalStats & {
  isPremium?: boolean;
  weeklyChallengeClaims?: number;
};

export function getFrameDefinition(id: string | null | undefined): FrameDefinition | undefined {
  if (!id || !Object.prototype.hasOwnProperty.call(FRAME_BY_ID, id)) return undefined;
  return FRAME_BY_ID[id];
}

export function isFrameUnlocked(id: string, user: FrameUserStats | null | undefined): boolean {
  const frame = getFrameDefinition(id);
  if (!frame || !user) return frame?.unlock.type === 'default';
  const rule = frame.unlock;
  switch (rule.type) {
    case 'default':
      return true;
    case 'level': {
      const lv = calculateLevel(Number(user.points) || 0, Math.max(1, Math.floor(Number(user.level) || 1))).level;
      return lv >= rule.level;
    }
    case 'medal':
      return listUnlockedMedalIds(user).includes(rule.medalId);
    case 'premium':
      return user.isPremium === true;
    case 'weeklyChallenges':
      return (Number(user.weeklyChallengeClaims) || 0) >= rule.claims;
    default:
      return false;
  }
}

/** Ids de marcos desbloqueados para el usuario, en orden de catálogo. */
export function getUnlockedFrameIds(user: FrameUserStats | null | undefined): string[] {
  return FRAME_CATALOG.filter((f) => isFrameUnlocked(f.id, user)).map((f) => f.id);
}

/** Marco equipado válido: si el id guardado no existe o no está desbloqueado, `none`. */
export function getEquippedFrame(user: FrameUserStats | null | undefined, profileFrameId: unknown): FrameDefinition {
  const id = typeof profileFrameId === 'string' ? profileFrameId : NO_FRAME_ID;
  if (id !== NO_FRAME_ID && isFrameUnlocked(id, user)) {
    const frame = getFrameDefinition(id);
    if (frame) return frame;
  }
  return FRAME_BY_ID[NO_FRAME_ID];
}

/** Id seguro para guardar en `users.profileFrameId` (solo desbloqueados). */
export function sanitizeProfileFrameId(raw: unknown, user: FrameUserStats | null | undefined): string {
  return getEquippedFrame(user, raw).id;
}

/**
 * Id de marco de OTRO usuario (payload de ubicación por socket o `users/{uid}` de un amigo).
 * No se puede comprobar su desbloqueo desde aquí: el propietario solo guarda ids ya validados
 * con `sanitizeProfileFrameId`. Aquí basta la lista blanca; ausente o desconocido = `none`.
 */
export function resolvePeerFrameId(raw: unknown): string {
  return typeof raw === 'string' && raw !== NO_FRAME_ID && ALLOWED_FRAME_IDS.includes(raw) ? raw : NO_FRAME_ID;
}
