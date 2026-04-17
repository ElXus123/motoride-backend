import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { app, auth, db } from '../firebase';

const VAPID_KEY = (import.meta as ImportMeta & { env?: { VITE_FIREBASE_VAPID_KEY?: string } }).env
  ?.VITE_FIREBASE_VAPID_KEY;

async function fcmTokenDocId(token: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(token);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `t_${String(token.length)}_${token.slice(-32)}`;
  }
}

/**
 * Registra el token FCM web y lo guarda en Firestore para push en segundo plano (Cloud Functions).
 * Requiere `VITE_FIREBASE_VAPID_KEY` (Firebase Console → Cloud Messaging → certificados Web Push).
 */
export async function registerWebPushFcm(userUid: string): Promise<boolean> {
  if (!userUid || typeof window === 'undefined') return false;
  if (!VAPID_KEY || VAPID_KEY.length < 20) return false;
  try {
    const ok = await isSupported();
    if (!ok) return false;
  } catch {
    return false;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

  try {
    const messaging = getMessaging(app);
    const reg =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    if (!token) return false;
    const id = await fcmTokenDocId(token);
    await setDoc(
      doc(db, 'users', userUid, 'fcmTokens', id),
      {
        token,
        createdAt: Date.now(),
        ua: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 240) : '',
      },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('registerWebPushFcm:', e);
    return false;
  }
}

/** Elimina tokens en Firestore y revoca el token local de FCM (p. ej. al cerrar sesión). */
let foregroundUnsubscribe: (() => void) | null = null;

/**
 * Con la app en primer plano, FCM no muestra sola la notificación del sistema en muchos navegadores;
 * repetimos el aviso con la Web Notifications API si hay permiso.
 */
export function startForegroundFcmListeners(): void {
  if (typeof window === 'undefined') return;
  void (async () => {
    try {
      foregroundUnsubscribe?.();
      foregroundUnsubscribe = null;
      if (!(await isSupported())) return;
      const messaging = getMessaging(app);
      foregroundUnsubscribe = onMessage(messaging, (payload) => {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const title =
          payload.notification?.title || (typeof payload.data?.title === 'string' ? payload.data.title : '') || 'MotoRide';
        const body =
          payload.notification?.body || (typeof payload.data?.body === 'string' ? payload.data.body : '') || '';
        const tag = typeof payload.data?.tag === 'string' ? payload.data.tag : 'motoride';
        const origin = typeof window.location?.origin === 'string' ? window.location.origin : '';
        const icon = origin ? `${origin}/icon-192.png` : undefined;
        try {
          void new Notification(title, { body, tag, icon, lang: 'es' });
        } catch {
          /* ignore */
        }
      });
    } catch (e) {
      console.warn('startForegroundFcmListeners:', e);
    }
  })();
}

export function stopForegroundFcmListeners(): void {
  try {
    foregroundUnsubscribe?.();
  } catch {
    /* ignore */
  }
  foregroundUnsubscribe = null;
}

export async function removeWebPushForCurrentUser(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || typeof window === 'undefined') return;
  try {
    const ok = await isSupported().catch(() => false);
    if (ok) {
      try {
        const messaging = getMessaging(app);
        await deleteToken(messaging).catch(() => {});
      } catch {
        /* ignore */
      }
    }
    const snap = await getDocs(collection(db, 'users', uid, 'fcmTokens'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch (e) {
    console.warn('removeWebPushForCurrentUser:', e);
  }
}
