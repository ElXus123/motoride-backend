import { doc, getDoc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { POINTS_PER_LEVEL } from './utils';

/**
 * Lee puntos y nivel desde el servidor, recalcula el nivel según puntos y,
 * si hace falta, escribe solo `points` y `level` en `users/{uid}`.
 */
export async function syncUserPointsAndLevelFromServer(uid: string): Promise<boolean> {
  const ref = doc(db, 'users', uid);
  let snap;
  try {
    snap = await getDocFromServer(ref);
  } catch {
    try {
      snap = await getDoc(ref);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `users/${uid}`);
      return false;
    }
  }

  if (!snap.exists()) return false;

  const data = snap.data() as Record<string, unknown>;
  const rawPoints = Number(data.points ?? 0);
  const rawLevel = Number(data.level ?? 1);

  try {
    if (!Number.isFinite(rawPoints)) {
      await updateDoc(ref, { points: 0, level: 1 });
      return true;
    }

    const safePoints = Math.max(0, Math.floor(rawPoints));
    const storedLevel = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : 1;

    /** Migración: antes `points` era total acumulado (≥1000 posible); ahora es progreso 0–999 y el nivel sube al completar 1000. */
    let nextPoints = safePoints;
    let nextLevel = storedLevel;
    if (safePoints >= POINTS_PER_LEVEL) {
      nextLevel = Math.floor(safePoints / POINTS_PER_LEVEL) + 1;
      nextPoints = safePoints % POINTS_PER_LEVEL;
    }

    const pointsDirty = nextPoints !== safePoints;
    const levelDirty = nextLevel !== storedLevel;

    if (pointsDirty || levelDirty) {
      await updateDoc(ref, { points: nextPoints, level: nextLevel });
      return true;
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
  }

  return false;
}
