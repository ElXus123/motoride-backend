import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { Pencil, Plus, Power, Save, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { clearWeeklyChallengeConfigCache } from '../lib/weeklyChallengeConfig';
import {
  getActiveWeeklyChallenges,
  makeWeeklyChallengeId,
  parseWeeklyChallengeConfig,
  validateWeeklyChallengeDraft,
  WEEKLY_CHALLENGES,
  WEEKLY_CHALLENGE_LIMITS,
  WEEKLY_CHALLENGE_METRICS,
  weeklyChallengeUnit,
  type WeeklyChallengeConfig,
  type WeeklyChallengeMetric,
} from '../lib/weeklyChallenges';

/** Borrador del formulario: todo como texto para poder editar campos vacíos sin pelearse con el input. */
type Draft = {
  /** null = reto nuevo (el id se genera al guardar). */
  id: string | null;
  title: string;
  description: string;
  metric: WeeklyChallengeMetric;
  target: string;
  targetCurves: string;
  minLean: string;
  minKm: string;
  rewardPoints: string;
  enabled: boolean;
  seasonFrameId: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  title: '',
  description: '',
  metric: 'km',
  target: '100',
  targetCurves: '50',
  minLean: '35',
  minKm: '80',
  rewardPoints: '300',
  enabled: true,
  seasonFrameId: '',
};

const fieldClass =
  'mt-1 w-full rounded-[var(--radius-control)] border border-white/[0.1] bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 mr-focus';

function draftFrom(c: WeeklyChallengeConfig): Draft {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    metric: c.metric,
    target: String(c.target),
    targetCurves: String(c.targetCurves ?? 50),
    minLean: String(c.minLean ?? 35),
    minKm: String(c.minKm ?? 80),
    rewardPoints: String(c.rewardPoints),
    enabled: c.enabled,
    seasonFrameId: c.seasonFrameId ?? '',
  };
}

/** Convierte el borrador en configuración (sin validar). El id nuevo se genera aquí. */
function configFromDraft(d: Draft): WeeklyChallengeConfig {
  const id = d.id ?? makeWeeklyChallengeId(d.title || 'reto');
  const base: WeeklyChallengeConfig = {
    id,
    title: d.title.trim(),
    description: d.description.trim(),
    metric: d.metric,
    target: Number(d.target),
    rewardPoints: Number(d.rewardPoints),
    enabled: d.enabled,
    seasonFrameId: d.seasonFrameId.trim() || null,
  };
  if (d.metric === 'kmAndCurves') base.targetCurves = Number(d.targetCurves);
  if (d.metric === 'leanRides') base.minLean = Number(d.minLean);
  if (d.metric === 'longRides') base.minKm = Number(d.minKm);
  return base;
}

/** Documento que se escribe en Firestore: solo las claves que permiten las reglas. */
function payloadFrom(c: WeeklyChallengeConfig, uid: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: c.id,
    title: c.title,
    description: c.description,
    metric: c.metric,
    target: c.target,
    rewardPoints: c.rewardPoints,
    enabled: c.enabled,
    seasonFrameId: c.seasonFrameId ?? null,
    updatedAt: Date.now(),
    updatedBy: uid,
  };
  if (c.metric === 'kmAndCurves') out.targetCurves = c.targetCurves;
  if (c.metric === 'leanRides') out.minLean = c.minLean;
  if (c.metric === 'longRides') out.minKm = c.minKm;
  return out;
}

const metricLabel = (m: WeeklyChallengeMetric) => WEEKLY_CHALLENGE_METRICS.find((x) => x.id === m)?.label ?? m;

