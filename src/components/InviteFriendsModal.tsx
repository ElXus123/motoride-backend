import { useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { X, UserPlus, Check, Loader2, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PremiumBadge from './PremiumBadge';

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  memberUids: string[];
};

export default function InviteFriendsModal({ open, onClose, groupId, groupName, memberUids }: Props) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      const ids: string[] = snap.exists() ? snap.data()?.friends || [] : [];
      if (ids.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }
      try {
        const rows: any[] = [];
        for (const id of ids) {
          const cleanId = String(id || '').trim();
          if (!cleanId) continue;
          const r = await getDoc(doc(db, 'users', cleanId));
          if (r.exists()) rows.push({ ...r.data(), id: cleanId, uid: cleanId });
        }
        setFriends(rows);
      } catch (e) {
        console.error(e);
        setFriends([]);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [open, user]);

  const invite = async (friendUid: string) => {
    if (!user) return;
    const targetUid = String(friendUid || '').trim();
    if (!targetUid || targetUid === user.uid) return;
    const gid = groupId.toUpperCase().trim();
    if (gid === 'REPEATED' || gid.length !== 6) {
      window.alert(
        'No se puede enviar la invitación: el código de ruta no es válido (debe ser 6 caracteres). Si acabas de crear la ruta, vuelve a abrir Invitar.'
      );
      return;
    }
    setSendingId(targetUid);
    try {
      const safeName = (groupName || 'Ruta').trim().slice(0, 120) || 'Ruta';
      await updateDoc(doc(db, 'users', targetUid), {
        rideInvitePending: {
          fromUid: user.uid,
          groupId: gid,
          groupName: safeName,
          sentAt: Date.now(),
        },
      });
      setSentIds((s) => ({ ...s, [targetUid]: Date.now() }));
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'permission-denied') {
        window.alert(
          'No se pudo enviar la invitación. Comprueba que esa persona está en tu lista de amigos (amistad aceptada en ambos sentidos).'
        );
        return;
      }
      handleFirestoreError(e, OperationType.UPDATE, `users/${targetUid}`);
    } finally {
      setSendingId(null);
    }
  };

  const memberSet = new Set((memberUids || []).filter(Boolean));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[5000] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full sm:max-w-md max-h-[min(85dvh,560px)] bg-zinc-900 border border-zinc-800 sm:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Invitar a la ruta</p>
                <h2 className="text-lg font-black text-white truncate max-w-[220px] sm:max-w-xs">{groupName || 'Ruta'}</h2>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">Código {groupId}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-3 overflow-y-auto flex-1 custom-scrollbar">
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                Tus amigos verán una invitación en el inicio de la app y podrán unirse sin salir de MotoRide.
              </p>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
                  <Loader2 size={28} className="animate-spin text-orange-500" />
                  <span className="text-sm font-medium">Cargando amigos…</span>
                </div>
              ) : friends.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-10">
                  Aún no tienes amigos añadidos. Úsalos desde el botón de amigos en el menú principal.
                </p>
              ) : (
                <ul className="space-y-2">
                  {friends
                    .filter((f) => Boolean(String(f.uid || f.id || '').trim()))
                    .map((f) => {
                    const fid = String(f.uid || f.id || '').trim();
                    const inRoute = memberSet.has(fid);
                    const sent = sentIds[fid];
                    return (
                      <li
                        key={fid}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                          {f.photoURL ? (
                            <img src={f.photoURL} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <UserIcon className="w-5 h-5 m-auto mt-2.5 text-zinc-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-sm truncate flex items-center gap-1.5">
                            {f.displayName || 'Motero'}
                            {f.isPremium === true ? <PremiumBadge compact /> : null}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {inRoute ? 'Ya está en esta ruta' : sent ? 'Invitación enviada' : 'En tu lista de amigos'}
                          </p>
                        </div>
                        {inRoute ? (
                          <span className="text-[10px] font-bold text-emerald-400 shrink-0 px-2">En ruta</span>
                        ) : sent ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold shrink-0">
                            <Check size={16} /> Listo
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={sendingId === fid}
                            onClick={() => invite(fid)}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-black disabled:opacity-50"
                          >
                            {sendingId === fid ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            Invitar
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
