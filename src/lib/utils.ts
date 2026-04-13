import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateLevel(totalPoints: number) {
  const level = Math.floor(totalPoints / 1000) + 1;
  const pointsForNextLevel = level * 1000;
  const remainingPoints = totalPoints % 1000;
  return { level, pointsForNextLevel, remainingPoints };
}
