/**
 * Copia local (localStorage) de los datos mínimos de la ruta activa: trazado GeoJSON, nombre,
 * miembros y estado de grabación. Sirve para seguir las indicaciones si la app se recarga o se
 * reabre sin cobertura y Firestore aún no puede devolver el documento del grupo.
 *
 * Se guarda mientras el grupo está grabando (isRecording) y se borra al terminar la ruta.
 * Los Timestamp de Firestore se pasan a milisegundos (número) al guardar.
 */

export const ACTIVE_ROUTE_SNAPSHOT_KEY = 'motoride_active_route_snapshot_v1';
/** Igual que el reenganche de ruta: pasado este tiempo la copia ya no es fiable. */
const SNAPSHOT_MAX_AGE_MS = 14 * 60 * 60 * 1000;
/** Límite de seguridad para no llenar localStorage (5 MB aprox. por origen). */
const SNAPSHOT_MAX_CHARS = 2_000_000;

type SnapshotEnvelope = { groupId: string; savedAt: number; data: Record<string, unknown> };

function toPlain(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
        return (v as { toMillis: () => number }).toMillis();
      }
      return v;
    })
  );
}

/** Guarda la ruta activa. Ignora grupos sin trazado o que no estén grabando. */
export function saveActiveRouteSnapshot(groupId: string, data: Record<string, unknown> | null | undefined): void {
  if (!groupId || groupId === 'REPEATED' || !data) return;
  if (!data.routeGeoJSON || (data.isRecording !== true && data.ridePaused !== true)) return;
  try {
    const envelope: SnapshotEnvelope = {
      groupId,
      savedAt: Date.now(),
      data: toPlain(data) as Record<string, unknown>,
    };
    const raw = JSON.stringify(envelope);
    if (raw.length > SNAPSHOT_MAX_CHARS) return;
    window.localStorage.setItem(ACTIVE_ROUTE_SNAPSHOT_KEY, raw);
  } catch {
    /* modo privado o cuota llena: la app sigue funcionando sin copia */
  }
}

/** Devuelve los datos guardados del grupo indicado, o null si no hay copia válida. */
export function readActiveRouteSnapshot(groupId: string): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_ROUTE_SNAPSHOT_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Partial<SnapshotEnvelope>;
    if (!env || env.groupId !== groupId || typeof env.savedAt !== 'number' || !env.data) return null;
    if (Date.now() - env.savedAt > SNAPSHOT_MAX_AGE_MS) {
      clearActiveRouteSnapshot();
      return null;
    }
    return env.data as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Borra la copia (fin de ruta, o al salir de la app de ruta). */
export function clearActiveRouteSnapshot(groupId?: string): void {
  try {
    if (groupId) {
      const raw = window.localStorage.getItem(ACTIVE_ROUTE_SNAPSHOT_KEY);
      if (raw && JSON.parse(raw)?.groupId !== groupId) return;
    }
    window.localStorage.removeItem(ACTIVE_ROUTE_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
