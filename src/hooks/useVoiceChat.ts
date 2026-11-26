import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import socket from '../lib/socket';
import { getWebRtcPeerConfig, preloadIceServers } from '../lib/webrtcPeerConfig';

const REMOTE_AUDIO_ROOT_ID = 'motoride-remote-audio-root';

/** Si un enlace no llega a conectar en este tiempo se rehace. */
const PEER_CONNECT_TIMEOUT_MS = 20000;
/** Tiempo en «disconnected» antes de rehacer el enlace (ICE a veces se recupera solo). */
const PEER_DISCONNECTED_GRACE_MS = 7000;
const WATCHDOG_MS = 4000;
const MAX_RETRY_DELAY_MS = 15000;

function getOrCreateRemoteAudioRoot(): HTMLElement {
  let el = document.getElementById(REMOTE_AUDIO_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = REMOTE_AUDIO_ROOT_ID;
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText =
      'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;bottom:0;left:0;clip:rect(0,0,0,0);';
    document.body.appendChild(el);
  }
  return el;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function micErrorMessage(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as DOMException).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'El micrófono está bloqueado. En iPhone: en Safari, toca «aA» a la izquierda de la barra de direcciones y permite el micrófono; si no ves esa opción, ve a Ajustes → Safari y revisa los permisos del sitio. En Android u ordenador: menú del navegador o candado en la barra → permite el micrófono. Luego pulsa otra vez el botón de voz.';
  }
  if (name === 'NotFoundError') {
    return 'No se detecta micrófono en el dispositivo.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'El micrófono está en uso por otra app. Ciérrala e inténtalo de nuevo.';
  }
  if (err instanceof Error && err.message.includes('no respondió')) {
    return err.message;
  }
  return 'No se pudo usar el micrófono. Abre MotoRide en el navegador (no dentro de Instagram/Facebook), con HTTPS o localhost, y no en modo incógnito si el navegador bloquea el mic ahí.';
}

type PeerMeta = {
  createdAt: number;
  connected: boolean;
  disconnectedSince: number | null;
};

/** Estado ICE/conexión del RTCPeerConnection interno de simple-peer. */
function peerConnectionState(peer: Peer.Instance): string {
  const pc = (peer as unknown as { _pc?: RTCPeerConnection })._pc;
  if (!pc) return 'closed';
  return pc.connectionState || pc.iceConnectionState || 'new';
}

/**
 * Voz grupal en malla WebRTC (simple-peer) con señalización por Socket.IO.
 *
 * - Cada par tiene un único iniciador (orden de socket.id) para evitar doble oferta.
 * - Cada enlace se vigila: si falla, se cae o no llega a conectar, se rehace solo ese enlace
 *   (con reintentos crecientes) sin tirar la malla entera.
 * - Si cae el socket (cambia el socket.id) se reconstruye la sala completa al reconectar.
 */
