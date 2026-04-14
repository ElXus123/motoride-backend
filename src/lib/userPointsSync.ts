import { doc, getDoc, getDocFromServer, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from './utils';

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
    const calculatedLevel = calculateLevel(safePoints).level;
    const storedLevel = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : calculatedLevel;

    const pointsDirty = safePoints !== rawPoints;
    const levelDirty = storedLevel !== calculatedLevel;

    if (pointsDirty || levelDirty) {
      await updateDoc(ref, { points: safePoints, level: calculatedLevel });
      return true;
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
  }

  return false;
}
