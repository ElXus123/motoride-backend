import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { tryDirectChatFirestoreId, tryDirectChatMembersOrdered } from '../lib/directChatId';
import { markDmChatRead } from '../hooks/useMailboxChatUnread';
import { X, Send, Loader2 } from 'lucide-react';

type Msg = { id: string; text: string; uid: string; displayName: string; createdAt: number };

type Props = {
  open: boolean;
  onClose: () => void;
  peerUid: string;
  peerDisplayName: string;
};

export default function FriendDirectChatModal({ open, onClose, peerUid, peerDisplayName }: Props): ReactElement | null {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [items, setItems] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const chatId = useMemo(() => {
    if (!user?.uid || !peerUid) return '';
    return tryDirectChatFirestoreId(user.uid, peerUid) || '';
  }, [user?.uid, peerUid]);

  useEffect(() => {
    if (!open || !user?.uid || !chatId) {
      setRoomReady(false);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRoomReady(false);
    let cancelled = false;
    void (async () => {
      try {
        const ordered = tryDirectChatMembersOrdered(user.uid, peerUid);
        if (!ordered) {
          if (!cancelled) setLoading(false);
          return;
        }
        const [a, b] = ordered;
        await setDoc(
          doc(db, 'privateChats', chatId),
          {
            members: [a, b],
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        if (!cancelled) setRoomReady(true);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          showMessage({
            variant: 'error',
            title: 'Chat',
            message: 'No se pudo abrir la conversación. Comprueba conexión y que sigáis siendo amigos en la app.',
          });
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user?.uid, peerUid, chatId, showMessage]);

  useEffect(() => {
    if (!open || !roomReady || !chatId) return;
    const q = query(collection(db, 'privateChats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(60));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: Msg[] = [];
        snap.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          const createdAt = typeof x.createdAt === 'number' && Number.isFinite(x.createdAt) ? x.createdAt : 0;
          next.push({
            id: d.id,
            text: String(x.text ?? '').slice(0, 2000),
            uid: String(x.uid ?? ''),
            displayName: String(x.displayName ?? 'Usuario').slice(0, 80),
            createdAt,
          });
        });
        setItems(next.reverse());
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
        showMessage({
          variant: 'error',
          title: 'Chat',
          message: 'No se pudieron cargar los mensajes.',
        });
      }
    );
    return () => unsub();
  }, [open, roomReady, chatId, showMessage]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, items.length]);

  useEffect(() => {
    if (!open || !user?.uid || !peerUid || items.length === 0) return;
    let max = 0;
    for (const m of items) {
      if (typeof m.createdAt === 'number' && m.createdAt > max) max = m.createdAt;
    }
    void markDmChatRead(user.uid, peerUid, max);
  }, [open, user?.uid, peerUid, items]);

  const send = useCallback(async () => {
    if (!user?.uid || !chatId || !roomReady || sending) return;
    const t = text.trim();
    if (t.length === 0 || t.length > 2000) return;
    const rawName = (user.displayName || 'Motero').toString().trim().slice(0, 80);
    const displayName = rawName.length > 0 ? rawName : 'Motero';
    setSending(true);
    try {
      const now = Date.now();
      await addDoc(collection(db, 'privateChats', chatId, 'messages'), {
        text: t,
        uid: user.uid,
        displayName,
        createdAt: now,
      });
      await updateDoc(doc(db, 'privateChats', chatId), { updatedAt: now });
      setText('');
    } catch (e) {
      console.error(e);
      showMessage({
        variant: 'error',
        title: 'Chat',
        message: 'No se pudo enviar el mensaje.',
      });
    } finally {
      setSending(false);
    }
  }, [user, chatId, roomReady, text, sending, showMessage]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-end justify-center bg-black/75 p-0 sm:p-4 sm:items-center backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dm-chat-title"
    >
      <div className="flex h-[min(95dvh,600px)] w-full max-w-[calc(100%-1rem)] flex-col rounded-t-3xl border border-white/[0.08] bg-zinc-900 shadow-2xl sm:rounded-3xl sm:max-h-[85vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 pr-2">
            <h2 id="dm-chat-title" className="truncate text-base font-black text-white">
              Chat con {peerDisplayName || 'Amigo'}
            </h2>
            <p className="text-[10px] font-medium text-zinc-500">Solo vosotros dos · Mensajes privados</p>
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
          {loading ? (
            <div className="flex justify-center py-16 text-zinc-500">
              <Loader2 className="animate-spin" size={28} />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500">Escribid para empezar la conversación.</p>
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
              maxLength={2000}
              disabled={!roomReady}
              placeholder={roomReady ? 'Escribe un mensaje…' : 'Abriendo…'}
              className="min-w-0 flex-1 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={sending || !text.trim() || !roomReady}
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
