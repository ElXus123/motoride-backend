import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export type PointsConfig = {
  baseMultiplier: number;
  distanceMultiplier: number;
  eventMultiplier: number;
  activeEvents: Array<{ id: string; name: string; multiplier: number }>;
};

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
