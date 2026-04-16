/** Puntos necesarios dentro del nivel actual para subir al siguiente (barra 0→100%). */
export const POINTS_PER_LEVEL = 1000;

/**
 * Nivel y progreso: `points` en Firestore es solo el avance hacia el **siguiente** nivel (0–999).
 * `level` es el nivel actual (1 = primer nivel). Al llegar a 1000 pts de progreso, sube `level` y `points` vuelve a 0.
 */
export function levelFromStored(pointsInLevel: number, storedLevel: number): number {
  const pts = Math.max(0, Math.floor(Number(pointsInLevel) || 0));
  const lv = Math.max(1, Math.floor(Number(storedLevel) || 1));
  if (pts >= POINTS_PER_LEVEL) {
    return lv + Math.floor(pts / POINTS_PER_LEVEL);
  }
  return lv;
}

export function calculateLevel(pointsInLevel: number, storedLevel: number) {
  const ptsRaw = Math.max(0, Number(pointsInLevel) || 0);
  const lvBase = Math.max(1, Math.floor(Number(storedLevel) || 1));
  let level = lvBase;
  let remaining = Math.floor(ptsRaw);
  while (remaining >= POINTS_PER_LEVEL) {
    remaining -= POINTS_PER_LEVEL;
    level += 1;
  }
  const pointsForNextLevel = POINTS_PER_LEVEL;
  const prevLevelPoints = 0;
  return {
    level,
    pointsForNextLevel,
    prevLevelPoints,
    /** Progreso 0–999 hacia el siguiente nivel */
    remainingPoints: remaining,
  };
}

/**
 * Suma puntos de una ruta al estado guardado: puede disparar varias subidas de nivel; devuelve nuevos `points` y `level`.
 */
export function addPointsWithLevelUps(
  currentPointsInLevel: number,
  currentLevel: number,
  delta: number
): { points: number; level: number } {
  let pts = Math.max(0, Math.floor(Number(currentPointsInLevel) || 0));
  let level = Math.max(1, Math.floor(Number(currentLevel) || 1));
  let add = Math.max(0, Math.floor(Number(delta) || 0));
  pts += add;
  while (pts >= POINTS_PER_LEVEL) {
    pts -= POINTS_PER_LEVEL;
    level += 1;
  }
  return { points: pts, level };
}
