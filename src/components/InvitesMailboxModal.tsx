import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  limit,
  updateDoc,
  arrayUnion,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { X, Inbox, ChevronRight, Trash2, Loader2, MessageCircle } from 'lucide-react';
import type { UnreadDmRow, UnreadPlanRow } from '../hooks/useMailboxChatUnread';
import { motion, AnimatePresence } from 'motion/react';

export type RideInviteDoc = {
  id: string;
  fromUid: string;
  groupId: string;
  groupName: string;
  sentAt: number;
  kind?: string;
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
    const q = query(collection(db, 'users', user.uid, 'invites'), limit(60));
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
    /** Debe coincidir con `firestore.rules` (`rejId == inviterUid + '_' + groupId`). */
    const canonicalRejectionId = from && gid.length === 6 ? `${from}_${gid}` : inviteDocId;

    if (gid.length !== 6 || !from) {
      setRemovingId(inviteDocId);
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'invites', inviteDocId));
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
      await deleteDoc(doc(db, 'users', user.uid, 'invites', inviteDocId));
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
        await deleteDoc(doc(db, 'users', user.uid, 'invites', inv.id)).catch(() => {});
        return;
      }
      const groupData = snap.data() as { isScheduled?: boolean };
      const isScheduled = groupData?.isScheduled === true || inv.kind === 'scheduled_ride';

      await updateDoc(groupRef, { members: arrayUnion(user.uid) });
      await deleteDoc(doc(db, 'users', user.uid, 'invites', inv.id));
      const canonRejId = `${String(inv.fromUid || '').trim()}_${gid}`;
      await deleteDoc(doc(db, 'users', user.uid, 'inviteRejections', canonRejId)).catch(() => {});

      const uref = doc(db, 'users', user.uid);
      const usnap = await getDoc(uref);
      const pending = usnap.data()?.rideInvitePending as { groupId?: string } | undefined;
      if (pending && String(pending.groupId || '').toUpperCase().trim() === gid) {
        await updateDoc(uref, { rideInvitePending: deleteField() });
      }

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
          className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 w-full max-w-md max-h-[min(85dvh,640px)] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Inbox className="text-orange-400" size={22} />
                <h2 className="text-lg font-black text-white">Bandeja</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {(unreadPlanChats.length > 0 || unreadDmChats.length > 0) && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-orange-500">Mensajes sin leer</p>
                  {unreadPlanChats.map((row) => (
                    <button
                      key={`plan-${row.groupId}`}
                      type="button"
                      onClick={() => {
                        onOpenPlanChat?.(row.groupId, row.groupName);
                        onClose();
                      }}
                      className="w-full text-left rounded-2xl border border-sky-500/40 bg-sky-500/10 p-3 hover:bg-sky-500/20"
                    >
                      <p className="text-xs font-black text-sky-300">Chat plan · {row.groupName}</p>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{row.groupId}</p>
                      <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{row.preview || 'Nuevo mensaje'}</p>
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
                      className="w-full text-left rounded-2xl border border-orange-500/35 bg-orange-500/10 p-3 hover:bg-orange-500/18 flex gap-2"
                    >
                      <MessageCircle size={18} className="shrink-0 text-orange-400 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-black text-orange-200">Chat · {row.peerLabel}</p>
                        <p className="text-xs text-zinc-300 mt-1 line-clamp-2">{row.preview || 'Nuevo mensaje'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Invitaciones</p>
                {loading ? (
                  <div className="flex justify-center py-12 text-zinc-500">
                    <Loader2 className="animate-spin" size={28} />
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-6">
                    No hay invitaciones. Cuando un amigo te invite a una ruta, aparecerá aquí.
                  </p>
                ) : (
                  items.map((inv) => (
                  <div
                    key={inv.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex flex-col gap-2"
                  >
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{inv.groupName || 'Ruta'}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">Código {inv.groupId}</p>
                        {inv.kind === 'scheduled_ride' && (
                          <p className="text-[10px] font-bold text-sky-400 mt-1">Ruta programada</p>
                        )}
                        <p className="text-[10px] text-zinc-600 mt-1">
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
                        className="shrink-0 p-2 text-zinc-500 hover:text-red-400"
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
                      className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-zinc-950 text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
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
