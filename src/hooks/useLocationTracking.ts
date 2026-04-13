import { useEffect, useState, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDistance } from '../lib/geoUtils';
import socket from '../lib/socket';

export const useLocationTracking = (isActive: boolean, groupId: string, extraData?: any) => {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);

  const extraDataRef = useRef(extraData);
  useEffect(() => {
    extraDataRef.current = extraData;
  }, [extraData]);

  // Join group room on socket
  useEffect(() => {
    if (groupId && groupId !== 'REPEATED' && user) {
      socket.emit('join-group', { groupId, uid: user.uid });
    }

    const rejoinOnConnect = () => {
      if (groupId && groupId !== 'REPEATED' && user) {
        socket.emit('join-group', { groupId, uid: user.uid });
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
          
          lastLat = latitude;
          lastLng = longitude;
          lastSpeed = gpsSpeed || 0;
          lastHeading = gpsHeading || 0;

          setSpeed(gpsSpeed); // meters per second
          setHeading(gpsHeading);
          setCurrentLocation({ lat: latitude, lng: longitude });
          
          const now = Date.now();
          
          // Broadcast location and score via Socket.io EVERY SECOND (or whenever GPS updates)
          // This costs ZERO Firestore quota
          if (groupId !== 'REPEATED') {
            socket.emit('update-location', {
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
            });

            // Fallback persistence for cross-client visibility if socket packets are missed.
            if (now % 10000 < 1200) {
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
          setError(err.message);
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
          socket.emit('update-location', {
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
          });
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

  return { error, speed, heading, currentLocation };
};