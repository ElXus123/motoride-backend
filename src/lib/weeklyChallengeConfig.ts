import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { parseWeeklyChallengeConfig, WEEKLY_CHALLENGES, type WeeklyChallengeConfig } from './weeklyChallenges';

/**
 * Lee los retos editables de Firestore (colección `weeklyChallenges`, un documento por reto).
 * - Si la colección está vacía, no se puede leer o falla, devuelve WEEKLY_CHALLENGES (valores por defecto).
 * - Cache en memoria 5 min (solo si la lectura tuvo éxito) para no repetir lecturas al cambiar de vista.
 * - Los documentos mal formados se ignoran.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; list: WeeklyChallengeConfig[] } | null = null;

export async function loadWeeklyChallengeConfig(force = false): Promise<WeeklyChallengeConfig[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.list;
  try {
    const snap = await getDocs(collection(db, 'weeklyChallenges'));
    const list = snap.docs
      .map((d) => parseWeeklyChallengeConfig(d.id, d.data()))
      .filter((c): c is WeeklyChallengeConfig => c !== null);
    const result = list.length > 0 ? list : WEEKLY_CHALLENGES;
    cache = { at: Date.now(), list: result };
    return result;
  } catch (err) {
    console.warn('weeklyChallenges: usando retos por defecto', err);
    return WEEKLY_CHALLENGES;
  }
}

/** Invalida la cache (p. ej. tras guardar desde el panel de admin en esta misma sesión). */
export function clearWeeklyChallengeConfigCache(): void {
  cache = null;
}
