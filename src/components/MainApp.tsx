import { useState, useEffect, useRef } from 'react';
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
import { Calendar } from 'lucide-react';

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
          'Quedas en la lista de la ruta. La verás en «Mis próximas rutas»; desde 1 h antes de la hora podrás entrar al mapa y al chat.',
      });
      setScheduledJoinPrompt(null);
    } catch (e) {
      console.error('acceptScheduledRsvp:', e);
      handleFirestoreError(e, OperationType.WRITE, `groups/${scheduledJoinPrompt.code}`);
    } finally {
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

  const dayLabel =
    scheduledJoinPrompt && scheduledJoinPrompt.scheduledTimestamp > 0
      ? formatScheduledRideDayOnlyEs(scheduledJoinPrompt.scheduledTimestamp)
      : '';

  return (
    <>
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
      <Dashboard onJoinGroup={(id) => setActiveGroupId(id)} onRepeatRoute={(route) => setRepeatedRoute(route)} onOpenProfile={() => setShowProfile(true)} />
    </>
  );
}