export function useVoiceChat(groupId: string | null, canUseVoice: boolean = true) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [peers, setPeers] = useState<{ [key: string]: Peer.Instance }>({});
  const [micError, setMicError] = useState<string | null>(null);
  const masterStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [key: string]: Peer.Instance }>({});
  const peerMetaRef = useRef<{ [key: string]: PeerMeta }>({});
  const peerStreamsRef = useRef<{ [key: string]: MediaStream }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  /** socket.id de los demás que están ahora en la sala de voz (según el servidor). */
  const voiceMembersRef = useRef<Set<string>>(new Set());
  const retryTimersRef = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});
  const retryAttemptsRef = useRef<{ [key: string]: number }>({});
  const canUseVoiceRef = useRef(canUseVoice);
  canUseVoiceRef.current = canUseVoice;
  const joinedVoiceRoomRef = useRef<string | null>(null);
  const isVoiceActiveRef = useRef(false);
  /** Socket desconectado mientras la voz sigue “activa” (intención de reconectar). */
  const [voiceTransportLost, setVoiceTransportLost] = useState(false);
  /** Malla WebRTC en reconstrucción tras reconexión. */
  const [voiceMeshResetting, setVoiceMeshResetting] = useState(false);
  const meshResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMeshResetTimer = useCallback(() => {
    if (meshResetTimerRef.current != null) {
      clearTimeout(meshResetTimerRef.current);
      meshResetTimerRef.current = null;
    }
  }, []);

  const MESH_UI_MS = 900;

  const startMeshResetUi = useCallback(() => {
    clearMeshResetTimer();
    setVoiceMeshResetting(true);
    meshResetTimerRef.current = setTimeout(() => {
      meshResetTimerRef.current = null;
      setVoiceMeshResetting(false);
    }, MESH_UI_MS);
  }, [clearMeshResetTimer]);

  const clearMicError = useCallback(() => setMicError(null), []);

  useEffect(() => {
    isVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);

  /** Evita quedar pillado en «reconectando» si el temporizador de malla no llega a dispararse. */
  useEffect(() => {
    if (!voiceMeshResetting) return;
    const failSafe = window.setTimeout(() => {
      setVoiceMeshResetting(false);
      clearMeshResetTimer();
    }, 4500);
    return () => clearTimeout(failSafe);
  }, [voiceMeshResetting, clearMeshResetTimer]);

  const isInitiatorVersus = (remoteSocketId: string) => {
    const myId = socket.id || '';
    return myId.localeCompare(remoteSocketId) > 0;
  };

  const clearRetry = (peerId: string) => {
    const t = retryTimersRef.current[peerId];
    if (t) clearTimeout(t);
    delete retryTimersRef.current[peerId];
  };

  const clearAllRetries = () => {
    Object.keys(retryTimersRef.current).forEach(clearRetry);
    retryAttemptsRef.current = {};
  };

  const stopPeerMedia = (peerId: string) => {
    const s = peerStreamsRef.current[peerId];
    if (s) {
      try {
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      delete peerStreamsRef.current[peerId];
    }
  };

  const removePeer = (peerId: string) => {
    const peer = peersRef.current[peerId];
    // Quitar del mapa ANTES de destruir: los eventos close/error del peer viejo ya no lo encuentran.
    delete peersRef.current[peerId];
    delete peerMetaRef.current[peerId];
    if (peer) {
      try {
        if (!(peer as unknown as { destroyed?: boolean }).destroyed) peer.destroy();
      } catch {
        /* ignore */
      }
    }
    stopPeerMedia(peerId);
    if (audioRefs.current[peerId]) {
      try {
        const a = audioRefs.current[peerId];
        a.pause();
        a.srcObject = null;
        a.remove();
      } catch {
        /* ignore */
      }
      delete audioRefs.current[peerId];
    }
    setPeers({ ...peersRef.current });
  };

  const removeAllPeers = () => {
    Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
  };

  const playRemoteAudio = useCallback((el: HTMLAudioElement) => {
    el.volume = 1;
    el.muted = false;
    const run = () => void el.play().catch(() => {});
    run();
    queueMicrotask(run);
    window.setTimeout(run, 80);
    window.setTimeout(run, 400);
  }, []);

  /**
   * Safari/iOS: el audio remoto suele bloquearse si el elemento no está en el DOM o no se llama play()
   * tras un gesto; además hay que actualizar srcObject si llega un stream nuevo.
   */
  const addAudioStream = (peerId: string, stream: MediaStream) => {
    try {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
    } catch {
      /* ignore */
    }

    let audio = audioRefs.current[peerId];
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.volume = 1;
      audio.muted = false;
      audio.preload = 'auto';
      getOrCreateRemoteAudioRoot().appendChild(audio);
      audioRefs.current[peerId] = audio;
    }
    audio.srcObject = stream;
    playRemoteAudio(audio);
  };

  /** Refs a funciones que se llaman entre sí (crear ↔ reintentar). */
  const createPeerRef = useRef<(remoteId: string, initiator: boolean) => Peer.Instance | null>(() => null);
  const scheduleRetryRef = useRef<(remoteId: string) => void>(() => {});

  createPeerRef.current = (remoteId: string, initiator: boolean) => {
    if (!canUseVoiceRef.current || !masterStreamRef.current) return null;
    if (peersRef.current[remoteId]) removePeer(remoteId);

    let localStream: MediaStream;
    try {
      localStream = masterStreamRef.current.clone();
    } catch {
      return null;
    }
    peerStreamsRef.current[remoteId] = localStream;

    const peer = new Peer({
      initiator,
      trickle: true,
      stream: localStream,
      config: getWebRtcPeerConfig(),
    });
    const isCurrent = () => peersRef.current[remoteId] === peer;

    peer.on('signal', (signal) => {
      if (!isCurrent()) return;
      socket.emit('webrtc-signal', { target: remoteId, signal });
    });
    peer.on('stream', (stream) => {
      if (!isCurrent()) return;
      addAudioStream(remoteId, stream);
    });
    peer.on('connect', () => {
      if (!isCurrent()) return;
      const meta = peerMetaRef.current[remoteId];
      if (meta) {
        meta.connected = true;
        meta.disconnectedSince = null;
      }
      retryAttemptsRef.current[remoteId] = 0;
    });
    const onDead = () => {
      if (!isCurrent()) return;
      removePeer(remoteId);
      scheduleRetryRef.current(remoteId);
    };
    peer.on('close', onDead);
    peer.on('error', onDead);

    peersRef.current[remoteId] = peer;
    peerMetaRef.current[remoteId] = { createdAt: Date.now(), connected: false, disconnectedSince: null };
    setPeers({ ...peersRef.current });
    return peer;
  };

  scheduleRetryRef.current = (remoteId: string) => {
    clearRetry(remoteId);
    if (!isVoiceActiveRef.current || !voiceMembersRef.current.has(remoteId)) return;
    const attempt = (retryAttemptsRef.current[remoteId] ?? 0) + 1;
    retryAttemptsRef.current[remoteId] = attempt;
    const delay = Math.min(MAX_RETRY_DELAY_MS, 800 * 2 ** Math.min(attempt - 1, 5));
    retryTimersRef.current[remoteId] = setTimeout(() => {
      delete retryTimersRef.current[remoteId];
      if (
        !isVoiceActiveRef.current ||
        !masterStreamRef.current ||
        !socket.connected ||
        !voiceMembersRef.current.has(remoteId) ||
        peersRef.current[remoteId]
      ) {
        return;
      }
      if (isInitiatorVersus(remoteId)) {
        createPeerRef.current(remoteId, true);
      } else {
        // El otro lado es el iniciador: le pedimos que rehaga el enlace con nosotros.
        socket.emit('voice-peer-reset', { target: remoteId });
      }
    }, delay);
  };

  const rebuildVoiceRoom = useCallback(
    (gid?: string | null) => {
      const targetGroup = gid || groupId;
      if (!targetGroup || !canUseVoiceRef.current || !masterStreamRef.current) return;
      startMeshResetUi();
      // Tras reconexión del socket (nuevo socket.id) recreamos la malla completa.
      clearAllRetries();
      removeAllPeers();
      voiceMembersRef.current.clear();
      socket.emit('join-voice', targetGroup);
      joinedVoiceRoomRef.current = targetGroup;
      setIsVoiceActive(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, startMeshResetUi]
  );

  /** Revisa cada enlace y rehace los que están caídos o no llegaron a conectar. */
  const checkPeerHealth = useCallback(() => {
    if (!isVoiceActiveRef.current) return;
    const now = Date.now();
    Object.keys(peersRef.current).forEach((id) => {
      const peer = peersRef.current[id];
      const meta = peerMetaRef.current[id];
      if (!peer || !meta) return;
      const st = peerConnectionState(peer);
      let dead = st === 'failed' || st === 'closed';
      if (!dead && (st === 'disconnected')) {
        if (meta.disconnectedSince == null) meta.disconnectedSince = now;
        dead = now - meta.disconnectedSince > PEER_DISCONNECTED_GRACE_MS;
      } else if (!dead) {
        meta.disconnectedSince = null;
      }
      if (!dead && !meta.connected && now - meta.createdAt > PEER_CONNECT_TIMEOUT_MS) dead = true;
      if (dead) {
        removePeer(id);
        scheduleRetryRef.current(id);
      }
    });
  }, []);

  /** Safari/iOS: reanudar altavoz al volver al primer plano o al tocar la pantalla. */
  useEffect(() => {
    if (!isVoiceActive) return;
    let lastTouchResume = 0;
    const resumeAll = () => {
      Object.keys(audioRefs.current).forEach((id) => {
        const a = audioRefs.current[id];
        if (a?.srcObject) playRemoteAudio(a);
      });
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        resumeAll();
        checkPeerHealth();
      }
    };
    const onTouchResume = () => {
      const n = Date.now();
      if (n - lastTouchResume < 350) return;
      lastTouchResume = n;
      resumeAll();
    };
    const watchdog = window.setInterval(checkPeerHealth, WATCHDOG_MS);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('touchstart', onTouchResume, { passive: true });
    window.addEventListener('pageshow', resumeAll);
    return () => {
      window.clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('touchstart', onTouchResume);
      window.removeEventListener('pageshow', resumeAll);
    };
  }, [isVoiceActive, playRemoteAudio, checkPeerHealth]);

  useEffect(() => {
    const gid = groupId;
    return () => {
      clearAllRetries();
      removeAllPeers();
      voiceMembersRef.current.clear();
      Object.keys(peerStreamsRef.current).forEach((key) => stopPeerMedia(key));
      if (masterStreamRef.current) {
        masterStreamRef.current.getTracks().forEach((track) => track.stop());
        masterStreamRef.current = null;
      }
      setIsVoiceActive(false);
      setPeers({});
      joinedVoiceRoomRef.current = null;
      setVoiceTransportLost(false);
      setVoiceMeshResetting(false);
      if (meshResetTimerRef.current != null) {
        clearTimeout(meshResetTimerRef.current);
        meshResetTimerRef.current = null;
      }
      if (gid) {
        socket.emit('leave-voice', gid);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, canUseVoice]);

  useEffect(() => {
    if (!groupId || !canUseVoice) return;

    /** El servidor avisa de que `remoteId` ha entrado (o vuelto a entrar) en la sala: enlace nuevo. */
    const handleUserJoined = (remoteId: string) => {
      if (!canUseVoiceRef.current || !masterStreamRef.current) return;
      if (!remoteId || remoteId === socket.id) return;
      voiceMembersRef.current.add(remoteId);
      clearRetry(remoteId);
      retryAttemptsRef.current[remoteId] = 0;
      createPeerRef.current(remoteId, isInitiatorVersus(remoteId));
    };

    const handleSignal = (data: { caller: string; signal: any }) => {
      if (!canUseVoiceRef.current || !masterStreamRef.current) return;
      const { caller, signal } = data || ({} as { caller: string; signal: any });
      if (!caller || !signal) return;
      voiceMembersRef.current.add(caller);

      let peer = peersRef.current[caller];
      const isOffer = signal.type === 'offer';
      if (isOffer) {
        // Una oferta nueva sobre un enlace ya conectado o propio = el otro lado reinició: empezar de cero.
        const existing = peer as unknown as { initiator?: boolean; connected?: boolean } | undefined;
        if (existing && (existing.initiator || existing.connected)) {
          removePeer(caller);
          peer = undefined as unknown as Peer.Instance;
        }
        if (!peer) {
          clearRetry(caller);
          peer = createPeerRef.current(caller, false) as Peer.Instance;
          if (!peer) return;
        }
      } else if (!peer) {
        // Candidato/renegociación de un enlace que ya no existe: ignorar.
        return;
      }

      try {
        peer.signal(signal);
      } catch {
        removePeer(caller);
        scheduleRetryRef.current(caller);
      }
    };

    const handleUserLeft = (remoteId: string) => {
      voiceMembersRef.current.delete(remoteId);
      clearRetry(remoteId);
      delete retryAttemptsRef.current[remoteId];
      removePeer(remoteId);
    };

    /** El otro lado (no iniciador) nos pide rehacer el enlace. */
    const handlePeerReset = (data: { caller: string }) => {
      const remoteId = data?.caller;
      if (!remoteId || !isVoiceActiveRef.current || !masterStreamRef.current) return;
      voiceMembersRef.current.add(remoteId);
      clearRetry(remoteId);
      createPeerRef.current(remoteId, isInitiatorVersus(remoteId));
    };

    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-signal', handleSignal);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-peer-reset', handlePeerReset);

    /** Al volver el socket (nuevo socket.id) hay que volver a entrar en la sala de voz. */
    const onSocketTransportRestored = () => {
      try {
        if (isVoiceActiveRef.current && joinedVoiceRoomRef.current) {
          setVoiceTransportLost(false);
        }
        const gid = joinedVoiceRoomRef.current;
        if (gid === groupId && isVoiceActiveRef.current && masterStreamRef.current && canUseVoiceRef.current) {
          rebuildVoiceRoom(gid);
        }
      } catch {
        /* ignore */
      }
    };

    const handleSocketDisconnect = () => {
      // No desactivamos voz: mantenemos la intención y reconstruimos al reconectar.
      clearAllRetries();
      removeAllPeers();
      voiceMembersRef.current.clear();
      if (isVoiceActiveRef.current && joinedVoiceRoomRef.current) {
        setVoiceTransportLost(true);
      }
    };

    socket.on('connect', onSocketTransportRestored);
    socket.on('disconnect', handleSocketDisconnect);

    return () => {
      socket.off('user-joined-voice', handleUserJoined);
      socket.off('webrtc-signal', handleSignal);
      socket.off('user-left-voice', handleUserLeft);
      socket.off('voice-peer-reset', handlePeerReset);
      socket.off('connect', onSocketTransportRestored);
      socket.off('disconnect', handleSocketDisconnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, canUseVoice, rebuildVoiceRoom]);

  useEffect(() => {
    if (canUseVoice) return;
    if (masterStreamRef.current) {
      try {
        masterStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      masterStreamRef.current = null;
    }
    clearAllRetries();
    removeAllPeers();
    voiceMembersRef.current.clear();
    setIsVoiceActive(false);
    setPeers({});
    joinedVoiceRoomRef.current = null;
    setVoiceTransportLost(false);
    setVoiceMeshResetting(false);
    clearMeshResetTimer();
    if (groupId) {
      socket.emit('leave-voice', groupId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseVoice, groupId, clearMeshResetTimer]);

  const toggleVoice = () => {
    if (!canUseVoiceRef.current) return;
    if (isVoiceActive) {
      setMicError(null);
      setVoiceTransportLost(false);
      setVoiceMeshResetting(false);
      clearMeshResetTimer();
      clearAllRetries();
      removeAllPeers();
      voiceMembersRef.current.clear();
      if (masterStreamRef.current) {
        masterStreamRef.current.getTracks().forEach((track) => track.stop());
        masterStreamRef.current = null;
      }
      joinedVoiceRoomRef.current = null;
      socket.emit('leave-voice', groupId);
      setIsVoiceActive(false);
      return;
    }

    if (!groupId) return;
    clearMicError();

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setMicError(
        'El micrófono solo está permitido en conexión segura. Usa https:// o abre la app en localhost; en el móvil evita http:// con la IP de la red.'
      );
      return;
    }

    const md = navigator.mediaDevices;
    const gUM = md?.getUserMedia?.bind(md);
    if (!gUM) {
      setMicError(
        'Aquí no está disponible el micrófono. Abre MotoRide en Safari o Chrome del móvil (no dentro de Instagram, Facebook o WhatsApp).'
      );
      return;
    }

    const timeoutMsg = 'El micrófono no respondió a tiempo. Reinicia la pestaña y vuelve a pulsar voz.';

    const constraintsIdeal: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    };

    const constraintsSimple: MediaStreamConstraints = { audio: true, video: false };

    const acquire = (constraints: MediaStreamConstraints) =>
      withTimeout(gUM(constraints), 20000, timeoutMsg);

    // getUserMedia debe pedirse dentro del gesto (iOS); las credenciales TURN se cargan en paralelo.
    const icePromise = preloadIceServers();

    acquire(constraintsIdeal)
      .catch((e: unknown) => {
        const n = e && typeof e === 'object' && 'name' in e ? String((e as DOMException).name) : '';
        if (n === 'OverconstrainedError' || n === 'ConstraintNotSatisfiedError') {
          return acquire(constraintsSimple);
        }
        throw e;
      })
      .then(async (stream: MediaStream) => {
        if (!canUseVoiceRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        masterStreamRef.current = stream;
        joinedVoiceRoomRef.current = groupId;
        setIsVoiceActive(true);
        setMicError(null);
        try {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AC) {
            const ctx = new AC();
            void ctx.resume().finally(() => {
              try {
                ctx.close();
              } catch {
                /* ignore */
              }
            });
          }
        } catch {
          /* ignore */
        }
        await icePromise;
        if (!canUseVoiceRef.current || joinedVoiceRoomRef.current !== groupId || !masterStreamRef.current) return;
        voiceMembersRef.current.clear();
        socket.emit('join-voice', groupId);
      })
      .catch((err: unknown) => {
        console.error('Error accessing microphone:', err);
        setMicError(micErrorMessage(err));
        setIsVoiceActive(false);
        masterStreamRef.current = null;
      });
  };

  const voiceReconnecting = isVoiceActive && (voiceTransportLost || voiceMeshResetting);

  return {
    isVoiceActive,
    toggleVoice,
    peersCount: Object.keys(peers).length,
    micError,
    clearMicError,
    voiceReconnecting,
  };
}
