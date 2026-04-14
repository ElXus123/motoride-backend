import { useState, useEffect, useRef } from 'react';
import Dashboard from './Dashboard';
import MapView from './MapView';
import Profile from './Profile';
import PendingRideInviteOverlay from './PendingRideInviteOverlay';
import WhatsNewModal from './WhatsNewModal';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { syncUserPointsAndLevelFromServer } from '../lib/userPointsSync';

export default function MainApp() {
  const { user } = useAuth();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [repeatedRoute, setRepeatedRoute] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const lastBackHandledAtRef = useRef(0);
  /** Una sola entrada `pushState` al entrar en ruta (evita doble capa con Strict Mode o re-renders). */
  const routeHistoryInsertedRef = useRef(false);
  /** Tras confirmar salida: el siguiente popstate no debe volver a interceptar. */
  const bypassRoutePopRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    
    if (joinCode && user && !activeGroupId && !autoJoining) {
      const performAutoJoin = async () => {
        setAutoJoining(true);
        try {
          const groupRef = doc(db, 'groups', joinCode.toUpperCase());
          const snap = await getDoc(groupRef);
          if (snap.exists()) {
            await updateDoc(groupRef, {
              members: arrayUnion(user.uid)
            });
            setActiveGroupId(joinCode.toUpperCase());
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } catch (e) {
          console.error("Error auto-joining:", e);
          handleFirestoreError(e, OperationType.WRITE, `groups/${joinCode.toUpperCase()}`);
        } finally {
          setAutoJoining(false);
        }
      };
      performAutoJoin();
    }
  }, [user, activeGroupId, autoJoining]);

  // Al entrar en ruta: una sola entrada en el historial (atrás = confirmar salida, no varias capas).
  useEffect(() => {
    if (!activeGroupId && !repeatedRoute) {
      routeHistoryInsertedRef.current = false;
      return;
    }
    if (routeHistoryInsertedRef.current) return;
    routeHistoryInsertedRef.current = true;
    window.history.pushState({ layer: 'route', motorideRoute: true }, '');
  }, [activeGroupId, repeatedRoute]);

  // Browser back: perfil primero; en ruta se pide confirmación (MapView escucha el evento).
  useEffect(() => {
    const onPopState = () => {
      const now = Date.now();
      if (now - lastBackHandledAtRef.current < 320) return;

      if (bypassRoutePopRef.current) {
        bypassRoutePopRef.current = false;
        lastBackHandledAtRef.current = now;
        return;
      }

      if (showProfile) {
        lastBackHandledAtRef.current = now;
        setShowProfile(false);
        return;
      }

      if (activeGroupId || repeatedRoute) {
        lastBackHandledAtRef.current = now;
        window.history.pushState({ layer: 'route', motorideRoute: true }, '');
        window.dispatchEvent(new CustomEvent('motoride:route-back'));
        return;
      }

      lastBackHandledAtRef.current = now;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [showProfile, activeGroupId, repeatedRoute]);

  useEffect(() => {
    if (showProfile) window.history.pushState({ layer: 'profile' }, '');
  }, [showProfile]);

  /** Menú principal (Dashboard): leer puntos/nivel desde el servidor y corregir en BDD si toca subir de nivel o normalizar. */
  const mainMenuVisible =
    !!user?.uid && !autoJoining && !showProfile && !activeGroupId && !repeatedRoute;

  useEffect(() => {
    if (!mainMenuVisible) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncUserPointsAndLevelFromServer(user.uid);
      } catch (e) {
        if (!cancelled) console.error('syncUserPointsAndLevelFromServer:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mainMenuVisible, user?.uid]);

  const inviteOverlay =
    user?.rideInvitePending?.groupId ? (
      <PendingRideInviteOverlay onJoinGroup={(id) => setActiveGroupId(id)} activeGroupId={activeGroupId} />
    ) : null;

  if (autoJoining) {
    return (
      <>
        {inviteOverlay}
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-zinc-400 font-medium">Uniéndote al grupo automáticamente...</p>
        </div>
      </>
    );
  }

  if (showProfile) {
    return (
      <>
        {inviteOverlay}
        <Profile
          onBack={() => setShowProfile(false)}
          onRepeatRoute={(route) => {
            setRepeatedRoute(route);
            setShowProfile(false);
          }}
        />
      </>
    );
  }

  if (activeGroupId || repeatedRoute) {
    return (
      <>
        {inviteOverlay}
        <MapView
          groupId={activeGroupId || 'REPEATED'}
          preloadedRoute={repeatedRoute}
          prepareHistoryLeave={() => {
            bypassRoutePopRef.current = true;
          }}
          onPromoteFromRepeat={(liveCode) => {
            setActiveGroupId(liveCode);
            setRepeatedRoute(null);
          }}
          onLeave={() => {
            routeHistoryInsertedRef.current = false;
            setActiveGroupId(null);
            setRepeatedRoute(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <WhatsNewModal />
      {inviteOverlay}
      <Dashboard onJoinGroup={(id) => setActiveGroupId(id)} onRepeatRoute={(route) => setRepeatedRoute(route)} onOpenProfile={() => setShowProfile(true)} />
    </>
  );
}
