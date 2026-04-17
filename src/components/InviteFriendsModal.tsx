import { useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, motorideFunctions, OperationType } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../contexts/AuthContext';
import { useAppMessage } from '../contexts/AppMessageContext';
import { X, UserPlus, Check, Loader2, User as UserIcon, Copy, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PremiumBadge from './PremiumBadge';
import { copyTextToClipboard } from '../lib/clientInfo';
import { buildScheduledInviteSharePayload } from '../lib/scheduledRouteShare';
import { tryDirectChatFirestoreId } from '../lib/directChatId';

function pickFirebaseErr(err: unknown): { code: string; message: string } {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code?: unknown }).code ?? '');
    const msg = (err as { message?: unknown }).message;
    const message = typeof msg === 'string' ? msg : '';
    return { code, message: message || String(err) };
  }
  return { code: '', message: typeof err === 'string' ? err : String(err) };
}

function strUidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x).trim()).filter(Boolean);
}

/**
 * Pistas para reglas Firestore `rideInviteSocialOk` / `crossUserRideInviteUserDiffOk`
 * (lectura de `privateChats` puede devolver permission-denied si las reglas de DM lo exigen).
 */
async function fetchInviteDiagnostics(
  inviterUid: string,
  receiverUid: string,
  routeCode: string,
): Promise<Record<string, unknown>> {
  const inviteDocId = `${inviterUid}_${routeCode}`;
  const paths = {
    group: `groups/${routeCode}`,
    inviter: `users/${inviterUid}`,
    receiver: `users/${receiverUid}`,
    pendingField: `users/${receiverUid}.rideInvitePending`,
    mailboxDoc: `users/${receiverUid}/invites/${inviteDocId}`,
  };

  const [groupSnap, inviterSnap, receiverSnap] = await Promise.all([
    getDoc(doc(db, 'groups', routeCode)),
    getDoc(doc(db, 'users', inviterUid)),
    getDoc(doc(db, 'users', receiverUid)),
  ]);

  const rawMembers = groupSnap.exists() ? (groupSnap.data() as { members?: unknown })?.members : undefined;
  const membersArr = strUidList(rawMembers);
  const groupCodeField =
    groupSnap.exists() && typeof (groupSnap.data() as { code?: unknown })?.code === 'string'
      ? String((groupSnap.data() as { code: string }).code)
      : null;

  const inviterData = inviterSnap.exists() ? inviterSnap.data() : null;
  const receiverData = receiverSnap.exists() ? receiverSnap.data() : null;

  const dmId = tryDirectChatFirestoreId(inviterUid, receiverUid) || '';
  let dmReadable: 'missing' | 'ok' | 'denied' | 'error' | 'no_chat_id' = dmId ? 'missing' : 'no_chat_id';
  let dmMembers: string[] = [];
  let dmReadError: { code: string; message: string } | null = null;
  if (dmId) {
    try {
      const dmSnap = await getDoc(doc(db, 'privateChats', dmId));
      if (!dmSnap.exists()) dmReadable = 'missing';
      else {
        dmReadable = 'ok';
        dmMembers = strUidList((dmSnap.data() as { members?: unknown } | undefined)?.members);
      }
    } catch (de: unknown) {
      dmReadError = pickFirebaseErr(de);
      dmReadable = dmReadError.code === 'permission-denied' ? 'denied' : 'error';
    }
  }

  return {
    paths,
    routeCode,
    inviteDocId,
    groupExists: groupSnap.exists(),
    groupDocId: groupSnap.exists() ? groupSnap.id : null,
    groupCodeField,
    groupDocIdMatchesRouteCode: groupSnap.exists() ? groupSnap.id === routeCode : false,
    membersCount: membersArr.length,
    inviterInGroupMembers: membersArr.includes(inviterUid),
    receiverInGroupMembers: membersArr.includes(receiverUid),
    membersPreview: membersArr.slice(0, 12),
    inviterFriendsHasReceiver: strUidList(inviterData?.friends).includes(receiverUid),
    receiverFriendsHasInviter: strUidList(receiverData?.friends).includes(inviterUid),
    inviterIncomingHasReceiver: strUidList(inviterData?.friendRequestsIncoming).includes(receiverUid),
    receiverIncomingHasInviter: strUidList(receiverData?.friendRequestsIncoming).includes(inviterUid),
    inviterOutgoingHasReceiver: strUidList(inviterData?.friendRequestsOutgoing).includes(receiverUid),
    receiverOutgoingHasInviter: strUidList(receiverData?.friendRequestsOutgoing).includes(inviterUid),
    dmChatId: dmId || null,
    dmDocReadable: dmReadable,
    dmReadError,
    dmMembersPreview: dmMembers.slice(0, 4),
    dmBothUidsInDmMembers:
      dmMembers.length > 0 ? dmMembers.includes(inviterUid) && dmMembers.includes(receiverUid) : false,
    inviterUserExists: inviterSnap.exists(),
    receiverUserExists: receiverSnap.exists(),
  };
}

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

      /** Igual que en el reintento: alinear lista `friends` del invitador antes del fallback Firestore. */
      const syncInviterFriendsIncludesReceiver = async () => {
        try {
          const myRef = doc(db, 'users', user.uid);
          const mySnap = await getDoc(myRef);
          if (!mySnap.exists()) return;
          const myData = mySnap.data() as Record<string, unknown>;
          const myFriends = Array.isArray(myData?.friends)
            ? myData.friends.map((x: unknown) => String(x).trim()).filter(Boolean)
            : [];
          if (!myFriends.includes(canonUid)) {
            await updateDoc(myRef, { friends: arrayUnion(canonUid) });
          }
        } catch (syncErr: unknown) {
          console.warn('[invite] sync inviter friends antes de Firestore (opcional)', pickFirebaseErr(syncErr));
        }
      };

      const sendViaFirestore = async () => {
        try {
          await updateDoc(targetRef, { rideInvitePending: invitePayload });
        } catch (step1: unknown) {
          let diag: Record<string, unknown> = {};
          try {
            diag = await fetchInviteDiagnostics(user.uid, canonUid, routeCode);
          } catch (dx: unknown) {
            diag = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
          }
          console.error('[invite] paso 1 updateDoc rideInvitePending', {
            phase: 'initial_firestore',
            step: 1,
            error: pickFirebaseErr(step1),
            inviterUid: user.uid,
            receiverUid: canonUid,
            routeCode,
            inviteDocId,
            inviteKind,
            diag,
          });
          throw step1;
        }
        try {
          await setDoc(inviteRef, mailboxPayload, { merge: true });
        } catch (step2: unknown) {
          let diag: Record<string, unknown> = {};
          try {
            diag = await fetchInviteDiagnostics(user.uid, canonUid, routeCode);
          } catch (dx: unknown) {
            diag = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
          }
          console.error('[invite] paso 2 setDoc invites mailbox', {
            phase: 'initial_firestore',
            step: 2,
            error: pickFirebaseErr(step2),
            inviterUid: user.uid,
            receiverUid: canonUid,
            routeCode,
            inviteDocId,
            inviteKind,
            diag,
          });
          throw step2;
        }
      };

      try {
        const sendRideInvite = httpsCallable(motorideFunctions, 'sendRideInvite');
        await sendRideInvite({
          toUid: canonUid,
          groupId: routeCode,
          groupName: safeName,
          inviteKind,
        });
      } catch (cloudErr: unknown) {
        const fe = cloudErr as { code?: string; message?: string };
        if (fe?.code === 'functions/not-found') {
          console.warn('[invite] sendRideInvite no desplegada; fallback Firestore.', {
            inviterUid: user.uid,
            receiverUid: canonUid,
            routeCode,
            inviteDocId,
            inviteKind,
          });
          await syncInviterFriendsIncludesReceiver();
          await sendViaFirestore();
        } else {
          let diag: Record<string, unknown> = {};
          try {
            diag = await fetchInviteDiagnostics(user.uid, canonUid, routeCode);
          } catch (dx: unknown) {
            diag = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
          }
          console.error('[invite] Callable sendRideInvite error (no fallback)', {
            error: pickFirebaseErr(cloudErr),
            inviterUid: user.uid,
            receiverUid: canonUid,
            routeCode,
            inviteDocId,
            inviteKind,
            diag,
          });
          throw cloudErr;
        }
      }
      setSentIds((s) => ({ ...s, [targetUid]: Date.now() }));
    } catch (e: unknown) {
      const errObj = e as { code?: string; message?: string };
      const code = typeof errObj?.code === 'string' ? errObj.code : '';
      if (code === 'functions/failed-precondition') {
        showMessage({
          variant: 'info',
          title: 'Invitación',
          message: errObj?.message || 'Esta invitación no se puede reenviar para esta ruta.',
        });
        return;
      }
      if (code === 'functions/permission-denied' || code === 'functions/invalid-argument') {
        showMessage({
          variant: 'error',
          title: 'Invitación',
          message: errObj?.message || 'No se pudo enviar la invitación.',
        });
        return;
      }
      if (code === 'permission-denied') {
        /** Alcance compartido con `catch`: el `try` no expone `const` al `catch`. */
        let retryCanonUid = '';
        try {
          console.info('[invite] permission-denied en primer intento Firestore → reintento', {
            hint:
              'Suele ocurrir si sendRideInvite no está en el proyecto (Callable not-found) y el primer updateDoc/setDoc choca con reglas o datos; el reintento vuelve a leer perfiles y sincroniza friends.',
            firstPassError: pickFirebaseErr(e),
            inviterUid: user.uid,
            targetUidInput: targetUid,
            routeCode,
            inviteKind,
          });
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
          retryCanonUid = targetSnap.id;
          const inviteDocIdRetry = `${user.uid}_${routeCode}`;
          const rejectionRetry = await getDoc(doc(db, 'users', retryCanonUid, 'inviteRejections', inviteDocIdRetry));
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
          if (!myFriends.includes(retryCanonUid)) {
            try {
              await updateDoc(myRef, { friends: arrayUnion(retryCanonUid) });
            } catch (syncErr: unknown) {
              console.warn('Invite: no se pudo sincronizar tu lista friends; se intenta la invitación igual.', syncErr);
            }
          }
          const retryTarget = doc(db, 'users', retryCanonUid);
          const retryInviteRef = doc(db, 'users', retryCanonUid, 'invites', inviteDocIdRetry);
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
          let diagBeforeRetry: Record<string, unknown> = {};
          try {
            diagBeforeRetry = await fetchInviteDiagnostics(user.uid, retryCanonUid, routeCode);
          } catch (dx: unknown) {
            diagBeforeRetry = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
          }
          console.warn('[invite] contexto antes del reintento Firestore/Callable', {
            inviterUid: user.uid,
            receiverUid: retryCanonUid,
            targetUidInput: targetUid,
            routeCode,
            inviteDocIdRetry: inviteDocIdRetry,
            inviteKind,
            myFriendsIncludesReceiver: myFriends.includes(retryCanonUid),
            diag: diagBeforeRetry,
          });

          const sendRetryViaFirestore = async () => {
            try {
              await updateDoc(retryTarget, { rideInvitePending: pendingPayload });
            } catch (rs1: unknown) {
              let diag: Record<string, unknown> = {};
              try {
                diag = await fetchInviteDiagnostics(user.uid, retryCanonUid, routeCode);
              } catch (dx: unknown) {
                diag = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
              }
              console.error('[invite] retry paso 1 updateDoc rideInvitePending', {
                phase: 'retry_firestore',
                step: 1,
                error: pickFirebaseErr(rs1),
                inviterUid: user.uid,
                receiverUid: retryCanonUid,
                routeCode,
                inviteDocId: inviteDocIdRetry,
                inviteKind,
                diag,
              });
              throw rs1;
            }
            try {
              await setDoc(retryInviteRef, retryMailbox, { merge: true });
            } catch (rs2: unknown) {
              let diag: Record<string, unknown> = {};
              try {
                diag = await fetchInviteDiagnostics(user.uid, retryCanonUid, routeCode);
              } catch (dx: unknown) {
                diag = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
              }
              console.error('[invite] retry paso 2 setDoc invites', {
                phase: 'retry_firestore',
                step: 2,
                error: pickFirebaseErr(rs2),
                inviterUid: user.uid,
                receiverUid: retryCanonUid,
                routeCode,
                inviteDocId: inviteDocIdRetry,
                inviteKind,
                diag,
              });
              throw rs2;
            }
          };
          try {
            const sendRideInvite = httpsCallable(motorideFunctions, 'sendRideInvite');
            await sendRideInvite({
              toUid: retryCanonUid,
              groupId: routeCode,
              groupName: safeName,
              inviteKind,
            });
          } catch (ce: unknown) {
            const c = (ce as { code?: string })?.code || '';
            if (c === 'functions/not-found') {
              console.warn('[invite] retry: Callable not-found; Firestore directo.', {
                inviterUid: user.uid,
                receiverUid: retryCanonUid,
                routeCode,
                inviteDocId: inviteDocIdRetry,
              });
              await sendRetryViaFirestore();
            } else {
              let diag: Record<string, unknown> = {};
              try {
                diag = await fetchInviteDiagnostics(user.uid, retryCanonUid, routeCode);
              } catch (dx: unknown) {
                diag = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
              }
              console.error('[invite] retry Callable sendRideInvite error (no es not-found)', {
                error: pickFirebaseErr(ce),
                inviterUid: user.uid,
                receiverUid: retryCanonUid,
                routeCode,
                inviteDocId: inviteDocIdRetry,
                inviteKind,
                diag,
              });
              throw ce;
            }
          }
          setSentIds((s) => ({ ...s, [targetUid]: Date.now() }));
          return;
        } catch (retryErr: unknown) {
          const receiverForDiag = retryCanonUid || targetUid;
          let diagFinal: Record<string, unknown> = {};
          try {
            diagFinal = await fetchInviteDiagnostics(user.uid, receiverForDiag, routeCode);
          } catch (dx: unknown) {
            diagFinal = { fetchInviteDiagnosticsFailed: pickFirebaseErr(dx) };
          }
          console.error('[invite] Invite retry failed (resumen)', {
            error: pickFirebaseErr(retryErr),
            inviterUid: user.uid,
            receiverUid: receiverForDiag,
            targetUidInput: targetUid,
            routeCode,
            inviteDocId: `${user.uid}_${routeCode}`,
            inviteKind,
            groupIdProp: groupId,
            safeNameLen: safeName.length,
            diag: diagFinal,
          });
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
