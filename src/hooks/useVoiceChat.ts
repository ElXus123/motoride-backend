import { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import socket from '../lib/socket';

/**
 * Each WebRTC peer gets its own cloned local MediaStream. Sharing one stream across
 * multiple simple-peer instances can cause track.stop() side effects when one peer is
 * destroyed, breaking audio (and on some devices other sensors) for everyone else.
 */
export function useVoiceChat(groupId: string | null) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [peers, setPeers] = useState<{ [key: string]: Peer.Instance }>({});
  const masterStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [key: string]: Peer.Instance }>({});
  const peerStreamsRef = useRef<{ [key: string]: MediaStream }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

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
      audio.play().catch(() => {});
      audioRefs.current[peerId] = audio;
    }
  };

  // Group teardown is registered before the socket effect so, on unmount, the socket effect (below) cleans up first.
  useEffect(() => {
    const gid = groupId;
    return () => {
      const ids = Object.keys(peersRef.current);
      for (const id of ids) {
        removePeer(id);
      }
      if (masterStreamRef.current) {
        masterStreamRef.current.getTracks().forEach((track) => track.stop());
        masterStreamRef.current = null;
      }
      setIsVoiceActive(false);
      if (gid) {
        socket.emit('leave-voice', gid);
      }
    };
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;

    const handleUserJoined = (callerId: string) => {
      if (!masterStreamRef.current) return;
      if (peersRef.current[callerId]) return;

      let localStream: MediaStream;
      try {
        localStream = masterStreamRef.current.clone();
      } catch {
        return;
      }
      peerStreamsRef.current[callerId] = localStream;

      const peer = new Peer({
        initiator: true,
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
      if (!masterStreamRef.current) return;

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
  }, [groupId]);

  const toggleVoice = async () => {
    if (isVoiceActive) {
      Object.keys(peersRef.current).forEach((peerId) => removePeer(peerId));
      if (masterStreamRef.current) {
        masterStreamRef.current.getTracks().forEach((track) => track.stop());
        masterStreamRef.current = null;
      }
      socket.emit('leave-voice', groupId);
      setIsVoiceActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        masterStreamRef.current = stream;
        socket.emit('join-voice', groupId);
        setIsVoiceActive(true);
      } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('No se pudo acceder al micrófono. Por favor, revisa los permisos.');
      }
    }
  };

  return {
    isVoiceActive,
    toggleVoice,
    peersCount: Object.keys(peers).length,
  };
}
