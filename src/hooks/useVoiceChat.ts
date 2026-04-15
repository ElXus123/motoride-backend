import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import socket from '../lib/socket';

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

/**
 * Cada par WebRTC tiene un único iniciador (por orden de socket.id) para evitar doble oferta.
 * Cada simple-peer usa un clon del MediaStream local.
 */
export function useVoiceChat(groupId: string | null, canUseVoice: boolean = true) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [peers, setPeers] = useState<{ [key: string]: Peer.Instance }>({});
  const [micError, setMicError] = useState<string | null>(null);
  const masterStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [key: string]: Peer.Instance }>({});
  const peerStreamsRef = useRef<{ [key: string]: MediaStream }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const canUseVoiceRef = useRef(canUseVoice);
  canUseVoiceRef.current = canUseVoice;
  const joinedVoiceRoomRef = useRef<string | null>(null);
  /** Evita re-montar listeners de socket al activar voz (desregistrar en ese momento perdía señales WebRTC). */
  const isVoiceActiveRef = useRef(false);
  /** Socket desconectado mientras la voz sigue “activa” (intención de reconectar). */
  const [voiceTransportLost, setVoiceTransportLost] = useState(false);
  /** Malla WebRTC en reconstrucción tras reconexión o vuelta al primer plano. */
  const [voiceMeshResetting, setVoiceMeshResetting] = useState(false);
  const meshResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMeshResetTimer = useCallback(() => {
    if (meshResetTimerRef.current != null) {
      clearTimeout(meshResetTimerRef.current);
      meshResetTimerRef.current = null;
    }
  }, []);

  const startMeshResetUi = useCallback(() => {
    clearMeshResetTimer();
    setVoiceMeshResetting(true);
    meshResetTimerRef.current = setTimeout(() => {
      meshResetTimerRef.current = null;
      setVoiceMeshResetting(false);
    }, 1400);
  }, [clearMeshResetTimer]);

  const clearMicError = useCallback(() => setMicError(null), []);

  useEffect(() => {
    isVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);

  const isInitiatorVersus = (remoteSocketId: string) => {
    const myId = socket.id || '';
    return myId.localeCompare(remoteSocketId) > 0;
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
    if (peer) {
      try {
        if (!(peer as any).destroyed) {
          peer.destroy();
        }
      } catch {
        /* ignore */
      }
      delete peersRef.current[peerId];
    }
    stopPeerMedia(peerId);
    if (audioRefs.current[peerId]) {
      try {
        audioRefs.current[peerId].pause();
        audioRefs.current[peerId].srcObject = null;
      } catch {
        /* ignore */
      }
      delete audioRefs.current[peerId];
    }
    setPeers({ ...peersRef.current });
  };

  const rebuildVoiceRoom = useCallback(
    (gid?: string | null) => {
      const targetGroup = gid || groupId;
      if (!targetGroup || !canUseVoiceRef.current || !masterStreamRef.current) return;
      startMeshResetUi();
      // Tras reconexión del socket, recreamos malla WebRTC para evitar peers colgados.
      Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
      socket.emit('join-voice', targetGroup);
      joinedVoiceRoomRef.current = targetGroup;
      setIsVoiceActive(true);
    },
    [groupId, startMeshResetUi]
  );

  const addAudioStream = (peerId: string, stream: MediaStream) => {
    if (!audioRefs.current[peerId]) {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.setAttribute('playsinline', 'true');
      audio.play().catch(() => {});
      audioRefs.current[peerId] = audio;
    }
  };

  useEffect(() => {
    const gid = groupId;
    return () => {
      Object.keys(peersRef.current).forEach((peerId) => {
        try {
          const p = peersRef.current[peerId];
          if (p && !(p as any).destroyed) p.destroy();
        } catch {
          /* ignore */
        }
      });
      peersRef.current = {};
      Object.keys(peerStreamsRef.current).forEach((key) => {
        const s = peerStreamsRef.current[key];
        try {
          s.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
      });
      peerStreamsRef.current = {};
      Object.keys(audioRefs.current).forEach((key) => {
        const a = audioRefs.current[key];
        try {
          a.pause();
          a.srcObject = null;
        } catch {
          /* ignore */
        }
      });
      audioRefs.current = {};
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
  }, [groupId, canUseVoice]);

  useEffect(() => {
    if (!groupId || !canUseVoice) return;

    const handleUserJoined = (callerId: string) => {
      if (!canUseVoiceRef.current || !masterStreamRef.current) return;
      if (peersRef.current[callerId]) return;

      let localStream: MediaStream;
      try {
        localStream = masterStreamRef.current.clone();
      } catch {
        return;
      }
      peerStreamsRef.current[callerId] = localStream;

      const peer = new Peer({
        initiator: isInitiatorVersus(callerId),
        trickle: true,
        stream: localStream,
      });

      peer.on('signal', (signal) => {
        socket.emit('webrtc-signal', {
          target: callerId,
          signal,
        });
      });

      peer.on('stream', (stream) => {
        addAudioStream(callerId, stream);
      });

      peer.on('close', () => {
        removePeer(callerId);
      });

      peer.on('error', () => {
        removePeer(callerId);
      });

      peersRef.current[callerId] = peer;
      setPeers({ ...peersRef.current });
    };

    const handleSignal = (data: { caller: string; signal: any }) => {
      if (!canUseVoiceRef.current || !masterStreamRef.current) return;

      const { caller, signal } = data;

      let peer = peersRef.current[caller];

      if (!peer) {
        let localStream: MediaStream;
        try {
          localStream = masterStreamRef.current.clone();
        } catch {
          return;
        }
        peerStreamsRef.current[caller] = localStream;

        peer = new Peer({
          initiator: false,
          trickle: true,
          stream: localStream,
        });

        peer.on('signal', (sig) => {
          socket.emit('webrtc-signal', {
            target: caller,
            signal: sig,
          });
        });

        peer.on('stream', (stream) => {
          addAudioStream(caller, stream);
        });

        peer.on('close', () => {
          removePeer(caller);
        });

        peer.on('error', () => {
          removePeer(caller);
        });

        peersRef.current[caller] = peer;
        setPeers({ ...peersRef.current });
      }

      try {
        peer.signal(signal);
      } catch {
        removePeer(caller);
      }
    };

    const handleUserLeft = (callerId: string) => {
      removePeer(callerId);
    };

    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-signal', handleSignal);
    socket.on('user-left-voice', handleUserLeft);

    const handleSocketReconnect = () => {
      setVoiceTransportLost(false);
      rebuildVoiceRoom(groupId);
    };
    const handleSocketConnect = () => {
      if (joinedVoiceRoomRef.current === groupId && isVoiceActiveRef.current) {
        setVoiceTransportLost(false);
        rebuildVoiceRoom(groupId);
      }
    };
    const handleSocketDisconnect = () => {
      // No desactivamos voz: mantenemos intención activa y reconstruimos al reconectar.
      Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
      if (isVoiceActiveRef.current && joinedVoiceRoomRef.current) {
        setVoiceTransportLost(true);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isVoiceActiveRef.current && joinedVoiceRoomRef.current === groupId) {
        // Safari/iOS puede congelar WebRTC al volver de segundo plano; forzamos reenganche.
        rebuildVoiceRoom(groupId);
      }
    };
    socket.on('reconnect', handleSocketReconnect);
    socket.on('connect', handleSocketConnect);
    socket.on('disconnect', handleSocketDisconnect);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      socket.off('user-joined-voice', handleUserJoined);
      socket.off('webrtc-signal', handleSignal);
      socket.off('user-left-voice', handleUserLeft);
      socket.off('reconnect', handleSocketReconnect);
      socket.off('connect', handleSocketConnect);
      socket.off('disconnect', handleSocketDisconnect);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
    Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
    setIsVoiceActive(false);
    setPeers({});
    joinedVoiceRoomRef.current = null;
    setVoiceTransportLost(false);
    setVoiceMeshResetting(false);
    clearMeshResetTimer();
    if (groupId) {
      socket.emit('leave-voice', groupId);
    }
  }, [canUseVoice, groupId, clearMeshResetTimer]);

  const toggleVoice = () => {
    if (!canUseVoiceRef.current) return;
    if (isVoiceActive) {
      setMicError(null);
      setVoiceTransportLost(false);
      setVoiceMeshResetting(false);
      clearMeshResetTimer();
      Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
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
      },
      video: false,
    };

    const constraintsSimple: MediaStreamConstraints = { audio: true, video: false };

    const acquire = (constraints: MediaStreamConstraints) =>
      withTimeout(gUM(constraints), 20000, timeoutMsg);

    acquire(constraintsIdeal)
      .catch((e: unknown) => {
        const n = e && typeof e === 'object' && 'name' in e ? String((e as DOMException).name) : '';
        if (n === 'OverconstrainedError' || n === 'ConstraintNotSatisfiedError') {
          return acquire(constraintsSimple);
        }
        throw e;
      })
      .then((stream: MediaStream) => {
        if (!canUseVoiceRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        masterStreamRef.current = stream;
        joinedVoiceRoomRef.current = groupId;
        setIsVoiceActive(true);
        setMicError(null);
        // Tras el render: los listeners de `user-joined-voice` / `webrtc-signal` deben estar activos antes del join.
        queueMicrotask(() => {
          if (!canUseVoiceRef.current || joinedVoiceRoomRef.current !== groupId || !masterStreamRef.current) return;
          socket.emit('join-voice', groupId);
        });
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
