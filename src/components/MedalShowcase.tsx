import { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAppMessage } from '../contexts/AppMessageContext';
import {
  MEDAL_DEFINITIONS,
  getMedalDefinition,
  listUnlockedMedalIds,
  sanitizeMedalShowcaseTriple,
  type UserMedalStats,
} from '../lib/achievements';
import MedalGlyph from './MedalGlyph';
import { Trophy, X } from 'lucide-react';

const SLOTS = 3;

type Props = {
  user: UserMedalStats | null | undefined;
  /** Si se pasa, permite editar y guardar vitrina */
  ownerUid?: string;
  readOnly?: boolean;
};

export default function MedalShowcase({ user, ownerUid, readOnly }: Props) {
  const showMessage = useAppMessage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailMedalId, setDetailMedalId] = useState<string | null>(null);

  const unlockedIds = useMemo(() => listUnlockedMedalIds(user ?? null), [user]);
  const unlockedSet = useMemo(() => new Set(unlockedIds), [unlockedIds]);

  const triple = useMemo(() => {
    const raw = (user as Record<string, unknown> | null | undefined)?.profileShowcaseMedalIds;
    return sanitizeMedalShowcaseTriple(raw, user ?? null);
  }, [user]);

  const editable = Boolean(ownerUid) && !readOnly;

  const detailDef = useMemo(
    () => (detailMedalId ? getMedalDefinition(detailMedalId) : undefined),
    [detailMedalId],
  );

  useEffect(() => {
    if (!detailMedalId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailMedalId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailMedalId]);

  const persistTriple = async (next: [string, string, string]) => {
    if (!ownerUid) return;
    const cleaned = sanitizeMedalShowcaseTriple(next, user ?? null);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', ownerUid), { profileShowcaseMedalIds: [...cleaned] });
      showMessage({ variant: 'success', title: 'Medallas', message: 'Vitrina actualizada.' });
      setPickerOpen(false);
      setEditSlot(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${ownerUid}`);
      showMessage({
        variant: 'error',
        title: 'Medallas',
        message: 'No se pudo guardar la vitrina. Revisa conexión y reglas de Firestore.',
      });
    } finally {
      setSaving(false);
    }
  };

  const assignSlot = (medalId: string) => {
    if (editSlot === null || !editable) return;
    const t: [string, string, string] = [triple[0] ?? '', triple[1] ?? '', triple[2] ?? ''];
    t[editSlot] = medalId;
    for (let i = 0; i < SLOTS; i++) {
      if (i !== editSlot && t[i] === medalId) t[i] = '';
    }
    void persistTriple(t);
  };

  const clearSlot = (idx: number) => {
    if (!editable) return;
    const t: [string, string, string] = [triple[0] ?? '', triple[1] ?? '', triple[2] ?? ''];
    t[idx] = '';
    void persistTriple(t);
  };

  return (
    <div className="w-full">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mr-eyebrow">Vitrina de medallas</p>
          <p className="mt-1 text-xs leading-snug text-mr-muted">
            {editable
              ? 'Hasta 3 logros en tu perfil. Pulsa una medalla para ver qué mide.'
              : 'Logros destacados. Pulsa una medalla para ver qué mide.'}
          </p>
        </div>
        {unlockedIds.length > 0 && (
          <span className="shrink-0 rounded-full border border-mr-line bg-mr-line px-2.5 py-1 text-[11px] font-bold tabular-nums text-mr-ink">
            {unlockedIds.length}/{MEDAL_DEFINITIONS.length}
          </span>
        )}
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Vitrina">
        {triple.map((mid, idx) => {
          const def = mid ? getMedalDefinition(mid) : null;
          return (
            <li
              key={idx}
              className={`relative flex flex-col items-center rounded-[var(--radius-card)] p-2 sm:p-3 ${
                def ? 'mr-surface' : 'border border-dashed border-mr-line-strong bg-mr-paper'
              }`}
            >
              {def ? (
                <button
                  type="button"
                  onClick={() => setDetailMedalId(mid)}
                  className="mr-focus flex w-full flex-col items-center rounded-[var(--radius-control)] p-0 text-center transition-transform duration-200 ease-out active:scale-[0.98]"
                  aria-label={`Ver qué mide: ${def.title}`}
                >
                  <div className="flex h-[72px] w-full items-center justify-center sm:h-[84px]">
                    <MedalGlyph def={def} size={60} className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]" />
                  </div>
                  <p className="mt-1.5 line-clamp-2 min-h-[2.2em] text-center font-display text-[13px] font-bold uppercase leading-tight tracking-wide text-mr-ink sm:text-sm">
                    {def.title}
                  </p>
                </button>
              ) : (
                <div className="flex h-[72px] w-full items-center justify-center sm:h-[84px]">
                  <span className="font-display text-xs font-bold uppercase tracking-[0.18em] text-mr-subtle">Vacío</span>
                </div>
              )}
              {editable && (
                <div className="mt-2 flex w-full flex-wrap justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditSlot(idx);
                      setPickerOpen(true);
                    }}
                    className="mr-focus min-h-[32px] rounded-[var(--radius-control)] bg-mr-accent/20 px-2.5 py-1 text-[11px] font-bold text-mr-accent-text transition-colors hover:bg-mr-accent-hover/20"
                  >
                    {def ? 'Cambiar' : 'Elegir'}
                  </button>
                  {def ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSlot(idx);
                      }}
                      className="mr-focus min-h-[32px] rounded-[var(--radius-control)] bg-mr-line px-2.5 py-1 text-[11px] font-semibold text-mr-muted transition-colors hover:bg-mr-line hover:text-mr-ink"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editable && unlockedIds.length === 0 && (
        <p className="mt-3 text-center text-xs leading-relaxed text-mr-muted">
          Completa rutas con grabación para desbloquear medallas (km, curvas, inclinación, velocidad…).
        </p>
      )}

      {detailMedalId && (
        <div
          className="fixed inset-0 z-[6100] flex items-end justify-center bg-[#14110e73] p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="medal-detail-title"
          onClick={() => setDetailMedalId(null)}
        >
          <div
            className="mr-sheet w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-mr-line px-5 py-3.5">
              <p className="mr-eyebrow">Medalla</p>
              <button
                type="button"
                onClick={() => setDetailMedalId(null)}
                className="mr-focus rounded-full p-2 text-mr-muted transition-colors hover:bg-mr-line hover:text-mr-ink"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-6 text-center">
              {detailDef ? (
                <>
                  <div className="mx-auto flex justify-center">
                    <MedalGlyph def={detailDef} size={96} className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.5)]" />
                  </div>
                  <h3 id="medal-detail-title" className="mt-5 font-display text-3xl font-bold uppercase leading-none tracking-wide text-mr-ink">
                    {detailDef.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-mr-muted">{detailDef.subtitle}</p>
                </>
              ) : (
                <p className="text-sm text-mr-muted">No hay información para esta medalla.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {editable && pickerOpen && (
        <div
          className="fixed inset-0 z-[6000] flex items-end justify-center bg-[#14110e73] p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="medal-picker-title"
        >
          <div className="mr-sheet flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-mr-line px-5 py-3.5">
              <div>
                <p className="mr-eyebrow">Elige para la vitrina</p>
                <p id="medal-picker-title" className="mt-0.5 font-display text-2xl font-bold uppercase leading-none tracking-wide text-mr-ink">
                  Tus medallas
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setEditSlot(null);
                }}
                className="mr-focus rounded-full p-2 text-mr-muted transition-colors hover:bg-mr-line hover:text-mr-ink"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="custom-scrollbar overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MEDAL_DEFINITIONS.filter((m) => unlockedSet.has(m.id)).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={saving}
                    onClick={() => assignSlot(m.id)}
                    className="mr-focus flex min-h-[44px] flex-col items-center rounded-[var(--radius-card)] border border-mr-line bg-mr-page/60 p-2.5 text-center transition-colors hover:border-mr-accent hover:bg-mr-line disabled:opacity-50"
                  >
                    <MedalGlyph def={m} size={52} />
                    <p className="mt-1.5 line-clamp-2 text-[11px] font-bold leading-tight text-mr-ink">{m.title}</p>
                  </button>
                ))}
              </div>
              {unlockedIds.length === 0 && (
                <p className="py-8 text-center text-sm text-mr-muted">Aún no tienes medallas desbloqueadas.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
