import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { ListOrdered, Loader2, User as UserIcon, X } from 'lucide-react';

export type AttendeeRow = {
  uid: string;
  displayName: string;
  level: number;
  motorcycle?: string;
  photoURL?: string;
};

type Props = {
  memberUids: string[];
  /** Margen/espaciado donde antes iba el bloque desplegable (p. ej. `mb-3`). */
  className?: string;
  /** Cada incremento abre el popup y carga perfiles (botón «Ver lista de apuntados»). */
  expandNonce?: number;
};

/**
 * Solo popup de apuntados (sin lista desplegable en la tarjeta). Fotos de perfil desde Firestore.
 */
export default function ScheduledRouteAttendees({
  memberUids,
  className = '',
  expandNonce = 0,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedForUidKey, setLoadedForUidKey] = useState<string | null>(null);

  const uidKey = useMemo(
    () =>
      [...memberUids]
        .map((u) => String(u || '').trim())
        .filter(Boolean)
        .sort()
        .join(','),
    [memberUids]
  );

  useEffect(() => {
    setLoadedForUidKey(null);
  }, [uidKey]);

  const load = useCallback(async () => {
    if (memberUids.length === 0) {
      setRows([]);
      setLoadedForUidKey(uidKey);
      return;
    }
    if (loadedForUidKey === uidKey) return;
    setLoading(true);
    try {
      const snaps = await Promise.all(
        memberUids.map((uid) => getDoc(doc(db, 'users', String(uid).trim())).catch(() => null))
      );
      const out: AttendeeRow[] = [];
      snaps.forEach((snap, i) => {
        const uid = String(memberUids[i] || '').trim();
        if (!uid) return;
        if (!snap?.exists()) {
          out.push({ uid, displayName: 'Usuario', level: 1 });
          return;
        }
        const d = snap.data() as Record<string, unknown>;
        const pts = Math.max(0, Number(d.points || 0));
        const storedLv = Math.max(1, Math.floor(Number(d.level) || 1));
        const level = calculateLevel(pts, storedLv).level;
        const displayName =
          typeof d.displayName === 'string' && d.displayName.trim() ? d.displayName.trim() : 'Motero';
        const rawMoto = d.motorcycle;
        const motorcycle =
          typeof rawMoto === 'string' && rawMoto.trim().length > 0 ? rawMoto.trim() : undefined;
        const rawPhoto = d.photoURL;
        const photoURL =
          typeof rawPhoto === 'string' && rawPhoto.trim().length > 0 ? rawPhoto.trim() : undefined;
        out.push({ uid, displayName, level, motorcycle, photoURL });
      });
      setRows(out);
      setLoadedForUidKey(uidKey);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'users/attendees');
    } finally {
      setLoading(false);
    }
  }, [memberUids, uidKey, loadedForUidKey]);

  useEffect(() => {
    if (expandNonce < 1) return;
    setModalOpen(true);
    void load();
  }, [expandNonce, load]);

  useEffect(() => {
    if (!modalOpen || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const closeModal = () => setModalOpen(false);

  const count = memberUids.length;

  const modal =
    modalOpen &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-zinc-950/92"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendees-modal-title"
        onClick={closeModal}
      >
        <div
          className="w-full max-w-md max-h-[min(85dvh,560px)] flex flex-col bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800 bg-gradient-to-b from-orange-500/10 to-transparent shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ListOrdered size={20} className="text-orange-400 shrink-0" />
              <h2 id="attendees-modal-title" className="text-lg font-black text-white truncate">
                Apuntados ({count})
              </h2>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-2 [transform:translateZ(0)]">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-zinc-500">
                <Loader2 size={28} className="animate-spin text-orange-500" />
                <span className="text-sm">Cargando…</span>
              </div>
            ) : count === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-10">Nadie se ha apuntado aún.</p>
            ) : (
              rows.map((r) => (
                <div
                  key={r.uid}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-3 py-3 text-sm flex gap-3 items-start"
                >
                  <div className="w-11 h-11 shrink-0 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 ring-1 ring-zinc-700/50">
                    {r.photoURL ? (
                      <img
                        src={r.photoURL}
                        alt=""
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <UserIcon size={22} className="text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-white truncate min-w-0">{r.displayName}</p>
                      <span className="shrink-0 font-black text-orange-400 bg-orange-500/15 rounded-full px-2.5 py-0.5 text-xs">
                        Lv.{r.level}
                      </span>
                    </div>
                    {r.motorcycle && (
                      <p className="text-zinc-400 mt-1.5 text-xs leading-snug line-clamp-2">{r.motorcycle}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      {/* Espaciado opcional (p. ej. mb-3) sin fila «Apuntados» desplegable */}
      {className ? <div className={className} aria-hidden /> : null}
      {modal}
    </>
  );
}
