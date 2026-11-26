import { io } from 'socket.io-client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase';

/**
 * URL del servidor Socket.IO (Render). Si no se define, se usa el mismo host que la web,
 * lo que en Cloudflare Workers NO funciona (solo sirve estáticos): definir siempre en `.env`.
 */
export const SOCKET_BASE_URL: string | undefined =
  (import.meta.env.VITE_SOCKET_URL as string | undefined)?.trim() || undefined;

/** ID token actual de Firebase (se renueva solo si ha caducado). null si no hay sesión. */
async function currentIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

const socket = io(SOCKET_BASE_URL, {
  // Se conecta solo con sesión iniciada (ver onAuthStateChanged más abajo).
  autoConnect: false,
  /** Función: socket.io la evalúa en CADA conexión y reconexión, así el token nunca caduca. */
  auth: (cb) => {
    currentIdToken().then((token) => cb(token ? { token } : {}));
  },
  reconnection: true,
  reconnectionAttempts: Infinity,
  /** Reintentos más rápidos al principio: microcortes de red suelen recuperarse en <2s. */
  reconnectionDelay: 400,
  reconnectionDelayMax: 8000,
  randomizationFactor: 0.45,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});

/** Conecta si hay sesión y no hay conexión ni intento en curso (evita conexiones duplicadas). */
function connectIfSignedIn(): void {
  if (!auth.currentUser) return;
  if (!socket.connected && !socket.active) socket.connect();
}

if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, (user: User | null) => {
    if (user) connectIfSignedIn();
    else socket.disconnect();
  });
  // El servidor rechaza tokens no válidos sin reintento automático: reintentar con calma.
  socket.on('connect_error', (err: Error) => {
    if (err.message === 'unauthorized' && auth.currentUser) {
      window.setTimeout(connectIfSignedIn, 15000);
    }
  });
}

/**
 * Render (plan gratuito) se duerme sin tráfico y tarda ~30-60 s en volver. Se pide /health al abrir
 * la app y cada 10 min con la pestaña visible, para que el servidor esté despierto cuando se necesite.
 */
export function wakeSocketServer(): void {
  if (typeof window === 'undefined') return;
  const base = (SOCKET_BASE_URL || window.location.origin).replace(/\/+$/, '');
  fetch(`${base}/health`, { cache: 'no-store', credentials: 'omit' }).catch(() => {
    /* se reintentará */
  });
}

if (typeof window !== 'undefined' && SOCKET_BASE_URL) {
  wakeSocketServer();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') wakeSocketServer();
  }, 10 * 60 * 1000);
}

/**
 * iOS/Android congelan o matan el WebSocket en segundo plano sin avisar. Al volver al primer plano
 * o recuperar red, si el socket no está conectado se fuerza la reconexión en vez de esperar al backoff.
 */
if (typeof window !== 'undefined') {
  const kick = () => {
    try {
      connectIfSignedIn();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('online', kick);
  window.addEventListener('pageshow', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') kick();
  });
}

export default socket;
