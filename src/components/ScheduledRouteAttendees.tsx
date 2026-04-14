import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { calculateLevel } from '../lib/utils';
import { ChevronDown, ChevronUp, ListOrdered, Loader2 } from 'lucide-react';

export type AttendeeRow = {
  uid: string;
  displayName: string;
  level: number;
  motorcycle?: string;
};

type Props = {
  memberUids: string[];
  /** Clases del botón desplegable */
  className?: string;
  compact?: boolean;
};

/**
 * Lista desplegable de apuntados a una ruta programada (nombre, nivel, moto opcional).
 */
export default function ScheduledRouteAttendees({ memberUids, className = '', compact }: Props) {
  const [open, setOpen] = useState(false);
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
        const level = calculateLevel(pts).level;
        const displayName =
          typeof d.displayName === 'string' && d.displayName.trim() ? d.displayName.trim() : 'Motero';
        const rawMoto = d.motorcycle;
        const motorcycle =
          typeof rawMoto === 'string' && rawMoto.trim().length > 0 ? rawMoto.trim() : undefined;
        out.push({ uid, displayName, level, motorcycle });
      });
      setRows(out);
      setLoadedForUidKey(uidKey);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'users/attendees');
    } finally {
      setLoading(false);
    }
  }, [memberUids, uidKey, loadedForUidKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const count = memberUids.length;

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-800/60 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ListOrdered size={compact ? 14 : 16} className="text-orange-400 shrink-0" />
          <span className={`font-bold text-zinc-200 truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
            Apuntados ({count})
          </span>
        </span>
        {open ? (
          <ChevronUp size={compact ? 14 : 16} className="text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown size={compact ? 14 : 16} className="text-zinc-500 shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-3 py-2 space-y-2 max-h-[40vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-zinc-500">
              <Loader2 size={18} className="animate-spin" />
              <span className={compact ? 'text-[10px]' : 'text-xs'}>Cargando…</span>
            </div>
          ) : count === 0 ? (
            <p className={`text-zinc-500 text-center py-2 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              Nadie se ha apuntado aún.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r.uid}
                className={`rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-2.5 py-2 ${compact ? 'text-[10px]' : 'text-xs'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-white truncate min-w-0">{r.displayName}</p>
                  <span className="shrink-0 font-black text-orange-400 bg-orange-500/15 rounded-full px-2 py-0.5">
                    Lv.{r.level}
                  </span>
                </div>
                {r.motorcycle && (
                  <p className="text-zinc-400 mt-1 leading-snug line-clamp-2">{r.motorcycle}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
