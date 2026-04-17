import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  arrayUnion,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { Loader2 } from 'lucide-react';
import { buildInviteRejectionDocId } from '../lib/rideInvites';

type Pending = {
  docId: string;
  fromUid: string;
  groupId: string;
  groupName: string;
  sentAt: number;
};

type Props = {
  onJoinGroup: (code: string) => void;
  activeGroupId: string | null;
};

export default function PendingRideInviteOverlay({ onJoinGroup, activeGroupId }: Props) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [pending, setPending] = useState<Pending | null>(null);
  const [fromName, setFromName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setPending(null);
      return;
    }
    const q = query(
      collection(db, 'rideInvites'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending'),
      orderBy('sentAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        try {
          const d = snap.docs[0];
          if (!d) {
            setPending(null);
            return;
          }
          const x = d.data() as Record<string, unknown>;
          const gid = String(x.groupId || '').toUpperCase().trim();
          if (gid.length !== 6) {
            setPending(null);
            return;
          }
          setPending({
            docId: d.id,
            fromUid: String(x.fromUid || '').trim(),
            groupId: gid,
            groupName: String(x.groupName || 'Ruta').trim() || 'Ruta',
            sentAt: typeof x.sentAt === 'number' ? x.sentAt : Number(x.sentAt) || 0,
          });
        } catch {
          setPending(null);
        }
      },
      () => setPending(null)
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const uid = pending?.fromUid;
    if (!uid) {
      setFromName(null);
      return;
    }
    let cancelled = false;
    void getDoc(doc(db, 'users', uid)).then((s) => {
      if (cancelled) return;
      setFromName(s.exists() ? (s.data()?.displayName as string) || 'Un amigo' : 'Un amigo');
    });
    return () => {
      cancelled = true;
    };
  }, [pending?.fromUid, pending?.sentAt]);

  useEffect(() => {
    const gid = pending?.groupId || '';
    if (!gid || gid.length !== 6 || !activeGroupId || !user?.uid || !pending) return;
    if (gid !== activeGroupId.toUpperCase().trim()) return;
    void deleteDoc(doc(db, 'rideInvites', pending.docId)).catch(() => {});
  }, [pending, activeGroupId, user?.uid]);

  if (!user || !pending?.groupId) return null;

  const gid = pending.groupId;

  const dismiss = async () => {
    try {
      await deleteDoc(doc(db, 'rideInvites', pending.docId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `rideInvites/${pending.docId}`);
    }
  };

  const accept = async () => {
    setJoining(true);
    try {
      const gRef = doc(db, 'groups', gid);
      const snap = await getDoc(gRef);
      if (!snap.exists()) {
        await dismiss();
        return;
      }
      const groupData = snap.data() as { isScheduled?: boolean };
      await updateDoc(gRef, { members: arrayUnion(user.uid) });
      await deleteDoc(doc(db, 'rideInvites', pending.docId));
      const rejId = buildInviteRejectionDocId(pending.fromUid, gid);
      await deleteDoc(doc(db, 'users', user.uid, 'inviteRejections', rejId)).catch(() => {});

      if (groupData?.isScheduled === true) {
        showMessage({
          variant: 'success',
          title: 'Te has apuntado',
          message:
            'Quedas en la lista de la ruta programada. Desde 1 h antes de la hora podrás entrar al mapa y al chat de voz.',
        });
        return;
      }
      onJoinGroup(gid);
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'permission-denied') {
        showMessage({
          variant: 'error',
          title: 'Unirse a la ruta',
          message: 'No se pudo unir a la ruta. Comprueba la conexión y que tengas permiso para unirte al grupo.',
        });
      } else {
        handleFirestoreError(e, OperationType.WRITE, `groups/${gid}`);
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-ride-invite-title"
      onClick={() => void dismiss()}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-blue-500/50 rounded-3xl shadow-2xl shadow-blue-900/20 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800 bg-gradient-to-br from-blue-600/20 to-orange-500/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-2">Invitación a ruta</p>
          <h2 id="global-ride-invite-title" className="text-lg font-black text-white leading-snug">
            <span className="text-blue-200">{fromName || 'Un amigo'}</span> te invita a{' '}
            <span className="text-orange-400">{pending.groupName || 'una ruta'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-2 font-mono">Código: {gid}</p>
        </div>
        <div className="p-6 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={() => void dismiss()}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-zinc-800 text-zinc-200 text-sm font-bold hover:bg-zinc-700"
          >
            Ignorar
          </button>
          <button
            type="button"
            disabled={joining}
            onClick={() => void accept()}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-orange-500 text-white text-sm font-black hover:bg-orange-400 disabled:opacity-60 flex items-center justify-center gap-2 min-w-[8rem]"
          >
            {joining ? <Loader2 size={18} className="animate-spin" /> : null}
            Unirme a la ruta
          </button>
        </div>
      </div>
    </div>
  );
}
