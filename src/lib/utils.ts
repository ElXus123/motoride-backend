import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateLevel(totalPoints: number) {
  const safePoints = Math.max(0, Number(totalPoints) || 0);
  const level = Math.floor(safePoints / 1000) + 1;
  const prevLevelPoints = (level - 1) * 1000;
  const pointsForNextLevel = level * 1000;
  const remainingPoints = safePoints - prevLevelPoints;
  return { level, pointsForNextLevel, prevLevelPoints, remainingPoints };
}
