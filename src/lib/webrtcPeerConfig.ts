import { SOCKET_BASE_URL } from './socket';
import { auth } from '../firebase';

/**
 * Configuración RTCPeerConnection para simple-peer (voz grupal).
 *
 * Solo con STUN, la voz falla a menudo con datos móviles (NAT de operador): hace falta TURN.
 * Fuentes de servidores ICE, en orden:
 *  1. `GET {servidor socket}/ice-servers` → credenciales TURN temporales (Cloudflare TURN u otras,
 *     configuradas en el backend; así las claves nunca van en el front).
 *  2. `VITE_WEBRTC_ICE_SERVERS` (JSON) en el build.
 *  3. STUN públicos de Google.
 */

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let remoteIceServers: RTCIceServer[] | null = null;
let remoteIceExpiresAt = 0;
let inflight: Promise<void> | null = null;

function envIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RTCIceServer => !!item && typeof item === 'object' && 'urls' in item);
  } catch {
    console.warn('VITE_WEBRTC_ICE_SERVERS no es JSON válido; se ignora.');
    return [];
  }
}

function normalizeIceList(data: unknown): RTCIceServer[] {
  const list = (data && typeof data === 'object' && 'iceServers' in data
    ? (data as { iceServers: unknown }).iceServers
    : data) as unknown;
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return arr.filter((s): s is RTCIceServer => !!s && typeof s === 'object' && 'urls' in s);
}

/**
 * Pide credenciales TURN al backend (cacheadas ~1 h). Nunca lanza: si falla, se sigue con STUN.
 * Llamar antes de crear peers (al activar la voz).
 */
/** 12 s: con Render dormido la primera petición puede tardar más de 4 s (y sin TURN la voz 4G falla). */
export function preloadIceServers(timeoutMs = 12000): Promise<void> {
  if (remoteIceServers && Date.now() < remoteIceExpiresAt) return Promise.resolve();
  if (inflight) return inflight;
  const base = (SOCKET_BASE_URL || window.location.origin).replace(/\/+$/, '');
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  inflight = (async () => {
    // El backend exige ID token de Firebase: sin sesión no hay TURN remoto (se sigue con STUN).
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (!token) return null;
    const r = await fetch(`${base}/ice-servers`, {
      signal: ctrl.signal,
      credentials: 'omit',
      headers: { Authorization: `Bearer ${token}` },
    });
    return r.ok ? r.json() : null;
  })()
    .then((json) => {
      const list = normalizeIceList(json);
      if (list.length) {
        remoteIceServers = list;
        remoteIceExpiresAt = Date.now() + 60 * 60 * 1000;
      }
    })
    .catch(() => {
      /* sin TURN remoto: seguimos con STUN */
    })
    .finally(() => {
      window.clearTimeout(t);
      inflight = null;
    });
  return inflight;
}

export function getWebRtcPeerConfig(): RTCConfiguration {
  return {
    iceServers: [...DEFAULT_STUN, ...envIceServers(), ...(remoteIceServers ?? [])],
    iceCandidatePoolSize: 4,
  };
}
