import { useEffect, useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDistance, getBearing } from '../lib/geoUtils';
import socket from '../lib/socket';

export type LocationTrackingOptions = {
  /** Por defecto `true`. Si `false`, GPS menos preciso (menor consumo; p. ej. usuarios no Premium). */
  enableHighAccuracy?: boolean;
};

export const useLocationTracking = (
  isActive: boolean,
  groupId: string,
  extraData?: any,
  trackingOptions?: LocationTrackingOptions
) => {
  const enableHighAccuracy = trackingOptions?.enableHighAccuracy !== false;
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  /** Radio de incertidumbre horizontal del último fix (m). `null` si el SO no lo da. */
  const [horizontalAccuracy, setHorizontalAccuracy] = useState<number | null>(null);
  /** Curso sobre el suelo (histórico de posiciones) cuando el GPS no da heading */
  const [courseOverGround, setCourseOverGround] = useState<number | null>(null);
  const positionHistoryRef = useRef<Array<{ lat: number; lng: number; t: number }>>([]);

  const extraDataRef = useRef(extraData);
  const lastPersistRef = useRef(0);
  const lastPersistedLocRef = useRef<{ lat: number; lng: number } | null>(null);
  /** Último paquete enviado por socket (para reemitir tras location-sync-request). */
  const lastSocketPayloadRef = useRef<Record<string, unknown> | null>(null);
  /** Limita ráfagas de `update-location` (algunos dispositivos entregan varios fixes/s). El intervalo de 5s sigue siendo red de seguridad. */
  const lastSocketEmitRef = useRef<{ t: number; lat: number; lng: number; alertKey: string } | null>(null);
  useEffect(() => {
    extraDataRef.current = extraData;
  }, [extraData]);

  useEffect(() => {
    if (!user || !groupId || groupId === 'REPEATED') return;
    const onSyncRequest = () => {
      const p = lastSocketPayloadRef.current;
      if (!p || p.groupId !== groupId) return;
      socket.volatile.emit('update-location', { ...p, timestamp: Date.now() });
    };
    socket.on('location-sync-request', onSyncRequest);
    return () => {
      socket.off('location-sync-request', onSyncRequest);
    };
  }, [groupId, user]);

  // Unir a la sala Socket en cuanto hay grupo + usuario (no esperar al primer fix GPS).
  useEffect(() => {
    if (!groupId || groupId === 'REPEATED' || !user) return;

    const join = () => {
      socket.emit('join-group', {
        groupId,
        uid: user.uid,
        isHost: !!extraDataRef.current?.isHost,
      });
    };

    // Emisión inmediata (socket.io encola si aún no hay conexión) + cada reconexión.
    join();
    socket.on('connect', join);
    const ioMgr = (socket as { io?: { on?: (ev: string, fn: () => void) => void; off?: (ev: string, fn: () => void) => void } }).io;
    const onReconnect = () => join();
    ioMgr?.on?.('reconnect', onReconnect);

    return () => {
      socket.off('connect', join);
      ioMgr?.off?.('reconnect', onReconnect);
    };
  }, [groupId, user]);

  // Avisos: solo socket (trigger-alert / update-location). No escrituras en Firestore.

  useEffect(() => {
    if (!isActive || !user || !groupId) return;

    let watchId: number | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    let lastFixWallClock = 0;
    let disposed = false;

    /** Último fix aceptado (para filtrar saltos y calcular velocidad si el GPS no la da). */
    let prevFix: { lat: number; lng: number; t: number; acc: number } | null = null;
    let consecutiveRejects = 0;

    const startTracking = () => {
      if (!navigator.geolocation) {
        setError('Geolocation is not supported by your browser');
        return;
      }

      let lastLat = 0;
      let lastLng = 0;
      let lastSpeed = 0;
      let lastHeading = 0;

      const startWatch = () => {
        if (watchId != null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed: rawSpeed, heading: rawHeading, accuracy } = position.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          const fixTs = typeof position.timestamp === 'number' && position.timestamp > 0 ? position.timestamp : Date.now();
          const acc = accuracy != null && Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 50;

          // --- Filtro de fijos (sin bloquear para siempre: tras 3 rechazos seguidos se acepta) ---
          if (prevFix) {
            const dtSec = (fixTs - prevFix.t) / 1000;
            if (dtSec <= 0) return; // duplicado o desordenado (iOS a veces repite el último)
            const jump = getDistance(prevFix.lat, prevFix.lng, latitude, longitude);
            const impliedMps = jump / dtSec;
            const tooImprecise = acc > 80 && prevFix.acc < 40 && dtSec < 15;
            const impossibleJump = impliedMps > 85 && jump > acc + prevFix.acc; // > ~300 km/h
            if ((tooImprecise || impossibleJump) && consecutiveRejects < 3) {
              consecutiveRejects += 1;
              return;
            }
          }
          consecutiveRejects = 0;
          lastFixWallClock = Date.now();

          // iOS da -1 (y otros null) cuando no hay velocidad/rumbo: no tratarlo como dato.
          let gpsSpeed: number | null =
            rawSpeed != null && Number.isFinite(rawSpeed) && rawSpeed >= 0 ? rawSpeed : null;
          if (gpsSpeed == null && prevFix) {
            const dtSec = (fixTs - prevFix.t) / 1000;
            const moved = getDistance(prevFix.lat, prevFix.lng, latitude, longitude);
            if (dtSec >= 0.5 && dtSec <= 10) {
              // Movimiento por debajo del ruido del GPS = parado.
              gpsSpeed = moved > Math.max(3, (acc + prevFix.acc) * 0.35) ? moved / dtSec : 0;
            }
          }
          // Rumbo del GPS solo es fiable en marcha; parado oscila y hace girar el mapa.
          const gpsHeading: number | null =
            rawHeading != null && Number.isFinite(rawHeading) && rawHeading >= 0 && (gpsSpeed == null || gpsSpeed >= 1.2)
              ? rawHeading
              : null;
          prevFix = { lat: latitude, lng: longitude, t: fixTs, acc };

          setError(null);

          lastLat = latitude;
          lastLng = longitude;
          lastSpeed = gpsSpeed ?? 0;
          if (gpsHeading != null) lastHeading = gpsHeading;

          setSpeed(gpsSpeed); // meters per second
          setHeading(gpsHeading);
          setCurrentLocation({ lat: latitude, lng: longitude });
          setHorizontalAccuracy(
            accuracy != null && Number.isFinite(accuracy) && accuracy > 0 && accuracy < 5000 ? accuracy : null
          );

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

          // Socket.io: no en cada fix GPS (evita ráfagas); sí si hay movimiento, alerta nueva o pasó el intervalo mínimo.
          if (groupId !== 'REPEATED') {
            const alertRaw = extraDataRef.current?.alert ?? null;
            const alertKey =
              alertRaw && typeof alertRaw === 'object'
                ? JSON.stringify(alertRaw)
                : alertRaw != null
                  ? String(alertRaw)
                  : '';
            const lastEmit = lastSocketEmitRef.current;
            const movedSinceEmit = lastEmit
              ? getDistance(latitude, longitude, lastEmit.lat, lastEmit.lng)
              : Number.POSITIVE_INFINITY;
            const minSocketMs = 850;
            const skipBurst =
              lastEmit != null &&
              now - lastEmit.t < minSocketMs &&
              movedSinceEmit < 6 &&
              lastEmit.alertKey === alertKey;

            const payload = {
              groupId,
              uid: user.uid,
              lat: latitude,
              lng: longitude,
              speed: gpsSpeed ?? 0,
              heading: lastHeading,
              score: extraDataRef.current?.score || 0,
              timestamp: now,
              photoURL: extraDataRef.current?.photoURL || '',
              displayName: extraDataRef.current?.displayName || 'Motero',
              alert: extraDataRef.current?.alert || null,
              level: extraDataRef.current?.level || 1,
              profileFrameId: extraDataRef.current?.profileFrameId || 'none'
            };
            lastSocketPayloadRef.current = payload;
            if (!skipBurst) {
              lastSocketEmitRef.current = { t: now, lat: latitude, lng: longitude, alertKey };
              socket.volatile.emit('update-location', payload);
            }

            // Fallback persistence for cross-client visibility if socket packets are missed.
            // Use a real elapsed-time throttle to avoid burst writes on some devices.
            if (now - lastPersistRef.current >= 10000) {
              const prevPersist = lastPersistedLocRef.current;
              const movedSincePersist = prevPersist
                ? getDistance(latitude, longitude, prevPersist.lat, prevPersist.lng)
                : Number.POSITIVE_INFINITY;
              if (movedSincePersist < 20) {
                return;
              }
              lastPersistRef.current = now;
              lastPersistedLocRef.current = { lat: latitude, lng: longitude };
              setDoc(
                doc(db, 'locations', user.uid),
                {
                  // Necesario para que las reglas dejen leer esta ubicación solo a miembros de este grupo.
                  groupId,
                  uid: user.uid,
                  lat: latitude,
                  lng: longitude,
                  speed: gpsSpeed ?? 0,
                  heading: lastHeading,
                  score: extraDataRef.current?.score || 0,
                  timestamp: now,
                  photoURL: extraDataRef.current?.photoURL || '',
                  displayName: extraDataRef.current?.displayName || 'Motero',
                  level: extraDataRef.current?.level || 1,
              profileFrameId: extraDataRef.current?.profileFrameId || 'none'
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
          setHorizontalAccuracy(null);
          if (err.code === 1) {
            setError('Permiso de GPS denegado');
            return;
          }
          if (err.code === 2) {
            setError('Sin señal GPS, reconectando');
          } else if (err.code === 3) {
            setError('GPS tardando en responder, reintentando');
          } else {
            setError(err.message);
          }
          // Algunos navegadores (sobre todo iOS) dejan el watch muerto tras un error: reiniciarlo.
          scheduleRestart(3000);
        },
        {
          enableHighAccuracy,
          // Posiciones de como mucho 1 s: en moto 2,5 s de antigüedad son ~60 m de retraso a 90 km/h.
          maximumAge: 1000,
          timeout: 15000
        }
      );
      };

      const scheduleRestart = (ms: number) => {
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          restartTimer = undefined;
          if (!disposed) startWatch();
        }, ms);
      };

      startWatch();

      // Vigilante: si no llega ningún fix en 20 s con la app visible, reiniciar el watch.
      const stallCheck = setInterval(() => {
        if (disposed || document.visibilityState !== 'visible') return;
        if (lastFixWallClock > 0 && Date.now() - lastFixWallClock > 20000 && !restartTimer) {
          startWatch();
          lastFixWallClock = Date.now();
        }
      }, 5000);

      // Al volver del segundo plano iOS/Android suelen tener el watch congelado.
      const onVisible = () => {
        if (document.visibilityState === 'visible' && !disposed) startWatch();
      };
      document.addEventListener('visibilitychange', onVisible);
      cleanupExtras = () => {
        clearInterval(stallCheck);
        document.removeEventListener('visibilitychange', onVisible);
      };

      // Also emit every 5 seconds to ensure new users see everyone even if stationary
      intervalId = setInterval(() => {
        if (lastLat !== 0 && lastLng !== 0 && groupId !== 'REPEATED') {
          const t = Date.now();
          const alertRaw = extraDataRef.current?.alert ?? null;
          const alertKey =
            alertRaw && typeof alertRaw === 'object'
              ? JSON.stringify(alertRaw)
              : alertRaw != null
                ? String(alertRaw)
                : '';
          const payload = {
            groupId,
            uid: user.uid,
            lat: lastLat,
            lng: lastLng,
            speed: lastSpeed,
            heading: lastHeading,
            score: extraDataRef.current?.score || 0,
            timestamp: t,
            photoURL: extraDataRef.current?.photoURL || '',
            displayName: extraDataRef.current?.displayName || 'Motero',
            alert: extraDataRef.current?.alert || null,
            level: extraDataRef.current?.level || 1,
              profileFrameId: extraDataRef.current?.profileFrameId || 'none'
          };
          lastSocketPayloadRef.current = payload;
          lastSocketEmitRef.current = { t, lat: lastLat, lng: lastLng, alertKey };
          socket.volatile.emit('update-location', payload);
        }
      }, 5000);
    };

    let cleanupExtras: () => void = () => {};
    startTracking();

    return () => {
      disposed = true;
      cleanupExtras();
      if (restartTimer) clearTimeout(restartTimer);
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isActive, user, groupId, enableHighAccuracy]);

  return { error, speed, heading, currentLocation, courseOverGround, horizontalAccuracy };
};