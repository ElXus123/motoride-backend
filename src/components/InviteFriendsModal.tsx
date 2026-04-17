import { useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { X, UserPlus, Check, Loader2, User as UserIcon, Copy, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PremiumBadge from './PremiumBadge';
import { copyTextToClipboard } from '../lib/clientInfo';
import { buildScheduledInviteSharePayload } from '../lib/scheduledRouteShare';

type Props = {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  memberUids: string[];
  /** Por defecto sesión en vivo; `scheduled_ride` para rutas programadas desde el inicio. */
  inviteKind?: 'live_ride' | 'scheduled_ride';
  /** Para texto del enlace compartido (día de salida). */
  scheduledTimestamp?: number;
};

export default function InviteFriendsModal({
  open,
  onClose,
  groupId,
  groupName,
  memberUids,
  inviteKind = 'live_ride',
  scheduledTimestamp = 0,
}: Props) {
  const { user } = useAuth();
  const showMessage = useAppMessage();
  const [friends, setFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Record<string, number>>({});
  const [scheduleShareCopied, setScheduleShareCopied] = useState<'code' | 'link' | null>(null);

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
          if (r.exists()) {
            // El id del documento de Firestore es la referencia canónica para amistades/invitaciones.
            rows.push({ ...(r.data() as any), id: cleanId, uid: cleanId });
          }
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

  useEffect(() => {
    if (!open) setScheduleShareCopied(null);
  }, [open]);

  /** Otra ruta / otro código: no mezclar estado "enviado" entre grupos. */
  useEffect(() => {
    setSentIds({});
  }, [groupId]);

  const invite = async (friendUid: string) => {
    if (!user) return;
    const targetUid = String(friendUid || '').trim();
    if (!targetUid || targetUid === user.uid) return;
    const gidInput = groupId.toUpperCase().trim();
    if (gidInput === 'REPEATED' || gidInput.length !== 6) {
      showMessage({
        variant: 'error',
        title: 'Código de ruta',
        message:
          'No se puede enviar la invitación: el código de ruta no es válido (debe ser 6 caracteres). Si acabas de crear la ruta, vuelve a abrir Invitar.',
      });
      return;
    }
    let routeCode = gidInput;
    try {
      const groupSnap = await getDoc(doc(db, 'groups', gidInput));
      if (!groupSnap.exists()) {
        showMessage({
          variant: 'error',
          title: 'Código de ruta',
          message:
            'No hay ningún grupo con ese código en la base de datos. Revisa el código en pantalla; si acabas de desplegar la app, publica también las reglas de Firestore del repo (firebase deploy --only firestore:rules).',
        });
        return;
      }
      routeCode = groupSnap.id;
      const rawMembers = (groupSnap.data() as { members?: unknown } | undefined)?.members;
      const memberArr: string[] = Array.isArray(rawMembers)
        ? rawMembers.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (!memberArr.includes(String(user.uid).trim())) {
        showMessage({
          variant: 'error',
          title: 'Invitación',
          message:
            'Tu sesión no consta como miembro de esta ruta en el servidor. Sal de la ruta y vuelve a unirte con el código, luego abre Invitar otra vez.',
        });
        return;
      }
    } catch (ge: unknown) {
      console.error(ge);
      showMessage({
        variant: 'error',
        title: 'Ruta',
        message: 'No se pudo comprobar el grupo. Revisa la conexión e inténtalo otra vez.',
      });
      return;
    }
    const safeName = (groupName || 'Ruta').trim().slice(0, 120) || 'Ruta';
    setSendingId(targetUid);
    try {
      const targetSnap = await getDoc(doc(db, 'users', targetUid));
      if (!targetSnap.exists()) {
        showMessage({
          variant: 'error',
          title: 'Invitación',
          message: 'No se encontró el perfil de ese usuario. Prueba a cerrar y abrir de nuevo el listado de amigos.',
        });
        return;
      }
      const canonUid = targetSnap.id;
      const inviteDocId = `${user.uid}_${routeCode}`;
      const rejectionSnap = await getDoc(doc(db, 'users', canonUid, 'inviteRejections', inviteDocId));
      if (rejectionSnap.exists()) {
        showMessage({
          variant: 'info',
          title: 'Invitación',
          message:
            'Esta persona rechazó esta invitación desde el buzón. No puedes volver a enviarla para esta ruta.',
        });
        return;
      }
      const invitePayload = {
        fromUid: user.uid,
        groupId: routeCode,
        groupName: safeName,
        sentAt: Date.now(),
      };
      const targetRef = doc(db, 'users', canonUid);
      const inviteRef = doc(db, 'users', canonUid, 'invites', inviteDocId);
      const mailboxPayload = {
        fromUid: user.uid,
        groupId: routeCode,
        groupName: safeName,
        sentAt: Date.now(),
        kind: inviteKind,
      };
      try {
        await updateDoc(targetRef, { rideInvitePending: invitePayload });
      } catch (step1: unknown) {
        console.error('[invite] paso 1 updateDoc users/*/rideInvitePending', step1);
        throw step1;
      }
      try {
        await setDoc(inviteRef, mailboxPayload, { merge: true });
      } catch (step2: unknown) {
        console.error('[invite] paso 2 setDoc users/*/invites/*', step2);
        throw step2;
      }
      setSentIds((s) => ({ ...s, [targetUid]: Date.now() }));
    } catch (e: unknown) {
      const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: string }).code) : '';
      if (code === 'permission-denied') {
        try {
          const myRef = doc(db, 'users', user.uid);
          const [mySnap, targetSnap] = await Promise.all([getDoc(myRef), getDoc(doc(db, 'users', targetUid))]);
          if (!mySnap.exists() || !targetSnap.exists()) {
            showMessage({
              variant: 'error',
              title: 'Invitación',
              message: 'No se pudo enviar la invitación. El usuario de destino no está disponible.',
            });
            return;
          }
          const canonUid = targetSnap.id;
          const inviteDocIdRetry = `${user.uid}_${routeCode}`;
          const rejectionRetry = await getDoc(doc(db, 'users', canonUid, 'inviteRejections', inviteDocIdRetry));
          if (rejectionRetry.exists()) {
            showMessage({
              variant: 'info',
              title: 'Invitación',
              message:
                'Esta persona rechazó esta invitación desde el buzón. No puedes volver a enviarla para esta ruta.',
            });
            return;
          }
          const myData = mySnap.data() as Record<string, unknown>;
          const myFriends = Array.isArray(myData?.friends)
            ? myData.friends.map((x: unknown) => String(x).trim()).filter(Boolean)
            : [];
          if (!myFriends.includes(canonUid)) {
            try {
              await updateDoc(myRef, { friends: arrayUnion(canonUid) });
            } catch (syncErr: unknown) {
              console.warn('Invite: no se pudo sincronizar tu lista friends; se intenta la invitación igual.', syncErr);
            }
          }
          const retryTarget = doc(db, 'users', canonUid);
          const retryInviteRef = doc(db, 'users', canonUid, 'invites', inviteDocIdRetry);
          const pendingPayload = {
            fromUid: user.uid,
            groupId: routeCode,
            groupName: safeName,
            sentAt: Date.now(),
          };
          const retryMailbox = {
            fromUid: user.uid,
            groupId: routeCode,
            groupName: safeName,
            sentAt: Date.now(),
            kind: inviteKind,
          };
          try {
            await updateDoc(retryTarget, { rideInvitePending: pendingPayload });
          } catch (rs1: unknown) {
            console.error('[invite retry] paso 1 updateDoc rideInvitePending', rs1);
            throw rs1;
          }
          try {
            await setDoc(retryInviteRef, retryMailbox, { merge: true });
          } catch (rs2: unknown) {
            console.error('[invite retry] paso 2 setDoc invites', rs2);
            throw rs2;
          }
          setSentIds((s) => ({ ...s, [targetUid]: Date.now() }));
          return;
        } catch (retryErr: unknown) {
          console.error('Invite retry failed', retryErr);
          const detail =
            retryErr instanceof Error
              ? retryErr.message
              : typeof retryErr === 'object' && retryErr && 'message' in retryErr
                ? String((retryErr as { message: string }).message)
                : '';
          showMessage({
            variant: 'error',
            title: 'Permiso denegado',
            message:
              'No se pudo enviar la invitación. Si estáis en la misma ruta como miembros debería permitirse; si no, hace falta ser amigos (al menos uno en la lista del otro). Prueba a cerrar sesión y volver a entrar, o que el otro te envíe una solicitud de amistad.' +
              (detail ? ` (detalle técnico: ${detail.slice(0, 120)})` : '') +
              ' En ordenador: F12 → Consola y busca la línea que empieza por [invite].',
          });
          return;
        }
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
                {inviteKind === 'scheduled_ride' ? (
                  <>
                    Invita a tus amigos a esta <span className="text-orange-400 font-semibold">ruta programada</span>. La
                    invitación llega a su bandeja (icono arriba a la derecha en el inicio) y pueden unirse con el código.
                  </>
                ) : (
                  <>
                    La invitación se guarda en su buzón (icono arriba a la derecha en el inicio) y pueden unirse sin salir
                    de MotoRide.
                  </>
                )}
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
                            {inRoute
                              ? 'Ya está en esta ruta'
                              : sent
                                ? 'Aún no está en el grupo — puedes reenviar la invitación'
                                : 'En tu lista de amigos'}
                          </p>
                        </div>
                        {inRoute ? (
                          <span className="text-[10px] font-bold text-emerald-400 shrink-0 px-2">En ruta</span>
                        ) : (
                          <button
                            type="button"
                            disabled={sendingId === fid}
                            onClick={() => invite(fid)}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-black disabled:opacity-50"
                          >
                            {sendingId === fid ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            {sent ? 'Reenviar' : 'Invitar'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {inviteKind === 'scheduled_ride' && (
              <div className="shrink-0 space-y-3 border-t border-zinc-800 bg-zinc-950/70 px-5 py-4">
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Comparte el <span className="text-zinc-300">código</span> o el{' '}
                  <span className="text-zinc-300">enlace</span> para que otros se apunten desde MotoRide (mismo formato que
                  al crear la ruta).
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const code = groupId.toUpperCase().trim();
                      const ok = await copyTextToClipboard(code);
                      if (ok) {
                        setScheduleShareCopied('code');
                        window.setTimeout(() => setScheduleShareCopied(null), 2000);
                      } else {
                        window.prompt('Copia el código:', code);
                      }
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white hover:bg-zinc-700"
                  >
                    {scheduleShareCopied === 'code' ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : (
                      <Copy size={16} />
                    )}
                    Copiar código
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const gid = groupId.toUpperCase().trim();
                      const url =
                        typeof window !== 'undefined'
                          ? `${window.location.origin}${window.location.pathname}?join=${gid}`
                          : '';
                      const ts =
                        typeof scheduledTimestamp === 'number' && Number.isFinite(scheduledTimestamp)
                          ? scheduledTimestamp
                          : 0;
                      const { clipboardText } = buildScheduledInviteSharePayload({
                        routeName: groupName,
                        scheduledTimestamp: ts,
                        url,
                      });
                      const ok = await copyTextToClipboard(clipboardText);
                      if (ok) {
                        setScheduleShareCopied('link');
                        window.setTimeout(() => setScheduleShareCopied(null), 2000);
                      } else {
                        window.prompt('Copia el mensaje y el enlace:', clipboardText);
                      }
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-white hover:bg-zinc-700"
                  >
                    {scheduleShareCopied === 'link' ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : (
                      <Copy size={16} />
                    )}
                    Copiar enlace
                  </button>
                </div>
                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const gid = groupId.toUpperCase().trim();
                      const url = `${window.location.origin}${window.location.pathname}?join=${gid}`;
                      const ts =
                        typeof scheduledTimestamp === 'number' && Number.isFinite(scheduledTimestamp)
                          ? scheduledTimestamp
                          : 0;
                      const { title, text } = buildScheduledInviteSharePayload({
                        routeName: groupName,
                        scheduledTimestamp: ts,
                        url,
                      });
                      try {
                        await navigator.share({ title, text, url });
                      } catch (e) {
                        const err = e as { name?: string };
                        if (err?.name !== 'AbortError') console.error(e);
                      }
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500/90 py-2.5 text-xs font-black text-zinc-950 hover:bg-orange-400"
                  >
                    <Share2 size={16} />
                    Compartir…
                  </button>
                ) : null}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
