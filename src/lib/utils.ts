import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Duración estimada de ruta (OSRM da segundos → ya convertido a minutos en el estado). */
export function formatDurationHoursMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min} min`;
  if (min === 0) return `${h} h`;
  return `${h} h ${min} min`;
}

/**
 * Niveles: cada **1000 puntos** subes **1 nivel** (no hay tope máximo).
 * - Nivel 1 → 0–999 pts, nivel 2 → 1000–1999, nivel 3 → 2000–2999, etc.
 * - Fórmula: `nivel = floor(puntos / 1000) + 1`.
 * Al subir, el perfil guarda `level` coherente con `points` y la barra del header muestra el progreso dentro del tramo actual (hasta el siguiente múltiplo de 1000).
 */
export function calculateLevel(totalPoints: number) {
  const safePoints = Math.max(0, Number(totalPoints) || 0);
  const level = Math.floor(safePoints / 1000) + 1;
  const prevLevelPoints = (level - 1) * 1000;
  const pointsForNextLevel = level * 1000;
  const remainingPoints = safePoints - prevLevelPoints;
  return { level, pointsForNextLevel, prevLevelPoints, remainingPoints };
}
