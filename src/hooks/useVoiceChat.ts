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
    return 'Micrófono denegado. En el candado de la barra del navegador, permite micrófono para este sitio y vuelve a pulsar el botón de voz.';
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
  return 'No se pudo usar el micrófono. Cierra la app y vuelve a abrir MotoRide desde el navegador (no en iframe).';
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

  const clearMicError = useCallback(() => setMicError(null), []);

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

    return () => {
      socket.off('user-joined-voice', handleUserJoined);
      socket.off('webrtc-signal', handleSignal);
      socket.off('user-left-voice', handleUserLeft);
    };
  }, [groupId, canUseVoice]);

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
    if (groupId) {
      socket.emit('leave-voice', groupId);
    }
  }, [canUseVoice, groupId]);

  const toggleVoice = async () => {
    if (!canUseVoiceRef.current) return;
    if (isVoiceActive) {
      setMicError(null);
      Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
      if (masterStreamRef.current) {
        masterStreamRef.current.getTracks().forEach((track) => track.stop());
        masterStreamRef.current = null;
      }
      socket.emit('leave-voice', groupId);
      setIsVoiceActive(false);
    } else {
      if (!groupId) return;
      clearMicError();
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError('Tu navegador no permite acceso al micrófono desde esta página.');
        return;
      }
      try {
        const stream = await withTimeout(
          navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              channelCount: 1,
            },
            video: false,
          }),
          20000,
          'El micrófono no respondió a tiempo. Reinicia la pestaña y vuelve a pulsar voz.'
        );
        if (!canUseVoiceRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        masterStreamRef.current = stream;
        socket.emit('join-voice', groupId);
        setIsVoiceActive(true);
        setMicError(null);
      } catch (err) {
        console.error('Error accessing microphone:', err);
        setMicError(micErrorMessage(err));
        setIsVoiceActive(false);
        masterStreamRef.current = null;
      }
    }
  };

  return {
    isVoiceActive,
    toggleVoice,
    peersCount: Object.keys(peers).length,
    micError,
    clearMicError,
  };
}
