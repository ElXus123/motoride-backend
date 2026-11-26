/**
 * Progresión de nivel: del nivel L al L+1 hacen falta **L × 1000** puntos en el tramo actual
 * (nivel 1→2: 1000, 2→3: 2000, 3→4: 3000, …).
 *
 * En Firestore: `level` ≥ 1 y `points` = avance en el tramo hacia el siguiente nivel
 * (0 … (level×1000 − 1) mientras no sube).
 */

/** Unidad base de la progresión (solo referencia / textos). */
export const POINTS_LEVEL_UNIT = 1000;

/** @deprecated Usar `pointsToAdvanceFromLevel`; se mantiene por compatibilidad con imports antiguos. */
export const POINTS_PER_LEVEL = POINTS_LEVEL_UNIT;

/** Puntos necesarios en el tramo actual (estando en `level`) para subir a `level + 1`. */
export function pointsToAdvanceFromLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return lv * POINTS_LEVEL_UNIT;
}

/**
 * Aplana desbordes del modelo antiguo (siempre 1000 pts por subida) y devuelve
 * el total de XP acumulado en ese modelo (para migrar a la curva progresiva).
 */
export function legacyFlat1000TotalXp(level: number, points: number): number {
  let L = Math.max(1, Math.floor(Number(level) || 1));
  let P = Math.max(0, Math.floor(Number(points) || 0));
  while (P >= POINTS_LEVEL_UNIT) {
    P -= POINTS_LEVEL_UNIT;
    L += 1;
  }
  return (L - 1) * POINTS_LEVEL_UNIT + P;
}

/**
 * XP total acumulada necesaria para LLEGAR a `level` desde el nivel 1 (0 para nivel 1).
 * Suma de tramos: sum_{L=1}^{level-1} L × 1000 = 1000 × (level−1) × level / 2.
 * La curva NO se ha cambiado: alterarla re-nivelaría a todos los usuarios existentes.
 */
export function cumulativeXpForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return (POINTS_LEVEL_UNIT * (lv - 1) * lv) / 2;
}

/** Descompone un total de XP (economía progresiva) en `(level, points)` normalizados. */
export function decomposeProgressiveTotalXp(totalXp: number): { level: number; points: number } {
  let T = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  for (;;) {
    const need = pointsToAdvanceFromLevel(level);
    if (T < need) {
      return { level, points: T };
    }
    T -= need;
    level += 1;
  }
}

/**
 * Versión del modelo de progreso guardada en `users.progressModel`.
 * 2 = curva progresiva (L×1000 por tramo). Sin campo = modelo antiguo (1000 fijo) pendiente de migrar.
 */
export const PROGRESS_MODEL_VERSION = 2;

/**
 * Normaliza `(level, points)` leídos de Firestore con la curva progresiva.
 * `points` es el progreso dentro del tramo; solo se corrige un desborde (points ≥ level×1000).
 * NO reinterpreta los datos como modelo antiguo: hacerlo bajaba de nivel a los usuarios
 * en cada arranque (L10/9000 pasaba a L6/3000). El marcador `progressModel` se escribe al sincronizar.
 * Para migrar perfiles del modelo fijo de 1000 (antes del bloque 40), usar `migrateFlatLegacyProgress`.
 */
export function normalizeUserProgress(
  storedLevel: number,
  storedPoints: number,
  _progressModel?: unknown
): { level: number; points: number } {
  const lv = Math.max(1, Math.floor(Number(storedLevel) || 1));
  const pts = Math.max(0, Math.floor(Number(storedPoints) || 0));
  return decomposeProgressiveTotalXp(cumulativeXpForLevel(lv) + pts);
}

/** Migración manual del modelo fijo de 1000 puntos por nivel (solo perfiles previos al bloque 40). */
export function migrateFlatLegacyProgress(storedLevel: number, storedPoints: number): { level: number; points: number } {
  return decomposeProgressiveTotalXp(legacyFlat1000TotalXp(storedLevel, storedPoints));
}

export function levelFromStored(pointsInLevel: number, storedLevel: number): number {
  return calculateLevel(pointsInLevel, storedLevel).level;
}

export function calculateLevel(pointsInLevel: number, storedLevel: number) {
  let remaining = Math.max(0, Math.floor(Number(pointsInLevel) || 0));
  let level = Math.max(1, Math.floor(Number(storedLevel) || 1));
  while (remaining >= pointsToAdvanceFromLevel(level)) {
    remaining -= pointsToAdvanceFromLevel(level);
    level += 1;
  }
  const need = pointsToAdvanceFromLevel(level);
  return {
    level,
    pointsForNextLevel: need,
    prevLevelPoints: 0,
    remainingPoints: remaining,
  };
}

/**
 * Suma puntos de una ruta al estado guardado; puede disparar varias subidas de nivel.
 */
export function addPointsWithLevelUps(
  currentPointsInLevel: number,
  currentLevel: number,
  delta: number
): { points: number; level: number } {
  let pts = Math.max(0, Math.floor(Number(currentPointsInLevel) || 0));
  let level = Math.max(1, Math.floor(Number(currentLevel) || 1));
  const add = Math.max(0, Math.floor(Number(delta) || 0));
  pts += add;
  while (pts >= pointsToAdvanceFromLevel(level)) {
    pts -= pointsToAdvanceFromLevel(level);
    level += 1;
  }
  return { points: pts, level };
}
