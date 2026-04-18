import { useMemo, useState } from 'react';
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

  const unlockedIds = useMemo(() => listUnlockedMedalIds(user ?? null), [user]);
  const unlockedSet = useMemo(() => new Set(unlockedIds), [unlockedIds]);

  const triple = useMemo(() => {
    const raw = (user as Record<string, unknown> | null | undefined)?.profileShowcaseMedalIds;
    return sanitizeMedalShowcaseTriple(raw, user ?? null);
  }, [user]);

  const editable = Boolean(ownerUid) && !readOnly;

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
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="shrink-0 text-amber-500" size={18} aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-400">Vitrina de medallas</p>
            <p className="text-[10px] text-zinc-500 truncate">
              {editable ? 'Elige hasta 3 logros para tu perfil.' : 'Logros destacados.'}
            </p>
          </div>
        </div>
        {editable && unlockedIds.length > 0 && (
          <span className="text-[10px] font-bold text-zinc-500 tabular-nums">{unlockedIds.length} desbloq.</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {triple.map((mid, idx) => {
          const def = mid ? getMedalDefinition(mid) : null;
          return (
            <div
              key={idx}
              className={`relative flex flex-col items-center rounded-2xl border bg-gradient-to-b p-2 sm:p-3 ${
                def
                  ? 'border-zinc-600/80 from-zinc-800/90 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'border-zinc-800 border-dashed from-zinc-900/50 to-zinc-950/80'
              }`}
            >
              <div className="relative flex h-[72px] w-full items-center justify-center sm:h-[80px]">
                {def ? (
                  <MedalGlyph def={def} size={56} className="drop-shadow-md" />
                ) : (
                  <div className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-600">
                    Vacío
                  </div>
                )}
              </div>
              {def && (
                <p className="mt-1 line-clamp-2 text-center text-[9px] font-bold leading-tight text-zinc-300 sm:text-[10px]">
                  {def.title}
                </p>
              )}
              {editable && (
                <div className="mt-2 flex w-full flex-wrap justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditSlot(idx);
                      setPickerOpen(true);
                    }}
                    className="rounded-lg bg-orange-500/15 px-2 py-1 text-[9px] font-black uppercase text-orange-300 hover:bg-orange-500/25"
                  >
                    Elegir
                  </button>
                  {def ? (
                    <button
                      type="button"
                      onClick={() => clearSlot(idx)}
                      className="rounded-lg bg-zinc-800 px-2 py-1 text-[9px] font-bold text-zinc-400 hover:bg-zinc-700"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && unlockedIds.length === 0 && (
        <p className="mt-3 text-center text-[11px] text-zinc-500">
          Completa rutas con grabación para desbloquear medallas (km, curvas, inclinación, velocidad…).
        </p>
      )}

      {editable && pickerOpen && (
        <div
          className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Elegir medalla"
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <p className="text-sm font-black text-white">Tus medallas</p>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setEditSlot(null);
                }}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {MEDAL_DEFINITIONS.filter((m) => unlockedSet.has(m.id)).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={saving}
                    onClick={() => assignSlot(m.id)}
                    className="flex flex-col items-center rounded-xl border border-zinc-700 bg-zinc-950 p-2 text-left transition-colors hover:border-orange-500/50 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    <MedalGlyph def={m} size={48} />
                    <p className="mt-1 line-clamp-2 text-center text-[10px] font-bold text-zinc-200">{m.title}</p>
                  </button>
                ))}
              </div>
              {unlockedIds.length === 0 && (
                <p className="py-8 text-center text-sm text-zinc-500">Aún no tienes medallas desbloqueadas.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
