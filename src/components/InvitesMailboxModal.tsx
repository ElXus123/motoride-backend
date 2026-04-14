import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { X, Inbox, ChevronRight, Trash2, Loader2 } from 'lucide-react';
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
};

export default function InvitesMailboxModal({ open, onClose, onJoinGroup }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<RideInviteDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
        handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/invites`);
      }
    );
    return () => unsub();
  }, [open, user?.uid]);

  const removeInvite = async (inviteDocId: string) => {
    if (!user?.uid) return;
    setRemovingId(inviteDocId);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'invites', inviteDocId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/invites/${inviteDocId}`);
    } finally {
      setRemovingId(null);
    }
  };

  const join = async (inv: RideInviteDoc) => {
    const gid = String(inv.groupId || '').trim().toUpperCase();
    if (gid.length !== 6 || !user?.uid) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'invites', inv.id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/invites/${inv.id}`);
    }
    onClose();
    onJoinGroup(gid);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 w-full sm:max-w-md max-h-[85dvh] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Inbox className="text-orange-400" size={22} />
                <h2 className="text-lg font-black text-white">Invitaciones</h2>
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
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {loading ? (
                <div className="flex justify-center py-12 text-zinc-500">
                  <Loader2 className="animate-spin" size={28} />
                </div>
              ) : items.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-10">
                  No hay invitaciones guardadas. Cuando un amigo te invite a una ruta, aparecerá aquí.
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
                        onClick={() => void removeInvite(inv.id)}
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
                      onClick={() => void join(inv)}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-2"
                    >
                      Unirse a la ruta
                      <ChevronRight size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
