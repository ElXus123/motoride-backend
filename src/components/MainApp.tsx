import { useState, useEffect, useRef, Suspense } from 'react';
import Dashboard from './Dashboard';
import MapView from './MapView';
import Profile from './Profile';
import PendingRideInviteOverlay from './PendingRideInviteOverlay';
import WhatsNewModal from './WhatsNewModal';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { syncUserPointsAndLevelFromServer } from '../lib/userPointsSync';
import { formatScheduledRideDayOnlyEs } from '../lib/scheduledRouteShare';
import { useMotorideSystemNotifications } from '../hooks/useMotorideSystemNotifications';
import { registerWebPushFcm, startForegroundFcmListeners, stopForegroundFcmListeners } from '../lib/fcmWeb';
import NotificationPermissionBanner from './NotificationPermissionBanner';
import { Calendar, Loader2, MapPin } from 'lucide-react';

type ScheduledJoinPromptState =
  | null
  | {
      code: string;
      name: string;
      scheduledTimestamp: number;
      variant: 'confirm' | 'alreadyMember';
    };

export default function MainApp() {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [repeatedRoute, setRepeatedRoute] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [scheduledJoinPrompt, setScheduledJoinPrompt] = useState<ScheduledJoinPromptState>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const lastBackHandledAtRef = useRef(0);
  /** Logo animado al cargar: visible hasta que haya datos de Firebase o cache. */
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  /** Una sola entrada `pushState` al entrar en ruta (evita doble capa con Strict Mode o re-renders). */
  const routeHistoryInsertedRef = useRef(false);
  /** Tras confirmar salida: el siguiente popstate no debe volver a interceptar. */
  const bypassRoutePopRef = useRef(false);

  /** `?join=` : rutas programadas → modal para apuntarse (no entrar al GPS); rutas en vivo → unión y mapa como antes. */
  useEffect(() => {
    if (!user?.uid || activeGroupId) return;
    const params = new URLSearchParams(window.location.search);
    const joinRaw = params.get('join');
    if (!joinRaw) return;
    const code = joinRaw.toUpperCase().trim();
    if (code.length !== 6) return;

    window.history.replaceState({}, document.title, window.location.pathname);

    setAutoJoining(true);
    void (async () => {
      try {
        const groupRef = doc(db, 'groups', code);
        const snap = await getDoc(groupRef);
        if (!snap.exists()) {
          showMessage({
            variant: 'error',
            title: 'Enlace',
            message: 'No hay ninguna ruta con este código. Comprueba el enlace o pide otro al organizador.',
          });
          return;
        }
        const d = snap.data();
        const isScheduled = d.isScheduled === true;
        const members = Array.isArray(d.members) ? d.members.map((x: unknown) => String(x)) : [];
        const already = members.includes(user.uid);

        if (isScheduled) {
          setScheduledJoinPrompt({
            code,
            name: (String(d.name || 'Ruta').trim() || 'Ruta').slice(0, 100),
            scheduledTimestamp: typeof d.scheduledTimestamp === 'number' ? d.scheduledTimestamp : 0,
            variant: already ? 'alreadyMember' : 'confirm',
          });
          return;
        }

        if (already) {
          setActiveGroupId(code);
          return;
        }
        await updateDoc(groupRef, {
          members: arrayUnion(user.uid),
        });
        setActiveGroupId(code);
      } catch (e) {
        console.error('Error auto-joining:', e);
        handleFirestoreError(e, OperationType.WRITE, `groups/${code}`);
      } finally {
        setAutoJoining(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reaccionar a usuario y salida de mapa; no repetir al cambiar handlers de mensaje
  }, [user?.uid, activeGroupId]);

  useEffect(() => {
    if (!user) setScheduledJoinPrompt(null);
  }, [user]);

  // Logo animado al cargar + fallback si hay errores de conexión
  useEffect(() => {
    let mounted = true;

    const hideLoadingScreen = () => {
      if (!mounted) return;
      mounted = false;
      setShowLoadingScreen(false);
    };

    // Timeout más largo: 5 segundos para dar tiempo a carga con cache o datos locales
    const timeout = setTimeout(() => hideLoadingScreen(), 5000);

    // Esperar a que el mapa cargue o haya datos de Firebase
    if (activeGroupId) {
      hideLoadingScreen();
    }

    // Si el usuario está cargando, ocultamos loading tras 3s
    if (user?.uid && !activeGroupId) {
      // Esperamos a que Dashboard cargue los datos
      const userTimeout = setTimeout(() => hideLoadingScreen(), 3000);
      return () => clearTimeout(userTimeout);
    }

    return () => clearTimeout(timeout);
  }, [user?.uid, activeGroupId, showLoadingScreen]);

  useMotorideSystemNotifications(user?.uid);

  useEffect(() => {
    if (!user?.uid) {
      stopForegroundFcmListeners();
      return;
    }
    const init = async () => {
      try {
        startForegroundFcmListeners();
      } catch (e) {
        console.warn('Error inittando FCM:', e);
        // Si falla FCM, no bloqueamos la app
      }
    };
    void init();
    return () => stopForegroundFcmListeners();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const t = window.setTimeout(() => {
      void registerWebPushFcm(user.uid);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [user?.uid]);

  // Manejo de errores globales para evitar pantalla negra
  const handleGlobalError = (error: unknown) => {
    console.error('Error global MotoRide:', error);
    // No bloqueamos la app; el usuario sigue usando con datos locales
  };

  const acceptScheduledRsvp = async () => {
    if (!user?.uid || !scheduledJoinPrompt || scheduledJoinPrompt.variant !== 'confirm') return;
    setRsvpBusy(true);
    try {
      await updateDoc(doc(db, 'groups', scheduledJoinPrompt.code), {
        members: arrayUnion(user.uid),
      });
      showMessage({
        variant: 'success',
        title: 'Apuntado',
        message:
          'Quedas en la lista de la ruta. La verás en «Mis próximas rutas»; usa «Chat» para acordar con el grupo. Desde 1 h antes podrás entrar al mapa y al chat de voz.',
      });
      setScheduledJoinPrompt(null);
    } catch (e) {
      handleGlobalError(e);
      setRsvpBusy(false);
    }
  };

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

  const inviteOverlay = user?.uid ? (
    <PendingRideInviteOverlay onJoinGroup={(id) => setActiveGroupId(id)} activeGroupId={activeGroupId} />
  ) : null;

  const notificationBanner =
    user && !autoJoining ? <NotificationPermissionBanner userUid={user.uid} /> : null;

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
        {notificationBanner}
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

  const dayLabel =
    scheduledJoinPrompt && scheduledJoinPrompt.scheduledTimestamp > 0
      ? formatScheduledRideDayOnlyEs(scheduledJoinPrompt.scheduledTimestamp)
      : '';

  return (
    <>
      {notificationBanner}
      <WhatsNewModal />
      {inviteOverlay}
      {scheduledJoinPrompt && (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-zinc-950/90 p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scheduled-join-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-zinc-900 p-6 shadow-2xl ring-1 ring-white/[0.05]">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/20 text-orange-400">
                <Calendar size={22} aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 id="scheduled-join-title" className="text-lg font-black leading-tight text-white">
                  {scheduledJoinPrompt.variant === 'alreadyMember'
                    ? 'Ya estás apuntado'
                    : '¿Apuntarte a esta ruta programada?'}
                </h2>
                <p className="mt-1 font-semibold text-zinc-100">{scheduledJoinPrompt.name}</p>
                {dayLabel ? (
                  <p className="mt-1 text-sm text-zinc-400">Salida: {dayLabel}</p>
                ) : null}
              </div>
            </div>
            {scheduledJoinPrompt.variant === 'confirm' ? (
              <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                Si te apuntas, la ruta aparecerá en tu inicio. El mapa en vivo solo está disponible desde 1 h antes de la
                hora acordada.
              </p>
            ) : (
              <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                Este enlace es para unirse a la lista. Ya figurabas como apuntado; no hace falta hacer nada más hasta la
                hora de salida.
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {scheduledJoinPrompt.variant === 'confirm' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setScheduledJoinPrompt(null)}
                    disabled={rsvpBusy}
                    className="w-full rounded-2xl border border-zinc-600 bg-zinc-800 py-3.5 font-bold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50 sm:w-auto sm:min-w-[120px]"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => void acceptScheduledRsvp()}
                    disabled={rsvpBusy}
                    className="w-full rounded-2xl bg-orange-500 py-3.5 font-black text-zinc-950 hover:bg-orange-400 disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
                  >
                    {rsvpBusy ? 'Guardando…' : 'Sí, apuntarme'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setScheduledJoinPrompt(null)}
                  className="w-full rounded-2xl bg-orange-500 py-3.5 font-black text-zinc-950 hover:bg-orange-400 sm:ml-auto sm:w-auto sm:min-w-[140px]"
                >
                  Entendido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {showLoadingScreen && (
        <div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black"
          role="alert"
          aria-live="polite"
        >
          <div className="relative flex flex-col items-center">
            {/* Logo animado */}
            <div className="relative mb-8">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl overflow-hidden ring-4 ring-orange-500/20 shadow-[0_0_60px_-15px_rgba(249,115,22,0.5)]">
                <img
                  src="/ICONO.png"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  aria-hidden
                />
                {/* Gleam animado */}
                <div
                  className="absolute inset-0 logo-gleam pointer-events-none mix-blend-overlay"
                  style={{
                    background:
                      'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.45) 45%, rgba(255,255,255,0.15) 55%, transparent 100%)',
                    width: '42%',
                    height: '160%',
                    top: '-30%',
                  }}
                />
              </div>
              {/* Reflexión */}
              <div className="absolute left-0 top-0 h-24 w-24 scale-y-[-1] [transform:rotateX(12deg)_scaleY(-1)] origin-top [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.2)_45%,transparent_100%)] [webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.2)_45%,transparent_100%)] mix-blend-overlay blur-[0.35px] brightness-105" aria-hidden />
            </div>
            <div className="flex items-center gap-3 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-orange-400" aria-hidden />
              <p className="text-sm font-semibold text-zinc-300">Cargando MotoRide</p>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black">
          <Loader2 className="h-12 w-12 animate-spin text-orange-400" />
        </div>
      }>
        <Dashboard onJoinGroup={(id) => setActiveGroupId(id)} onRepeatRoute={(route) => setRepeatedRoute(route)} onOpenProfile={() => setShowProfile(true)} />
      </Suspense>
    </>
  );
}
