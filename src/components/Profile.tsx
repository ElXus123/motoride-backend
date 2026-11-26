import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import {
  doc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth, logOut, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { ArrowLeft, Camera, LogOut, ChevronDown, ChevronUp, Activity, Trash2, Play, Clock, Shield, X, Trophy, Sun, Moon, SunMoon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import type { ThemeChoice } from '../lib/theme';
import PremiumBadge from './PremiumBadge';
import AdminPointsPanel from './AdminPointsPanel';
import { formatRideCardSubtitle, formatRideCardTitle, rideHistoryPointsEarned } from '../lib/rideHistoryDisplay';
import MedalShowcase from './MedalShowcase';
import { MEDAL_DEFINITIONS, listUnlockedMedalIds } from '../lib/achievements';
import { FRAME_CATALOG, getEquippedFrame, getUnlockedFrameIds, sanitizeProfileFrameId } from '../lib/frames';
import { AvatarFrame } from './AvatarFrame';
import { Button, Card, Chip, Eyebrow, TextField, Title } from './ui';

const THEME_OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Automático', Icon: SunMoon },
];

type Props = {
  onBack: () => void;
  onRepeatRoute: (routeGeoJSON: string) => void;
};

/** Botón circular de icono sobre papel (tacto 44 px). */
const ICON_BTN =
  'mr-focus inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mr-line-strong bg-mr-paper text-mr-ink transition-colors hover:bg-mr-line';

export default function Profile({ onBack, onRepeatRoute }: Props) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const { choice: themeChoice, resolved: resolvedTheme, setChoice: setThemeChoice } = useTheme();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [motorcycle, setMotorcycle] = useState('');
  const [loading, setLoading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [userData, setUserData] = useState<any>(null);

  const [rideHistory, setRideHistory] = useState<any[]>([]);
  const [indexBuilding, setIndexBuilding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailRide, setDetailRide] = useState<Record<string, unknown> & { id: string } | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [medalsCatalogOpen, setMedalsCatalogOpen] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === 'juarp123@gmail.com';

  // Marcos: stats para el desbloqueo (nivel, medallas, VIP, retos de temporada) y marco equipado.
  const frameStats = { ...(userData || {}), isPremium: user?.isPremium === true || userData?.isPremium === true };
  const equippedFrame = getEquippedFrame(frameStats, userData?.profileFrameId);
  const unlockedFrameIds = new Set(getUnlockedFrameIds(frameStats));

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (docSnap) => {
        const data = docSnap.data();
        setUserData(data);
        if (data?.motorcycle != null) setMotorcycle(String(data.motorcycle));
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      }
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const historyQ = query(
      collection(db, 'rideHistory'),
      where('uid', '==', user.uid),
      orderBy('endTime', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(
      historyQ,
      (snapshot) => {
        setRideHistory(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setIndexBuilding(false);
      },
      (error) => {
        if (error.message.includes('index') && error.message.includes('building')) {
          setIndexBuilding(true);
        }
        console.error('Historial perfil:', error);
        handleFirestoreError(error, OperationType.LIST, 'rideHistory');
      }
    );
    return unsub;
  }, [user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoURL(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (!user || !auth.currentUser) return;
    setLoading(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName,
      });
      await updateDoc(doc(db, 'users', user.uid), {
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoURL,
        motorcycle: motorcycle.trim().slice(0, 120),
      });
      showMessage({ variant: 'success', title: 'Perfil', message: 'Perfil actualizado.' });
    } catch (error) {
      console.error('Error updating profile:', error);
      showMessage({ variant: 'error', title: 'Perfil', message: 'Error al actualizar el perfil.' });
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
    setLoading(false);
  };

  /** Equipa un marco desbloqueado; se guarda al instante (no depende del botón Guardar). */
  const equipFrame = async (frameId: string) => {
    if (!user) return;
    const safeId = sanitizeProfileFrameId(frameId, frameStats);
    try {
      await updateDoc(doc(db, 'users', user.uid), { profileFrameId: safeId });
    } catch (error) {
      console.error('Error al equipar marco:', error);
      showMessage({ variant: 'error', title: 'Marco', message: 'No se pudo equipar el marco.' });
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const deleteRide = (rideId: string) => setDeletingId(rideId);

  const confirmDeleteRide = async (rideId: string) => {
    try {
      await deleteDoc(doc(db, 'rideHistory', rideId));
      showMessage({ variant: 'success', title: 'Historial', message: 'Ruta eliminada del historial.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rideHistory/${rideId}`);
    }
    setDeletingId(null);
    if (detailRide?.id === rideId) {
      setDetailRide(null);
    }
  };

  const repeatFromHistory = useCallback(
    (gpx: string) => {
      if (!gpx) return;
      onRepeatRoute(gpx);
      onBack();
    },
    [onRepeatRoute, onBack]
  );

  const formatRideDuration = (ride: Record<string, unknown>) => {
    const dm = ride.durationMs;
    if (typeof dm === 'number' && Number.isFinite(dm) && dm >= 0) {
      const totalSec = Math.floor(dm / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      if (m >= 120) {
        const h = Math.floor(m / 60);
        const rm = m % 60;
        return `${h}h ${rm}m`;
      }
      return `${m}m ${s}s`;
    }
    const st = ride.startTime;
    const et = ride.endTime;
    if (typeof st === 'number' && typeof et === 'number' && et >= st) {
      return formatRideDuration({ durationMs: et - st } as Record<string, unknown>);
    }
    return '—';
  };

  const isPremium = user?.isPremium === true || userData?.isPremium === true;

  return (
    <div className="mr-page min-h-dvh text-mr-ink pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto max-w-md pt-2 pb-10 sm:max-w-2xl">
        {/* Cabecera: volver, titular y panel de admin */}
        <header className="mb-6 flex items-end justify-between gap-3 pb-4 after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:bg-[repeating-linear-gradient(90deg,rgb(245_138_31/0.7)_0_7px,transparent_7px_13px)] relative">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onBack} className={ICON_BTN} aria-label="Volver">
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <Eyebrow>Tu cuenta</Eyebrow>
              <Title level={1} size="lg" className="truncate">Mi perfil</Title>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminPanel(true)}
              className={ICON_BTN}
              title="Panel de administración"
              aria-label="Panel de administración"
            >
              <Shield size={20} />
            </button>
          )}
        </header>

        {/* Identidad: foto, marco, premium, nivel y estadísticas */}
        <Card as="section" ticket padding="none" className="flex flex-col items-center p-6 pb-8">
          <div className="relative mb-6 group">
            <AvatarFrame frameId={equippedFrame.id} size={128}>
              <div
                className="h-32 w-32 overflow-hidden rounded-full border-4 border-mr-accent bg-mr-line"
              >
                {photoURL ? (
                  <img src={photoURL} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-mr-muted">Sin foto</div>
                )}
              </div>
            </AvatarFrame>
            <label className="absolute bottom-0 right-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-mr-ink bg-mr-accent text-mr-on-accent shadow-sm transition-colors hover:bg-mr-accent-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-mr-accent-text">
              <Camera size={20} aria-hidden="true" />
              <span className="sr-only">Cambiar foto de perfil</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          {isPremium && (
            <div className="mb-4">
              <PremiumBadge />
            </div>
          )}

          {userData &&
            (() => {
              const totalPoints = Math.max(0, Number(userData.points || 0));
              const storedLevel = Math.max(1, Math.floor(Number(userData.level) || 1));
              const { level, pointsForNextLevel, prevLevelPoints } = calculateLevel(totalPoints, storedLevel);
              const levelProgress = totalPoints - prevLevelPoints;
              const levelRequired = pointsForNextLevel - prevLevelPoints;
              return (
                <div className="mb-6 w-full">
                  <div className="mb-2 flex items-end justify-between gap-2">
                    <span className="font-display text-3xl font-bold uppercase leading-none text-mr-ink">Nivel {level}</span>
                    <span className="text-sm font-semibold text-mr-muted">
                      <span className="font-bold text-mr-ink tabular-nums">{totalPoints}</span>
                      {' / '}
                      {pointsForNextLevel} pts
                    </span>
                  </div>
                  <div
                    className="h-3 overflow-hidden rounded-full border border-mr-line-strong bg-mr-page"
                    role="progressbar"
                    aria-label="Progreso de nivel"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(Math.min((levelProgress / levelRequired) * 100, 100))}
                  >
                    <div
                      className="h-full rounded-full bg-mr-accent transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min((levelProgress / levelRequired) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })()}

          <div className="mb-6 grid w-full grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-mr-line bg-mr-page px-4 py-3 text-center">
              <p className="mb-1 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Km totales</p>
              <p className="font-display text-3xl font-bold leading-none text-mr-ink tabular-nums">{(userData?.totalDistance || 0).toFixed(1)}</p>
            </div>
            <div className="rounded-[14px] border border-mr-line bg-mr-page px-4 py-3 text-center">
              <p className="mb-1 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Curvas totales</p>
              <p className="font-display text-3xl font-bold leading-none text-mr-ink tabular-nums">
                {(userData?.totalLeftTurns || 0) + (userData?.totalRightTurns || 0)}
              </p>
            </div>
          </div>

          {/* Marco de perfil */}
          {userData && (
            <div className="mb-6 w-full">
              <div className="mb-2 flex items-baseline justify-between gap-2 text-xs font-bold text-mr-muted">
                <span className="text-mr-accent-text">Marco de perfil</span>
                <span>
                  {unlockedFrameIds.size} / {FRAME_CATALOG.length} desbloqueados
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Marco de perfil">
                {FRAME_CATALOG.map((frame) => {
                  const unlocked = unlockedFrameIds.has(frame.id);
                  const selected = equippedFrame.id === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${frame.name}${unlocked ? '' : ' (bloqueado)'}: ${frame.description}`}
                      disabled={!unlocked}
                      onClick={() => unlocked && equipFrame(frame.id)}
                      title={unlocked ? frame.description : `Bloqueado: ${frame.description}`}
                      className={`mr-focus flex min-h-[44px] flex-col items-center gap-1 rounded-[12px] border p-2 text-[11px] font-semibold leading-tight transition-colors ${
                        selected
                          ? 'border-mr-ink bg-mr-accent text-mr-on-accent'
                          : 'border-mr-line bg-mr-paper text-mr-muted hover:bg-mr-line'
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <AvatarFrame frameId={unlocked ? frame.id : 'none'} size={28}>
                        <span className="h-7 w-7 rounded-full bg-mr-line" />
                      </AvatarFrame>
                      <span className="line-clamp-2 w-full text-center leading-tight">{frame.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vitrina de medallas */}
          {user && userData && (
            <div className="mb-6 w-full rounded-[14px] border border-mr-line bg-mr-page p-4">
              <MedalShowcase user={userData} ownerUid={user.uid} />
              <button
                type="button"
                onClick={() => setMedalsCatalogOpen((o) => !o)}
                className="mr-focus mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-mr-line-strong bg-mr-paper py-2 text-sm font-bold text-mr-ink transition-colors hover:bg-mr-line"
              >
                {medalsCatalogOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                Catálogo de medallas ({listUnlockedMedalIds(userData).length}/{MEDAL_DEFINITIONS.length})
              </button>
              {medalsCatalogOpen && (
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-left">
                  {MEDAL_DEFINITIONS.map((m) => {
                    const ok = m.isUnlocked(userData);
                    return (
                      <li
                        key={m.id}
                        className={`flex gap-2 rounded-[10px] border px-3 py-2 text-xs ${
                          ok ? 'border-mr-accent bg-mr-paper' : 'border-mr-line bg-mr-paper opacity-75'
                        }`}
                      >
                        <Trophy size={14} aria-hidden="true" className={`mt-0.5 shrink-0 ${ok ? 'text-mr-accent-text' : 'text-mr-subtle'}`} />
                        <div className="min-w-0">
                          <p className="font-bold text-mr-ink">{m.title}</p>
                          <p className="text-[0.75rem] leading-snug text-mr-muted">{m.subtitle}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Datos del motero */}
          <div className="w-full space-y-4">
            <TextField
              label="Nombre de motero"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-motorcycle" className="text-sm font-semibold text-mr-ink">
                Tu moto
              </label>
              <textarea
                id="profile-motorcycle"
                value={motorcycle}
                onChange={(e) => setMotorcycle(e.target.value.slice(0, 120))}
                placeholder="Ej: Yamaha MT-07 2022"
                rows={2}
                className="mr-field resize-none text-sm placeholder:text-mr-subtle"
              />
              <p className="text-[0.8125rem] text-mr-muted tabular-nums">{motorcycle.length}/120</p>
            </div>

            <Button variant="primary" size="lg" fullWidth onClick={saveProfile} disabled={loading} className="mt-2">
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </Card>

        {/* Historial de rutas (desplegable) */}
        <Card as="section" padding="none" className="mt-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
            className="mr-focus flex min-h-[56px] w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-mr-line"
          >
            <span className="flex items-center gap-2 font-display text-2xl font-bold uppercase leading-none text-mr-ink">
              <Activity className="text-mr-accent-text" size={20} aria-hidden="true" />
              Historial de rutas
            </span>
            {historyOpen ? (
              <ChevronUp size={20} className="text-mr-muted" aria-hidden="true" />
            ) : (
              <ChevronDown size={20} className="text-mr-muted" aria-hidden="true" />
            )}
          </button>
          {historyOpen && (
            <div className="border-t border-mr-line px-3 pb-5 pt-4 sm:px-5">
              {indexBuilding && (
                <div className="mb-4 flex items-center gap-2 rounded-[12px] border border-mr-line-strong bg-mr-page p-3">
                  <Clock className="shrink-0 text-mr-ink" size={16} aria-hidden="true" />
                  <p className="text-sm font-semibold text-mr-ink">Cargando historial…</p>
                </div>
              )}
              <div className="max-h-[55vh] space-y-4 overflow-y-auto overflow-x-hidden px-0.5 sm:px-0">
                {rideHistory.length > 0 ? (
                  rideHistory.map((ride) => (
                    <Card key={ride.id} ticket padding="none" className="flex flex-col gap-2 p-4 sm:p-5">
                      <button
                        type="button"
                        onClick={() => setDetailRide(ride)}
                        className="mr-focus -m-1 w-full rounded-[10px] p-1 text-left transition-colors hover:bg-mr-line"
                      >
                        <h4 className="pr-2 font-display text-2xl font-bold uppercase leading-tight text-mr-ink">
                          {formatRideCardTitle(ride.groupName, ride.endTime)}
                        </h4>
                        <p className="text-sm text-mr-muted">{formatRideCardSubtitle(ride.endTime)}</p>
                        <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-1 pr-2">
                          <span className="text-sm">
                            <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">
                              Dist.{' '}
                            </span>
                            <span className="font-semibold text-mr-ink tabular-nums">
                              {ride.distance != null ? Number(ride.distance).toFixed(1) : '—'} km
                            </span>
                          </span>
                          <span className="text-sm">
                            <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">
                              Pts{' '}
                            </span>
                            <span className="font-bold text-mr-accent-text tabular-nums">
                              +{rideHistoryPointsEarned(ride)}
                            </span>
                          </span>
                        </div>
                      </button>
                      {ride.routeGeoJSON && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            repeatFromHistory(ride.routeGeoJSON as string);
                          }}
                          className="mr-btn-ghost mt-2 w-full self-start sm:w-auto"
                        >
                          <Play size={14} aria-hidden="true" /> Repetir ruta
                        </button>
                      )}
                    </Card>
                  ))
                ) : (
                  !indexBuilding && <p className="py-6 text-center text-sm text-mr-muted">Aún no hay rutas guardadas</p>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Tema: claro, oscuro o automático (sigue la configuración del móvil) */}
        <Card as="section" aria-labelledby="theme-settings-title" className="mt-6 p-5">
          <Eyebrow>Pantalla</Eyebrow>
          <h2 id="theme-settings-title" className="mr-title mt-1 text-[1.625rem]">Tema</h2>
          <div role="group" aria-labelledby="theme-settings-title" className="mt-4 flex flex-wrap gap-2">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <Chip
                key={value}
                selected={themeChoice === value}
                onClick={() => setThemeChoice(value)}
                icon={<Icon size={16} />}
              >
                {label}
              </Chip>
            ))}
          </div>
          <p className="mt-3 text-[0.8125rem] text-mr-muted">
            {themeChoice === 'system'
              ? `Sigue la configuración de tu móvil (ahora: ${resolvedTheme === 'dark' ? 'oscuro' : 'claro'}).`
              : 'Se aplica al momento y queda guardado en este dispositivo.'}
          </p>
        </Card>

        <button
          onClick={logOut}
          className="mr-focus mt-8 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] py-3 text-base font-bold text-mr-danger transition-colors hover:bg-mr-line"
        >
          <LogOut size={20} aria-hidden="true" />
          Cerrar Sesión
        </button>
      </div>

      {showAdminPanel && isAdmin && <AdminPointsPanel onClose={() => setShowAdminPanel(false)} />}

      {detailRide && (
        <div
          className="mr-scrim-enter fixed inset-0 z-[6000] flex items-end justify-center bg-[#14110e73] p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ride-detail-title"
          onClick={() => {
            setDeletingId(null);
            setDetailRide(null);
          }}
        >
          <div
            className="mr-sheet mr-sheet-enter flex max-h-[88dvh] w-full flex-col overflow-y-auto p-5 pb-6 sm:max-h-[min(90dvh,640px)] sm:max-w-md sm:rounded-[22px] sm:border"
            onClick={(e) => e.stopPropagation()}
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-mr-line-strong sm:hidden" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-mr-ink bg-mr-accent text-mr-on-accent">
                  <Trophy size={24} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <Eyebrow>Ruta</Eyebrow>
                  <h2 id="ride-detail-title" className="mr-title truncate text-3xl uppercase leading-none">
                    {String(detailRide.groupName || 'Ruta')}
                  </h2>
                  <p className="mt-1 text-sm text-mr-muted">
                    {detailRide.endTime != null
                      ? `${new Date(detailRide.endTime as number).toLocaleDateString()} · ${new Date(
                          detailRide.endTime as number
                        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeletingId(null);
                  setDetailRide(null);
                }}
                className={ICON_BTN}
                aria-label="Cerrar"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="rounded-[14px] border border-mr-line bg-mr-page p-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Distancia</p>
                <p className="mt-1 font-display text-2xl font-bold leading-none text-mr-ink tabular-nums">
                  {detailRide.distance != null ? Number(detailRide.distance).toFixed(1) : '—'}{' '}
                  <span className="text-sm font-semibold text-mr-muted">km</span>
                </p>
              </div>
              <div className="rounded-[14px] border border-mr-line bg-mr-page p-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Tiempo</p>
                <p className="mt-1 font-display text-2xl font-bold leading-none text-mr-ink tabular-nums">{formatRideDuration(detailRide)}</p>
              </div>
              <div className="rounded-[14px] border border-mr-line bg-mr-page p-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Puntos</p>
                <p className="mt-1 font-display text-2xl font-bold leading-none text-mr-accent-text tabular-nums">
                  +{Math.round(Number(detailRide.score ?? detailRide.pointsEarned ?? 0))}
                </p>
              </div>
              <div className="rounded-[14px] border border-mr-line bg-mr-page p-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Curvas (I / D)</p>
                <p className="mt-1 font-display text-2xl font-bold leading-none text-mr-ink tabular-nums">
                  {detailRide.leftTurns != null ? Number(detailRide.leftTurns) : '—'} /{' '}
                  {detailRide.rightTurns != null ? Number(detailRide.rightTurns) : '—'}
                </p>
              </div>
              <div className="col-span-2 rounded-[14px] border border-mr-line bg-mr-page p-3">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-muted">Inclinación máx.</p>
                <p className="mt-1 font-display text-xl font-bold leading-none text-mr-ink tabular-nums">
                  Izq. {detailRide.maxLeanLeft != null ? Number(detailRide.maxLeanLeft) : '—'}° · Der.{' '}
                  {detailRide.maxLeanRight != null ? Number(detailRide.maxLeanRight) : '—'}°
                </p>
              </div>
            </div>

            {typeof detailRide.baseScore === 'number' && (
              <p className="mt-3 text-sm text-mr-muted">
                Puntos base +{Math.round(detailRide.baseScore)}
                {typeof detailRide.pointsEarned === 'number' && detailRide.pointsEarned !== detailRide.baseScore && (
                  <span> · Total +{Math.round(Number(detailRide.pointsEarned))}</span>
                )}
              </p>
            )}

            {typeof detailRide.foodExpenseEuros === 'number' && detailRide.foodExpenseEuros > 0 && (
              <div className="mt-4 rounded-[14px] border border-mr-line-strong bg-mr-paper p-3 text-left">
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-mr-accent-text">Gastos (escote)</p>
                <p className="mt-1 text-sm tabular-nums text-mr-ink">
                  Total {detailRide.foodExpenseEuros.toFixed(2)} €
                  {typeof detailRide.splitPerPersonEuros === 'number' && (
                    <span className="text-mr-muted">
                      {' '}
                      · ~{detailRide.splitPerPersonEuros.toFixed(2)} € / persona
                      {typeof detailRide.memberCountForSplit === 'number'
                        ? ` (${detailRide.memberCountForSplit})`
                        : ''}
                    </span>
                  )}
                </p>
              </div>
            )}

            {detailRide.routeGeoJSON && typeof detailRide.routeGeoJSON === 'string' && (
              <Button
                variant="primary"
                fullWidth
                size="lg"
                className="mt-5"
                icon={<Play size={18} />}
                onClick={() => {
                  repeatFromHistory(detailRide.routeGeoJSON as string);
                  setDetailRide(null);
                }}
              >
                Repetir esta ruta
              </Button>
            )}

            <div className="mt-4 border-t border-mr-line pt-4">
              {deletingId === detailRide.id ? (
                <div className="flex flex-col gap-2">
                  <p className="text-center text-sm text-mr-ink">¿Eliminar esta ruta del historial? No se puede deshacer.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void confirmDeleteRide(detailRide.id)}
                      className="mr-focus min-h-[44px] flex-1 rounded-[12px] border border-[#a3261c] bg-[#a3261c] text-sm font-bold text-[#fbf8f2] transition-colors hover:bg-[#8a1f17]"
                    >
                      Sí, eliminar
                    </button>
                    <Button variant="ghost" className="flex-1" onClick={() => setDeletingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => deleteRide(detailRide.id)}
                  className="mr-focus flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-[#a3261c] bg-mr-paper py-3 text-sm font-bold text-mr-danger transition-colors hover:bg-mr-line"
                >
                  <Trash2 size={18} aria-hidden="true" /> Eliminar del historial
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
