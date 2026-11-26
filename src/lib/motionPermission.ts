/**
 * Permiso único de sensores de movimiento (DeviceOrientation / DeviceMotion).
 *
 * - iOS 13+ exige `requestPermission()` tras un gesto del usuario. Una vez concedido, no hace
 *   falta volver a llamarlo: lo recordamos en localStorage y no se vuelve a preguntar en cada ruta.
 * - Android / escritorio no tienen `requestPermission`: se considera concedido sin preguntar.
 * - Si el usuario lo deniega, no insistimos en cada ruta (`automatic` devuelve 'denied' sin
 *   mostrar nada). El reintento manual (botón en ajustes del mapa) fuerza la petición.
 *
 * Este módulo es el ÚNICO sitio que llama a requestPermission. Los hooks delegan aquí.
 */

export type MotionPermissionResult = 'granted' | 'denied' | 'prompt-needed';

/** Decisión recordada: 'granted' | 'denied'. Ausente = nunca preguntado (o no se pudo guardar). */
export const MOTION_PERMISSION_STORAGE_KEY = 'motoride_motion_permission_v1';

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>;

function getPermissionFns(): { DO?: PermissionFn; DM?: PermissionFn } {
  if (typeof window === 'undefined') return {};
  const DO = (globalThis as unknown as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } })
    .DeviceOrientationEvent;
  const DM = (globalThis as unknown as { DeviceMotionEvent?: { requestPermission?: PermissionFn } })
    .DeviceMotionEvent;
  return {
    DO: typeof DO?.requestPermission === 'function' ? DO.requestPermission.bind(DO) : undefined,
    DM: typeof DM?.requestPermission === 'function' ? DM.requestPermission.bind(DM) : undefined,
  };
}

/** true si el navegador exige pedir permiso explícito (iOS Safari y similares). */
export function motionPermissionApiExists(): boolean {
  const { DO, DM } = getPermissionFns();
  return Boolean(DO || DM);
}

/** Lee la decisión recordada. Devuelve null si no hay nada guardado o localStorage falla. */
export function readStoredMotionPermission(): 'granted' | 'denied' | null {
  try {
    const v = window.localStorage.getItem(MOTION_PERMISSION_STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

function storeMotionPermission(v: 'granted' | 'denied'): void {
  try {
    window.localStorage.setItem(MOTION_PERMISSION_STORAGE_KEY, v);
  } catch {
    /* modo privado: se volverá a preguntar, sin romper nada */
  }
}

/** Borra la decisión (p. ej. para que el usuario pueda reconfigurar desde ajustes). */
export function clearStoredMotionPermission(): void {
  try {
    window.localStorage.removeItem(MOTION_PERMISSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Punto único de petición de permiso.
 * @param manual true solo desde un botón explícito del usuario (reintento tras denegar).
 *               En cualquier otro caso, una decisión 'denied' guardada no vuelve a pedirse.
 */
export async function requestMotionPermission(opts: { manual?: boolean } = {}): Promise<MotionPermissionResult> {
  if (!motionPermissionApiExists()) return 'granted';

  const stored = readStoredMotionPermission();
  if (stored === 'granted') return 'granted';
  if (stored === 'denied' && !opts.manual) return 'denied';

  const { DO, DM } = getPermissionFns();
  try {
    if (DO) {
      const s = await DO();
      if (s !== 'granted') {
        storeMotionPermission('denied');
        return 'denied';
      }
    }
    if (DM) {
      try {
        await DM();
      } catch {
        /* algunos WebKit no implementan DeviceMotion aparte: no es fatal */
      }
    }
    storeMotionPermission('granted');
    return 'granted';
  } catch (err) {
    // Sin gesto de usuario iOS lanza error: no es una denegación, solo "pregunta pendiente".
    console.warn('Permiso de movimiento pendiente de gesto del usuario:', err);
    return 'prompt-needed';
  }
}
