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

export {
  calculateLevel,
  addPointsWithLevelUps,
  levelFromStored,
  POINTS_PER_LEVEL,
} from './levelProgress';
