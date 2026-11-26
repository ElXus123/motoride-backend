import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export type PointsConfig = {
  baseMultiplier: number;
  distanceMultiplier: number;
  eventMultiplier: number;
  activeEvents: Array<{ id: string; name: string; multiplier: number }>;
};

/**
 * Reglas de puntuación por ruta (funciones puras, sin Firestore).
 * Revisión 2026-11: las curvas ya no suman `ceil(pico)` (un zigzag de 16° valía 16 pts)
 * sino tramos fijos por curva, y el km solo cuenta si se avanza de verdad.
 */
export const RIDE_POINTS_RULES = {
  /** Puntos por km recorrido (km cruzado completo). */
  pointsPerKm: 1,
  /** Velocidad GPS mínima (km/h) para sumar km. Por debajo, el jitter del GPS parado no cuenta. */
  minMovingSpeedKmh: 3,
  /** Velocidad mínima (km/h) al ENTRAR en una curva para que la curva puntúe. Evita farmear frenando. */
  curveMinEntrySpeedKmh: 25,
  /** Pico mínimo de inclinación (grados) para que una curva puntúe. */
  curveMinLeanDeg: 25,
  /** Tramos de puntos por curva según el pico de inclinación (de mayor a menor). */
  curveTiers: [
    { minDeg: 45, points: 30 },
    { minDeg: 35, points: 25 },
    { minDeg: 25, points: 20 },
  ] as const,
  /** Bonus de distancia: puntos por cada 100 km completos (se suma al cierre de la ruta). */
  distanceBonusPer100Km: 20,
} as const;

/** Puntos que aporta una curva según su pico de inclinación (0 si no puntúa). */
export function curvePointsForPeak(peakDeg: number): number {
  const peak = Math.abs(Number(peakDeg) || 0);
  if (peak < RIDE_POINTS_RULES.curveMinLeanDeg) return 0;
  for (const tier of RIDE_POINTS_RULES.curveTiers) {
    if (peak >= tier.minDeg) return tier.points;
  }
  return 0;
}

/** Bonus de distancia al cierre de ruta (misma fórmula que MapView). */
export function rideDistanceBonus(distanceKm: number): number {
  const d = Math.max(0, Number(distanceKm) || 0);
  return Math.floor(d / 100) * RIDE_POINTS_RULES.distanceBonusPer100Km;
}

const clampMultiplier = (value: any, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(10, n));
};

export async function getActivePointsConfig(): Promise<PointsConfig> {
  const base: PointsConfig = {
    baseMultiplier: 1,
    distanceMultiplier: 1,
    eventMultiplier: 1,
    activeEvents: []
  };

  try {
    const cfgSnap = await getDoc(doc(db, 'appConfig', 'points'));
    if (cfgSnap.exists()) {
      const data = cfgSnap.data();
      base.baseMultiplier = clampMultiplier(data.baseMultiplier, 1);
      base.distanceMultiplier = clampMultiplier(data.distanceMultiplier, 1);
    }
  } catch {
    // Keep defaults if config cannot be read.
  }

  try {
    const now = Date.now();
    const eventsQ = query(collection(db, 'pointsEvents'), where('active', '==', true));
    const eventsSnap = await getDocs(eventsQ);
    const activeEvents = eventsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((e) => {
        const startAt = Number(e.startAt || 0);
        const endAt = Number(e.endAt || Number.MAX_SAFE_INTEGER);
        return now >= startAt && now <= endAt;
      })
      .map((e) => ({
        id: e.id,
        name: String(e.name || 'Evento'),
        multiplier: clampMultiplier(e.multiplier, 1)
      }));

    base.activeEvents = activeEvents;
    base.eventMultiplier = activeEvents.reduce((acc, e) => acc * e.multiplier, 1);
  } catch {
    // Keep defaults if events cannot be read.
  }

  return base;
}