/** Vista previa con el mismo lenguaje visual que WeeklyChallengeCard (progreso 0, sin datos reales). */
function ChallengePreview({ draft }: { draft: Draft }) {
  const c = configFromDraft(draft);
  const unit = weeklyChallengeUnit(c.metric);
  const target = Number.isFinite(c.target) ? c.target : 0;
  const parts =
    c.metric === 'kmAndCurves'
      ? [
          { label: 'km', target, unit: 'km' as const },
          { label: 'curvas', target: c.targetCurves ?? 0, unit: 'curvas' as const },
        ]
      : [{ label: unit, target, unit }];
  return (
    <section className="mr-surface p-5 sm:p-6" aria-label="Vista previa del reto">
      <header>
        <p className="mr-eyebrow">Reto de la semana</p>
        <h4 className="mr-display mt-1 text-3xl uppercase leading-none text-zinc-50 break-words">
          {c.title || 'Título del reto'}
        </h4>
      </header>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">{c.description || 'Descripción del reto.'}</p>
      <div className="mt-5">
        <p className="font-mono text-sm tabular-nums text-zinc-100">
          <span className="text-2xl font-bold text-amber-400">0</span>
          <span className="text-zinc-500"> / {target} {unit}</span>
        </p>
        {parts.length > 1 && (
          <ul className="mt-1.5 flex flex-wrap gap-x-4 font-mono text-xs tabular-nums text-zinc-400">
            {parts.map((p) => (
              <li key={p.label}>
                <span className="text-zinc-200">0</span> / {p.target} {p.unit}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <div className="h-full w-0 rounded-full bg-amber-500" />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <p className="text-xs text-zinc-400">
          Recompensa <span className="font-semibold text-zinc-200">{Number.isFinite(c.rewardPoints) ? c.rewardPoints : 0} pts</span>
          {c.seasonFrameId ? ' y progreso de marco de temporada' : ''}
        </p>
        <span className="rounded-[var(--radius-control)] bg-white/[0.06] px-4 py-2 text-sm font-bold text-zinc-500">
          Sigue rodando
        </span>
      </div>
    </section>
  );
}

export default function AdminWeeklyChallenges() {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const isAdmin = user?.email?.toLowerCase() === 'juarp123@gmail.com';

  const [items, setItems] = useState<WeeklyChallengeConfig[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = onSnapshot(
      collection(db, 'weeklyChallenges'),
      (snap) => {
        const parsed: WeeklyChallengeConfig[] = [];
        let bad = 0;
        snap.docs.forEach((d) => {
          const c = parseWeeklyChallengeConfig(d.id, d.data());
          if (c) parsed.push(c);
          else bad++;
        });
        setItems(parsed.sort((a, b) => a.title.localeCompare(b.title, 'es')));
        setInvalidCount(bad);
        setLoaded(true);
      },
      (err) => {
        console.error('weeklyChallenges', err);
        setLoaded(true);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  const activeNow = useMemo(() => getActiveWeeklyChallenges(items), [items]);
  const usingDefaults = items.filter((c) => c.enabled).length === 0;

  if (!isAdmin) return null;

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const openNew = () => {
    setFormError(null);
    setDraft({ ...EMPTY_DRAFT });
  };

  const openEdit = (c: WeeklyChallengeConfig) => {
    setFormError(null);
    setDraft(draftFrom(c));
  };

  const save = async () => {
    if (!draft) return;
    const cfg = configFromDraft(draft);
    const err = validateWeeklyChallengeDraft(cfg);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await setDoc(doc(db, 'weeklyChallenges', cfg.id), payloadFrom(cfg, user?.uid ?? null));
      clearWeeklyChallengeConfigCache();
      showMessage({ variant: 'success', title: 'Retos', message: 'Reto guardado. Se aplica a la tarjeta de la semana.' });
      setDraft(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `weeklyChallenges/${cfg.id}`);
      setFormError('No se pudo guardar. ¿Están desplegadas las reglas de weeklyChallenges?');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: WeeklyChallengeConfig) => {
    try {
      await updateDoc(doc(db, 'weeklyChallenges', c.id), {
        enabled: !c.enabled,
        updatedAt: Date.now(),
        updatedBy: user?.uid ?? null,
      });
      clearWeeklyChallengeConfigCache();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `weeklyChallenges/${c.id}`);
      showMessage({ variant: 'error', title: 'Retos', message: 'No se pudo cambiar el estado del reto.' });
    }
  };

  const createDefaults = async () => {
    if (!window.confirm('Se crearán los 7 retos por defecto en Firestore. ¿Continuar?')) return;
    try {
      const batch = writeBatch(db);
      WEEKLY_CHALLENGES.forEach((c) => batch.set(doc(db, 'weeklyChallenges', c.id), payloadFrom(c, user?.uid ?? null)));
      await batch.commit();
      clearWeeklyChallengeConfigCache();
      showMessage({ variant: 'success', title: 'Retos', message: 'Retos por defecto creados.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'weeklyChallenges');
      showMessage({ variant: 'error', title: 'Retos', message: 'No se pudieron crear los retos por defecto.' });
    }
  };

  const L = WEEKLY_CHALLENGE_LIMITS;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mr-display text-2xl uppercase leading-none text-zinc-50">Retos semanales</h3>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Cada semana se elige uno de los retos activos (siempre el mismo para todos en esa semana). Si cambias la lista a mitad
          de semana, el reto de esa semana puede cambiar. Si desactivas todos, la app usa los retos por defecto.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Activos ahora: <span className="font-semibold text-amber-300">{activeNow.length}</span>
          {usingDefaults && <span className="text-zinc-500"> (valores por defecto)</span>}
          {invalidCount > 0 && <span className="text-red-400"> · {invalidCount} documento(s) no válidos, ignorados</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-zinc-300">Lista</h4>
            <button
              type="button"
              onClick={openNew}
              className="mr-focus inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
            >
              <Plus size={14} aria-hidden /> Nuevo reto
            </button>
          </div>

          {!loaded && <p className="text-xs text-zinc-500">Cargando retos…</p>}
          {loaded && items.length === 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/50 p-4 space-y-3">
              <p className="text-xs text-zinc-400">No hay retos en Firestore. La app usa los 7 retos por defecto.</p>
              <button
                type="button"
                onClick={() => void createDefaults()}
                className="mr-focus rounded-[var(--radius-control)] border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/10"
              >
                Crear retos por defecto en Firestore
              </button>
            </div>
          )}

          <ul className="space-y-2">
            {items.map((c) => (
              <li
                key={c.id}
                className={`mr-surface p-3 sm:p-4 ${c.enabled ? '' : 'opacity-60'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-100 break-words">{c.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 break-words">{c.description}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      c.enabled
                        ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
                        : 'border-white/[0.1] bg-white/[0.04] text-zinc-400'
                    }`}
                  >
                    {c.enabled ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[11px] tabular-nums text-zinc-500">
                  {metricLabel(c.metric)} · objetivo {c.target}
                  {c.metric === 'kmAndCurves' ? ` km / ${c.targetCurves} curvas` : ` ${weeklyChallengeUnit(c.metric)}`} · {c.rewardPoints} pts
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="mr-focus inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                  >
                    <Pencil size={13} aria-hidden /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggle(c)}
                    aria-pressed={c.enabled}
                    className="mr-focus inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                  >
                    <Power size={13} aria-hidden /> {c.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {draft && (
          <div className="space-y-4">
            <div className="mr-surface p-4 sm:p-5 space-y-4" role="form" aria-label={draft.id ? 'Editar reto' : 'Nuevo reto'}>
              <div className="flex items-center justify-between gap-2">
                <h4 className="mr-display text-xl uppercase leading-none text-zinc-50">
                  {draft.id ? 'Editar reto' : 'Nuevo reto'}
                </h4>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="mr-focus rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Cerrar editor"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="block text-sm text-zinc-300">
                Título
                <input
                  value={draft.title}
                  maxLength={L.titleMax}
                  onChange={(e) => patch('title', e.target.value)}
                  placeholder="Ej. Semana de curvas"
                  className={fieldClass}
                />
                <span className="text-[10px] text-zinc-600">{draft.title.length}/{L.titleMax}</span>
              </label>

              <label className="block text-sm text-zinc-300">
                Descripción
                <textarea
                  value={draft.description}
                  maxLength={L.descriptionMax}
                  rows={2}
                  onChange={(e) => patch('description', e.target.value)}
                  placeholder="Qué tiene que hacer el usuario"
                  className={fieldClass}
                />
                <span className="text-[10px] text-zinc-600">{draft.description.length}/{L.descriptionMax}</span>
              </label>

              <label className="block text-sm text-zinc-300">
                Tipo de métrica
                <select
                  value={draft.metric}
                  onChange={(e) => patch('metric', e.target.value as WeeklyChallengeMetric)}
                  className={fieldClass}
                >
                  {WEEKLY_CHALLENGE_METRICS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-zinc-600">
                  {WEEKLY_CHALLENGE_METRICS.find((m) => m.id === draft.metric)?.hint}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-zinc-300">
                  {draft.metric === 'kmAndCurves'
                    ? 'Objetivo de km'
                    : `Objetivo (${weeklyChallengeUnit(draft.metric)})`}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={L.targetMin}
                    max={L.targetMax}
                    value={draft.target}
                    onChange={(e) => patch('target', e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="text-sm text-zinc-300">
                  Recompensa (pts)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={L.rewardMin}
                    max={L.rewardMax}
                    value={draft.rewardPoints}
                    onChange={(e) => patch('rewardPoints', e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>

              {draft.metric === 'kmAndCurves' && (
                <label className="block text-sm text-zinc-300">
                  Curvas totales
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={L.targetMax}
                    value={draft.targetCurves}
                    onChange={(e) => patch('targetCurves', e.target.value)}
                    className={fieldClass}
                  />
                </label>
              )}
              {draft.metric === 'leanRides' && (
                <label className="block text-sm text-zinc-300">
                  Inclinación mínima por ruta (grados)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={L.minLeanMax}
                    value={draft.minLean}
                    onChange={(e) => patch('minLean', e.target.value)}
                    className={fieldClass}
                  />
                </label>
              )}
              {draft.metric === 'longRides' && (
                <label className="block text-sm text-zinc-300">
                  Km mínimos por ruta
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={L.minKmMax}
                    value={draft.minKm}
                    onChange={(e) => patch('minKm', e.target.value)}
                    className={fieldClass}
                  />
                </label>
              )}

              <label className="block text-sm text-zinc-300">
                Marco de temporada que promociona (opcional)
                <input
                  value={draft.seasonFrameId}
                  maxLength={L.seasonFrameIdMax}
                  onChange={(e) => patch('seasonFrameId', e.target.value)}
                  placeholder="Ej. season_pulse"
                  className={fieldClass}
                />
              </label>

              <label className="flex items-center gap-3 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => patch('enabled', e.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                Reto activo (puede salir esta semana)
              </label>

              {formError && (
                <p role="alert" className="text-xs text-red-400">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  disabled={saving}
                  className="mr-focus rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="mr-focus inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-amber-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  <Save size={15} aria-hidden /> {saving ? 'Guardando…' : 'Guardar reto'}
                </button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-600">Vista previa</p>
              <ChallengePreview draft={draft} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
