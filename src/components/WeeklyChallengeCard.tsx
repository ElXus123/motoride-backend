import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { addPointsWithLevelUps, PROGRESS_MODEL_VERSION } from '../lib/levelProgress';
import { loadWeeklyChallengeConfig } from '../lib/weeklyChallengeConfig';
import {
  canClaimWeeklyReward,
  evaluateWeeklyChallenge,
  getIsoWeekKey,
  readLocalClaimedWeeks,
  rememberLocalClaimedWeek,
  WEEKLY_CHALLENGES,
  type WeeklyChallengeConfig,
  type WeeklyChallengeProgress,
  type WeeklyRideInput,
} from '../lib/weeklyChallenges';

/**
 * Bloque «Reto de la semana». Cobra una vez por semana (users.weeklyChallengeLastClaimed).
 * Estados: en curso → completado (cobrable) → premio cobrado.
 */
export function WeeklyChallengeCard({ uid, className = '' }: { uid: string; className?: string }) {
  const weekKey = useMemo(() => getIsoWeekKey(new Date()), []);
  const [rides, setRides] = useState<WeeklyRideInput[]>([]);
  const [challenges, setChallenges] = useState<WeeklyChallengeConfig[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastClaimed, setLastClaimed] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const [rideSnap, userSnap, cfg] = await Promise.all([
          // Misma consulta que el perfil (uid + endTime desc): reutiliza el índice existente.
          getDocs(query(collection(db, 'rideHistory'), where('uid', '==', uid), orderBy('endTime', 'desc'), limit(80))),
          getDoc(doc(db, 'users', uid)),
          // Retos de la configuración (panel de admin); si falla, valores por defecto.
          loadWeeklyChallengeConfig(),
        ]);
        if (cancelled) return;
        setRides(rideSnap.docs.map((d) => d.data() as WeeklyRideInput));
        setLastClaimed(userSnap.exists() ? (userSnap.data().weeklyChallengeLastClaimed ?? null) : null);
        setChallenges(cfg);
      } catch (err) {
        console.error('WeeklyChallengeCard: no se pudieron cargar los datos del reto', err);
        if (!cancelled) setError('No se pudo cargar el reto. Revisa la conexión.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const state: WeeklyChallengeProgress = useMemo(
    () => evaluateWeeklyChallenge(weekKey, rides, challenges ?? WEEKLY_CHALLENGES),
    [weekKey, rides, challenges]
  );
  const rewardPoints = state.challenge.rewardPoints;
  const seasonFrame = state.challenge.seasonFrameId;
  const localClaimed = useMemo(() => readLocalClaimedWeeks(uid), [uid, claiming]);
  const alreadyClaimed = !canClaimWeeklyReward(weekKey, lastClaimed, localClaimed);

  const claim = async () => {
    if (!state.completed || alreadyClaimed || claiming || !uid) return;
    setClaiming(true);
    setError(null);
    try {
      // Lectura fresca del perfil antes de escribir para no pisar puntos de otras rutas.
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      const data = snap.exists() ? snap.data() : {};
      if (!canClaimWeeklyReward(weekKey, data.weeklyChallengeLastClaimed, readLocalClaimedWeeks(uid))) {
        setLastClaimed(String(data.weeklyChallengeLastClaimed ?? weekKey));
        return;
      }
      const currentPoints = Math.max(0, Math.floor(Number(data.points) || 0));
      const currentLevel = Math.max(1, Math.floor(Number(data.level) || 1));
      const next = addPointsWithLevelUps(currentPoints, currentLevel, rewardPoints);
      await updateDoc(userRef, {
        points: next.points,
        level: next.level,
        progressModel: PROGRESS_MODEL_VERSION,
        weeklyChallengeLastClaimed: weekKey,
        weeklyChallengeClaims: Math.max(0, Math.floor(Number(data.weeklyChallengeClaims) || 0)) + 1,
      });
      rememberLocalClaimedWeek(uid, weekKey);
      setLastClaimed(weekKey);
    } catch (err) {
      console.error('WeeklyChallengeCard: error al cobrar', err);
      setError('No se pudo cobrar la recompensa. Inténtalo de nuevo.');
    } finally {
      setClaiming(false);
    }
  };

  const { challenge } = state;
  const pct = Math.round(state.ratio * 100);

  // Estado visible: en curso → completado (cobrable) → premio cobrado.
  type Status = 'loading' | 'progress' | 'ready' | 'claimed';
  const status: Status = loading
    ? 'loading'
    : alreadyClaimed
      ? 'claimed'
      : state.completed
        ? 'ready'
        : 'progress';

  const chip: Record<Exclude<Status, 'loading'>, { label: string; cls: string }> = {
    progress: { label: 'En curso', cls: 'border-mr-line bg-mr-line text-mr-ink' },
    ready: { label: 'Completado', cls: 'border-mr-accent/60 bg-mr-accent/15 text-mr-accent-text' },
    claimed: { label: 'Premio cobrado', cls: 'border-mr-line bg-mr-line/60 text-mr-muted' },
  };

  return (
    <section
      className={`mr-surface p-5 sm:p-6 ${className}`}
      aria-label="Reto de la semana"
      aria-busy={loading}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mr-eyebrow">Reto de la semana</p>
          <h3 className="mr-display mt-1 text-3xl uppercase leading-none text-mr-ink sm:text-4xl">{challenge.title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-mono text-[11px] text-mr-muted">{weekKey}</span>
          {status !== 'loading' && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip[status].cls}`}>
              {chip[status].label}
            </span>
          )}
        </div>
      </header>

      <p className="mt-3 text-sm leading-relaxed text-mr-muted">{challenge.description}</p>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-sm tabular-nums text-mr-ink">
            {loading ? (
              <span className="text-mr-muted">Cargando…</span>
            ) : (
              <>
                <span className="text-2xl font-bold text-mr-accent-text">{state.progress}</span>
                <span className="text-mr-muted">
                  {' '}
                  / {state.target} {challenge.unit}
                </span>
              </>
            )}
          </p>
          {!loading && status !== 'claimed' && (
            <p className="text-xs text-mr-muted">
              {status === 'ready' ? 'Objetivo alcanzado' : state.remainingText}
            </p>
          )}
        </div>
        {!loading && state.parts.length > 1 && (
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs tabular-nums text-mr-muted">
            {state.parts.map((p) => (
              <li key={p.label}>
                <span className="text-mr-ink">{p.value}</span> / {p.target} {p.unit}
              </li>
            ))}
          </ul>
        )}
        <div
          className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-mr-line"
          role="progressbar"
          aria-label={`Progreso del reto: ${pct}%`}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${
              status === 'claimed' ? 'bg-mr-subtle' : 'bg-mr-accent'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-mr-line pt-4">
        <p className="text-xs text-mr-muted">
          Recompensa <span className="font-semibold text-mr-ink">{rewardPoints} pts</span>
          {seasonFrame ? ' y progreso de marco de temporada' : ''}
        </p>
        {status === 'claimed' ? (
          <span className="text-xs font-semibold text-mr-muted">Cobrado esta semana</span>
        ) : (
          <button
            type="button"
            onClick={claim}
            disabled={status !== 'ready' || claiming}
            className="mr-focus rounded-[var(--radius-control)] bg-mr-accent px-4 py-2 text-sm font-bold text-mr-on-accent transition-colors hover:bg-mr-accent-hover disabled:cursor-not-allowed disabled:bg-mr-line disabled:text-mr-muted"
          >
            {claiming ? 'Cobrando…' : status === 'ready' ? 'Cobrar premio' : 'Sigue rodando'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-[#a3261c]">
          {error}
        </p>
      )}
    </section>
  );
}
