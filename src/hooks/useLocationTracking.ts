import { useEffect, useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDistance, getBearing } from '../lib/geoUtils';
import socket from '../lib/socket';

export const useLocationTracking = (isActive: boolean, groupId: string, extraData?: any) => {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  /** Curso sobre el suelo (histórico de posiciones) cuando el GPS no da heading */
  const [courseOverGround, setCourseOverGround] = useState<number | null>(null);
  const positionHistoryRef = useRef<Array<{ lat: number; lng: number; t: number }>>([]);

  const extraDataRef = useRef(extraData);
  const lastPersistRef = useRef(0);
  const lastPersistedLocRef = useRef<{ lat: number; lng: number } | null>(null);
  /** Último paquete enviado por socket (para reemitir tras location-sync-request). */
  const lastSocketPayloadRef = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    extraDataRef.current = extraData;
  }, [extraData]);

  useEffect(() => {
    if (!user || !groupId || groupId === 'REPEATED') return;
    const onSyncRequest = () => {
      const p = lastSocketPayloadRef.current;
      if (!p || p.groupId !== groupId) return;
      socket.emit('update-location', { ...p, timestamp: Date.now() });
    };
    socket.on('location-sync-request', onSyncRequest);
    return () => {
      socket.off('location-sync-request', onSyncRequest);
    };
  }, [groupId, user]);

  // Join group room on socket
  useEffect(() => {
    if (groupId && groupId !== 'REPEATED' && user) {
      socket.emit('join-group', { groupId, uid: user.uid, isHost: !!extraDataRef.current?.isHost });
    }

    const rejoinOnConnect = () => {
      if (groupId && groupId !== 'REPEATED' && user) {
        socket.emit('join-group', { groupId, uid: user.uid, isHost: !!extraDataRef.current?.isHost });
      }
    };
    socket.on('connect', rejoinOnConnect);
    return () => {
      socket.off('connect', rejoinOnConnect);
    };
  }, [groupId, user]);

  // Force update when alert changes - only if it's a new alert
  const lastAlertRef = useRef<string | null>(null);
  useEffect(() => {
    if (user && groupId !== 'REPEATED' && extraData?.alert && extraData.alert.type !== lastAlertRef.current) {
      lastAlertRef.current = extraData.alert.type;
      // Alerts still go to Firestore for persistence/reliability
      setDoc(doc(db, 'locations', user.uid), { alert: extraData.alert, timestamp: Date.now() }, { merge: true }).catch(err => {
        console.error(err);
        handleFirestoreError(err, OperationType.WRITE, `locations/${user.uid}`);
      });
      
      // Also broadcast via socket for instant delivery
      socket.emit('update-location', {
        groupId,
        uid: user.uid,
        alert: extraData.alert,
        timestamp: Date.now(),
        photoURL: extraDataRef.current?.photoURL || '',
        displayName: extraDataRef.current?.displayName || 'Motero'
      });
    }
  }, [extraData?.alert, user, groupId]);

  useEffect(() => {
    if (!isActive || !user || !groupId) return;

    let watchId: number;
    let intervalId: NodeJS.Timeout;

    const startTracking = () => {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by your browser');
        return;
      }

      let lastLat = 0;
      let lastLng = 0;
      let lastSpeed = 0;
      let lastHeading = 0;

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed: gpsSpeed, heading: gpsHeading } = position.coords;
          setError(null);
          
          lastLat = latitude;
          lastLng = longitude;
          lastSpeed = gpsSpeed || 0;
          lastHeading = gpsHeading || 0;

          setSpeed(gpsSpeed); // meters per second
          setHeading(gpsHeading);
          setCurrentLocation({ lat: latitude, lng: longitude });

          const now = Date.now();
          const hist = positionHistoryRef.current;
          hist.push({ lat: latitude, lng: longitude, t: now });
          while (hist.length > 1 && now - hist[0].t > 5000) hist.shift();
          if (hist.length > 18) hist.splice(0, hist.length - 18);
          if (hist.length >= 2) {
            const oldest = hist[0];
            const newest = hist[hist.length - 1];
            const moved = getDistance(oldest.lat, oldest.lng, newest.lat, newest.lng);
            const dtSec = (newest.t - oldest.t) / 1000;
            if (moved >= 3.5 && dtSec >= 0.35) {
              setCourseOverGround(getBearing(oldest.lat, oldest.lng, newest.lat, newest.lng));
            }
          }

          // Broadcast location and score via Socket.io EVERY SECOND (or whenever GPS updates)
          // This costs ZERO Firestore quota
          if (groupId !== 'REPEATED') {
            const payload = {
              groupId,
              uid: user.uid,
              lat: latitude,
              lng: longitude,
              speed: gpsSpeed || 0,
              heading: gpsHeading || 0,
              score: extraDataRef.current?.score || 0,
              timestamp: now,
              photoURL: extraDataRef.current?.photoURL || '',
              displayName: extraDataRef.current?.displayName || 'Motero',
              alert: extraDataRef.current?.alert || null,
              level: extraDataRef.current?.level || 1
            };
            lastSocketPayloadRef.current = payload;
            socket.emit('update-location', payload);

            // Fallback persistence for cross-client visibility if socket packets are missed.
            // Use a real elapsed-time throttle to avoid burst writes on some devices.
            if (now - lastPersistRef.current >= 10000) {
              const prevPersist = lastPersistedLocRef.current;
              const movedSincePersist = prevPersist
                ? getDistance(latitude, longitude, prevPersist.lat, prevPersist.lng)
                : Number.POSITIVE_INFINITY;
              const hasActiveAlert = !!extraDataRef.current?.alert;
              if (movedSincePersist < 20 && !hasActiveAlert) {
                return;
              }
              lastPersistRef.current = now;
              lastPersistedLocRef.current = { lat: latitude, lng: longitude };
              setDoc(
                doc(db, 'locations', user.uid),
                {
                  uid: user.uid,
                  lat: latitude,
                  lng: longitude,
                  speed: gpsSpeed || 0,
                  heading: gpsHeading || 0,
                  score: extraDataRef.current?.score || 0,
                  timestamp: now,
                  photoURL: extraDataRef.current?.photoURL || '',
                  displayName: extraDataRef.current?.displayName || 'Motero',
                  alert: extraDataRef.current?.alert || null,
                  level: extraDataRef.current?.level || 1
                },
                { merge: true }
              ).catch(() => {
                // Non-blocking fallback write.
              });
            }
          }
        },
        (err) => {
          console.error('Geolocation error:', err);
          if (err.code === 1) {
            setError('Permiso de GPS denegado');
          } else if (err.code === 2) {
            setError('Sin señal GPS, reconectando');
          } else if (err.code === 3) {
            setError('GPS tardando en responder, reintentando');
          } else {
            setError(err.message);
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000
        }
      );

      // Also emit every 5 seconds to ensure new users see everyone even if stationary
      intervalId = setInterval(() => {
        if (lastLat !== 0 && lastLng !== 0 && groupId !== 'REPEATED') {
          const payload = {
            groupId,
            uid: user.uid,
            lat: lastLat,
            lng: lastLng,
            speed: lastSpeed,
            heading: lastHeading,
            score: extraDataRef.current?.score || 0,
            timestamp: Date.now(),
            photoURL: extraDataRef.current?.photoURL || '',
            displayName: extraDataRef.current?.displayName || 'Motero',
            alert: extraDataRef.current?.alert || null,
            level: extraDataRef.current?.level || 1
          };
          lastSocketPayloadRef.current = payload;
          socket.emit('update-location', payload);
        }
      }, 5000);
    };

    startTracking();

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isActive, user, groupId]);

  return { error, speed, heading, currentLocation, courseOverGround };
};