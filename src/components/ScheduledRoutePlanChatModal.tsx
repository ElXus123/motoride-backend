import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type FirestoreError,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { markPlanChatRead } from '../hooks/useMailboxChatUnread';
import { X, Send } from 'lucide-react';

type PlanMsg = {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  createdAt: number;
};

function tsToMs(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as Timestamp).toMillis === 'function') {
    try {
      return (v as Timestamp).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

function isFirestoreError(e: unknown): e is FirestoreError {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as FirestoreError).code === 'string';
}

function firestoreUserMessage(e: unknown): string {
  if (isFirestoreError(e)) {
    if (e.code === 'permission-denied') {
      return 'No tienes permiso para usar este chat. Comprueba que sigues apuntado al grupo y que el código es correcto.';
    }
    if (e.code === 'unavailable' || e.code === 'deadline-exceeded') {
      return 'Sin conexión con el servidor. Inténtalo de nuevo en unos segundos.';
    }
  }
  return 'No se pudo completar la acción. Comprueba la conexión e inténtalo otra vez.';
}

export default function ScheduledRoutePlanChatModal({
  open,
  onClose,
  groupId,
  groupName,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}): ReactElement | null {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const resolvedGroupId = useMemo(() => (groupId || '').trim().toUpperCase(), [groupId]);

  const [items, setItems] = useState<PlanMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !user?.uid || !resolvedGroupId || items.length === 0) return;
    let max = 0;
    for (const m of items) {
      if (typeof m.createdAt === 'number' && m.createdAt > max) max = m.createdAt;
    }
    void markPlanChatRead(user.uid, resolvedGroupId, max);
  }, [open, user?.uid, resolvedGroupId, items]);

  useEffect(() => {
    if (!open || !resolvedGroupId) {
      setItems([]);
      return;
    }
    const q = query(
      collection(db, 'groups', resolvedGroupId, 'planMessages'),
      orderBy('createdAt', 'desc'),
      limit(80)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        try {
          const next: PlanMsg[] = [];
          snap.forEach((d) => {
            const x = d.data() as Record<string, unknown>;
            next.push({
              id: d.id,
              text: String(x.text ?? '').slice(0, 800),
              uid: String(x.uid ?? ''),
              displayName: String(x.displayName ?? 'Usuario').slice(0, 80),
              createdAt: tsToMs(x.createdAt),
            });
          });
          setItems(next.reverse());
        } catch {
          setItems([]);
        }
      },
      (err) => {
        console.error(err);
        showMessage({
          variant: 'error',
          title: 'Chat del plan',
          message: firestoreUserMessage(err),
        });
      }
    );
    return () => unsub();
  }, [open, resolvedGroupId, showMessage]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, items.length]);

  const send = useCallback(async () => {
    if (!user?.uid || !resolvedGroupId || sending) return;
    const t = text.trim();
    if (t.length === 0 || t.length > 800) return;
    const rawName = (user.displayName || 'Motero').toString().trim().slice(0, 80);
    const displayName = rawName.length > 0 ? rawName : 'Motero';
    setSending(true);
    try {
      await addDoc(collection(db, 'groups', resolvedGroupId, 'planMessages'), {
        text: t,
        uid: user.uid,
        displayName,
        createdAt: Date.now(),
      });
      setText('');
    } catch (e) {
      console.error(e);
      showMessage({
        variant: 'error',
        title: 'No se envió el mensaje',
        message: firestoreUserMessage(e),
      });
    } finally {
      setSending(false);
    }
  }, [user, resolvedGroupId, text, sending, showMessage]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[13000] flex items-end justify-center bg-black/70 p-0 sm:p-4 sm:items-center backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-chat-title"
    >
      <div className="flex h-[min(95dvh,600px)] w-full max-w-[calc(100%-1rem)] flex-col rounded-t-3xl border border-white/[0.08] bg-zinc-900 shadow-2xl sm:rounded-3xl sm:max-h-[85vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 pr-2">
            <h2 id="plan-chat-title" className="truncate text-base font-black text-white">
              Chat — {groupName || 'Ruta'}
            </h2>
            <p className="text-[10px] font-medium text-zinc-500">Solo apuntados · Código {resolvedGroupId || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
          {!resolvedGroupId ? (
            <p className="py-8 text-center text-sm text-zinc-500">Código de grupo no válido.</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">Aún no hay mensajes. Saluda y acordad hora y punto de encuentro.</p>
          ) : (
            items.map((m) => {
              const mine = m.uid === user?.uid;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? 'bg-orange-500/25 text-orange-50' : 'bg-zinc-800 text-zinc-100'
                    }`}
                  >
                    {!mine ? <p className="mb-0.5 text-[10px] font-bold text-orange-400/90">{m.displayName}</p> : null}
                    <p className="whitespace-pre-wrap break-words leading-snug">{m.text}</p>
                    <p className="mt-1 text-[9px] text-zinc-500">
                      {m.createdAt > 0
                        ? new Date(m.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : '…'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              maxLength={800}
              disabled={!resolvedGroupId}
              placeholder="Escribe un mensaje…"
              className="min-w-0 flex-1 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={sending || !text.trim() || !resolvedGroupId}
              onClick={() => void send()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-zinc-950 hover:bg-orange-400 disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
