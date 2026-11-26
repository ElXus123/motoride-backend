import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { buildInviteRejectionDocId } from '../lib/rideInvites';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { X, Inbox, ChevronRight, Trash2, Loader2, MessageCircle } from 'lucide-react';
import type { UnreadDmRow, UnreadPlanRow } from '../hooks/useMailboxChatUnread';
import { motion, AnimatePresence } from 'motion/react';

export type RideInviteDoc = {
  id: string;
  fromUid: string;
  toUid?: string;
  groupId: string;
  groupName: string;
  sentAt: number;
  kind?: string;
  status?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onJoinGroup: (groupId: string) => void;
  unreadPlanChats?: UnreadPlanRow[];
  unreadDmChats?: UnreadDmRow[];
  onOpenPlanChat?: (groupId: string, groupName: string) => void;
  onOpenDmChat?: (peerUid: string, peerLabel: string) => void;
};

export default function InvitesMailboxModal({
  open,
  onClose,
  onJoinGroup,
  unreadPlanChats = [],
  unreadDmChats = [],
  onOpenPlanChat,
  onOpenDmChat,
}: Props) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [items, setItems] = useState<RideInviteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user?.uid) return;
    setLoading(true);
    const q = query(
      collection(db, 'rideInvites'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending'),
      orderBy('sentAt', 'desc'),
      limit(60)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: RideInviteDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RideInviteDoc, 'id'>),
        }));
        rows.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
        setItems(rows);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
        showMessage({
          variant: 'error',
          title: 'Bandeja de invitaciones',
          message: 'No se pudo cargar la lista. Comprueba la conexión o vuelve a entrar.',
        });
      }
    );
    return () => unsub();
  }, [open, user?.uid, showMessage]);

  const removeInvite = async (inv: RideInviteDoc) => {
    if (!user?.uid) return;
    const inviteDocId = inv.id;
    const gid = String(inv.groupId || '').trim().toUpperCase();
    const from = String(inv.fromUid || '').trim();
    const canonicalRejectionId = from && gid.length === 6 ? buildInviteRejectionDocId(from, gid) : inviteDocId;

    if (gid.length !== 6 || !from) {
      setRemovingId(inviteDocId);
      try {
        await deleteDoc(doc(db, 'rideInvites', inviteDocId));
      } catch (e) {
        console.error(e);
        showMessage({
          variant: 'error',
          title: 'No se pudo eliminar',
          message: 'Comprueba conexión o inténtalo otra vez.',
        });
      } finally {
        setRemovingId(null);
      }
      return;
    }
    setRemovingId(inviteDocId);
    try {
      const rejRef = doc(db, 'users', user.uid, 'inviteRejections', canonicalRejectionId);
      const existing = await getDoc(rejRef);
      if (!existing.exists()) {
        await setDoc(
          rejRef,
          {
            inviterUid: from,
            groupId: gid,
            rejectedAt: Date.now(),
          },
          { merge: true }
        );
      }
      await deleteDoc(doc(db, 'rideInvites', inviteDocId));
    } catch (e) {
      console.error(e);
      showMessage({
        variant: 'error',
        title: 'No se pudo descartar',
        message:
          'Si el problema continúa, comprueba la hora del dispositivo o vuelve a intentarlo. El organizador no podrá reenviar hasta que se guarde el rechazo.',
      });
    } finally {
      setRemovingId(null);
    }
  };

  const join = async (inv: RideInviteDoc) => {
    const gid = String(inv.groupId || '').trim().toUpperCase();
    if (gid.length !== 6 || !user?.uid) return;
    setJoiningId(inv.id);
    try {
      const groupRef = doc(db, 'groups', gid);
      const snap = await getDoc(groupRef);
      if (!snap.exists()) {
        showMessage({
          variant: 'error',
          title: 'Ruta no encontrada',
          message: 'Ese código ya no existe o la ruta se ha borrado.',
        });
        await deleteDoc(doc(db, 'rideInvites', inv.id)).catch(() => {});
        return;
      }
      const groupData = snap.data() as { isScheduled?: boolean };
      const isScheduled = groupData?.isScheduled === true || inv.kind === 'scheduled_ride';

      await updateDoc(groupRef, { members: arrayUnion(user.uid) });
      await deleteDoc(doc(db, 'rideInvites', inv.id));
      const canonRejId = buildInviteRejectionDocId(String(inv.fromUid || '').trim(), gid);
      await deleteDoc(doc(db, 'users', user.uid, 'inviteRejections', canonRejId)).catch(() => {});

      onClose();

      if (isScheduled) {
        showMessage({
          variant: 'success',
          title: 'Te has apuntado',
          message:
            'Quedas en la lista de la ruta programada. Desde 1 h antes de la hora podrás entrar al mapa y al chat de voz.',
        });
      } else {
        onJoinGroup(gid);
      }
    } catch (e) {
      console.error(e);
      showMessage({
        variant: 'error',
        title: 'No se pudo unir',
        message: 'Comprueba conexión, que la ruta siga activa o que no estés ya dentro del grupo.',
      });
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5000] flex items-end justify-center bg-[#14110e73] p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="mr-sheet flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden sm:max-h-[min(85dvh,640px)] sm:rounded-[22px] sm:border"
          >
            <div className="p-4 border-b border-mr-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Inbox className="text-mr-accent-text" size={22} />
                <h2 className="mr-title text-[2.25rem] uppercase">Bandeja</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-mr-line text-mr-muted"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {(unreadPlanChats.length > 0 || unreadDmChats.length > 0) && (
                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-wider text-mr-accent-text">Mensajes sin leer</p>
                  {unreadPlanChats.map((row) => (
                    <button
                      key={`plan-${row.groupId}`}
                      type="button"
                      onClick={() => {
                        onOpenPlanChat?.(row.groupId, row.groupName);
                        onClose();
                      }}
                      className="w-full text-left rounded-2xl border border-[#1d4f8a]/40 bg-[#1d4f8a]/10 p-3 hover:bg-[#1d4f8a]/20"
                    >
                      <p className="text-xs font-black text-[#1d4f8a]">Chat plan · {row.groupName}</p>
                      <p className="text-[11px] text-mr-muted font-mono mt-0.5">{row.groupId}</p>
                      <p className="text-xs text-mr-ink mt-1 line-clamp-2">{row.preview || 'Nuevo mensaje'}</p>
                    </button>
                  ))}
                  {unreadDmChats.map((row) => (
                    <button
                      key={`dm-${row.peerUid}`}
                      type="button"
                      onClick={() => {
                        onOpenDmChat?.(row.peerUid, row.peerLabel);
                        onClose();
                      }}
                      className="w-full text-left rounded-2xl border border-mr-accent bg-mr-accent/20 p-3 hover:bg-mr-accent-hover/20 flex gap-2"
                    >
                      <MessageCircle size={18} className="shrink-0 text-mr-accent-text mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-black text-mr-accent-text">Chat · {row.peerLabel}</p>
                        <p className="text-xs text-mr-ink mt-1 line-clamp-2">{row.preview || 'Nuevo mensaje'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-mr-muted">Invitaciones</p>
                {loading ? (
                  <div className="flex justify-center py-12 text-mr-muted">
                    <Loader2 className="animate-spin" size={28} />
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-sm text-mr-muted text-center py-6">
                    No hay invitaciones. Cuando un amigo te invite a una ruta, aparecerá aquí.
                  </p>
                ) : (
                  items.map((inv) => (
                  <div
                    key={inv.id}
                    className="mr-card mr-ticket flex flex-col gap-3 rounded-[14px] p-4"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-2xl font-bold uppercase leading-tight text-mr-ink truncate">{inv.groupName || 'Ruta'}</p>
                        <p className="text-xs text-mr-muted font-mono">Código {inv.groupId}</p>
                        {inv.kind === 'scheduled_ride' && (
                          <p className="text-[11px] font-bold text-[#1d4f8a] mt-1">Ruta programada</p>
                        )}
                        <p className="text-[11px] text-mr-subtle mt-1">
                          {inv.sentAt
                            ? new Date(inv.sentAt).toLocaleString([], {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={removingId === inv.id}
                        onClick={() => void removeInvite(inv)}
                        className="shrink-0 p-2 text-mr-muted hover:text-[#a3261c]"
                        title="Descartar"
                      >
                        {removingId === inv.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={joiningId === inv.id}
                      onClick={() => void join(inv)}
                      className="mr-btn-primary w-full text-sm font-black disabled:opacity-60"
                    >
                      {joiningId === inv.id ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <>
                          {inv.kind === 'scheduled_ride' ? 'Apuntarme a la ruta' : 'Unirme a la ruta'}
                          <ChevronRight size={18} />
                        </>
                      )}
                    </button>
                  </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
