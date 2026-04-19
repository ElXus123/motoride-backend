/**
 * Configuración RTCPeerConnection para simple-peer (voz grupal).
 * STUN por defecto + opcional JSON en VITE_WEBRTC_ICE_SERVERS (p. ej. TURN propio).
 */
export function getWebRtcPeerConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const raw = import.meta.env.VITE_WEBRTC_ICE_SERVERS as string | undefined;
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && 'urls' in item) {
            servers.push(item as RTCIceServer);
          }
        }
      }
    } catch {
      console.warn('VITE_WEBRTC_ICE_SERVERS no es JSON válido; se usan solo STUN por defecto.');
    }
  }
  return {
    iceServers: servers,
    iceCandidatePoolSize: 4,
  };
}
