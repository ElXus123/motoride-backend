import { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import socket from '../lib/socket';

export function useVoiceChat(groupId: string | null) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [peers, setPeers] = useState<{ [key: string]: Peer.Instance }>({});
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<{ [key: string]: Peer.Instance }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

  useEffect(() => {
    if (!groupId) return;

    const handleUserJoined = (callerId: string) => {
      if (!streamRef.current) return;
      
      const peer = new Peer({
        initiator: true,
        trickle: true,
        stream: streamRef.current,
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

      peersRef.current[callerId] = peer;
      setPeers({ ...peersRef.current });
    };

    const handleSignal = (data: { caller: string; signal: any }) => {
      if (!streamRef.current) return;

      const { caller, signal } = data;
      
      let peer = peersRef.current[caller];

      if (!peer) {
        peer = new Peer({
          initiator: false,
          trickle: true,
          stream: streamRef.current,
        });

        peer.on('signal', (signal) => {
          socket.emit('webrtc-signal', {
            target: caller,
            signal,
          });
        });

        peer.on('stream', (stream) => {
          addAudioStream(caller, stream);
        });

        peer.on('close', () => {
          removePeer(caller);
        });

        peersRef.current[caller] = peer;
        setPeers({ ...peersRef.current });
      }

      peer.signal(signal);
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

  const addAudioStream = (peerId: string, stream: MediaStream) => {
    if (!audioRefs.current[peerId]) {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audioRefs.current[peerId] = audio;
    }
  };

  const removePeer = (peerId: string) => {
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].destroy();
      delete peersRef.current[peerId];
    }
    if (audioRefs.current[peerId]) {
      audioRefs.current[peerId].srcObject = null;
      delete audioRefs.current[peerId];
    }
    setPeers({ ...peersRef.current });
  };

  const toggleVoice = async () => {
    if (isVoiceActive) {
      // Leave voice
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      Object.keys(peersRef.current).forEach(peerId => {
        removePeer(peerId);
      });
      socket.emit('leave-voice', groupId);
      setIsVoiceActive(false);
    } else {
      // Join voice
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream;
        socket.emit('join-voice', groupId);
        setIsVoiceActive(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("No se pudo acceder al micrófono. Por favor, revisa los permisos.");
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isVoiceActive) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        Object.keys(peersRef.current).forEach(peerId => {
          removePeer(peerId);
        });
        if (groupId) {
          socket.emit('leave-voice', groupId);
        }
      }
    };
  }, [isVoiceActive, groupId]);

  return {
    isVoiceActive,
    toggleVoice,
    peersCount: Object.keys(peers).length
  };
}
