import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Query,
  type QuerySnapshot,
} from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/** Rutas en vivo: caducidad tras 24 h desde `createdAt` (no aplica a programadas con salida futura). */
const OPEN_GROUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readFirestoreMillis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v != null && typeof v === 'object' && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const n = fn.call(v);
      return typeof n === 'number' && Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** Borra todos los documentos que devuelve la query, por lotes (mismo filtro en cada pasada). */
async function deleteByQueryBatches(query: Query, batchSize: number): Promise<number> {
  let total = 0;
  for (;;) {
    const snap = await query.limit(batchSize).get();
    if (snap.empty) return total;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
  }
}

/** Origen público de la PWA (ajusta si usas dominio propio). */
const APP_ORIGIN = process.env.MOTORIDE_APP_ORIGIN || 'https://motoapp-3e6c6.web.app';

function normalizeMembers(m: unknown): string[] {
  if (!Array.isArray(m)) return [];
  return m.map((x) => String(x).trim()).filter(Boolean);
}

function normalizeFriends(f: unknown): string[] {
  if (!Array.isArray(f)) return [];
  return f.map((x) => String(x).trim()).filter(Boolean);
}

function normalizeIncoming(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/** Lista de amigos, solicitudes o sala DM ya existente (alineado con reglas Firestore `rideInviteSocialOk`). */
async function usersShareFriendshipOrDm(uidA: string, uidB: string): Promise<boolean> {
  if (!uidA || !uidB || uidA === uidB) return false;
  const [lo, hi] = uidA < uidB ? [uidA, uidB] : [uidB, uidA];
  const dmId = `${lo}_${hi}`;
  const dm = await db.collection('privateChats').doc(dmId).get();
  if (dm.exists) {
    const mem = normalizeMembers(dm.data()?.members);
    if (mem.includes(uidA) && mem.includes(uidB)) return true;
  }

  const [ua, ub] = await Promise.all([
    db.collection('users').doc(uidA).get(),
    db.collection('users').doc(uidB).get(),
  ]);
  const da = ua.data();
  const dataB = ub.data();
  const fa = normalizeFriends(da?.friends);
  const fb = normalizeFriends(dataB?.friends);
  if (fa.includes(uidB) || fb.includes(uidA)) return true;
  const incA = normalizeIncoming(da?.friendRequestsIncoming);
  const incB = normalizeIncoming(dataB?.friendRequestsIncoming);
  const outA = normalizeIncoming(da?.friendRequestsOutgoing);
  const outB = normalizeIncoming(dataB?.friendRequestsOutgoing);
  return (
    incA.includes(uidB) ||
    incB.includes(uidA) ||
    outA.includes(uidB) ||
    outB.includes(uidA)
  );
}

async function sendMulticastToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  const snap = await db.collection('users').doc(userId).collection('fcmTokens').get();
  const pairs: { ref: DocumentReference; token: string }[] = [];
  snap.docs.forEach((d) => {
    const t = d.data()?.token;
    if (typeof t === 'string' && t.length > 80) pairs.push({ ref: d.ref, token: t });
  });
  if (pairs.length === 0) return;

  const chunkSize = 400;
  for (let i = 0; i < pairs.length; i += chunkSize) {
    const chunk = pairs.slice(i, i + chunkSize);
    const tokens = chunk.map((p) => p.token);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: {
          ...data,
          title,
          body,
        },
        webpush: {
          fcmOptions: {
            link: data.url || APP_ORIGIN,
          },
        },
      });
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          const ref = chunk[idx]?.ref;
          if (ref) void ref.delete().catch(() => {});
        }
      });
    } catch (e) {
      logger.warn('sendMulticastToUser chunk failed', e);
    }
  }
}

/**
 * Invitación a ruta (Admin SDK → `rideInvites/{from}_{to}_{group}`). Opcional si el cliente escribe directo.
 */
export const sendRideInvite = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const fromUid = request.auth?.uid;
  if (!fromUid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const raw = request.data as Record<string, unknown>;
  const toUid = String(raw?.toUid || '').trim();
  const gidInput = String(raw?.groupId || '').trim().toUpperCase();
  const groupName = String(raw?.groupName || 'Ruta').trim().slice(0, 120) || 'Ruta';
  const inviteKindRaw = raw?.inviteKind;
  const inviteKind =
    inviteKindRaw === 'scheduled_ride' || inviteKindRaw === 'live_ride' ? inviteKindRaw : 'live_ride';

  if (!toUid || toUid === fromUid) {
    throw new HttpsError('invalid-argument', 'Usuario destino no válido.');
  }
  if (gidInput === 'REPEATED' || gidInput.length !== 6) {
    throw new HttpsError('invalid-argument', 'Código de ruta no válido.');
  }

  const groupRef = db.collection('groups').doc(gidInput);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'No existe ese grupo.');
  }
  const routeCode = groupSnap.id;
  const members = normalizeMembers(groupSnap.data()?.members);
  if (!members.includes(fromUid)) {
    throw new HttpsError('permission-denied', 'No eres miembro de esta ruta en el servidor.');
  }

  const toUser = await db.collection('users').doc(toUid).get();
  if (!toUser.exists) {
    throw new HttpsError('not-found', 'No existe el perfil del destinatario.');
  }

  const coMember = members.includes(toUid);
  let friendsOrDm = false;
  try {
    friendsOrDm = await usersShareFriendshipOrDm(fromUid, toUid);
  } catch (e) {
    logger.warn('sendRideInvite friends/dm check', e);
    friendsOrDm = false;
  }
  if (!friendsOrDm && !coMember) {
    throw new HttpsError(
      'permission-denied',
      'No hay amistad en listas, DM previo ni co-miembros en el grupo para esta invitación.'
    );
  }

  const inviteDocId = `${fromUid}_${toUid}_${routeCode}`;
  const rejId = `${fromUid}_${routeCode}`;
  const rej = await db.collection('users').doc(toUid).collection('inviteRejections').doc(rejId).get();
  if (rej.exists) {
    throw new HttpsError('failed-precondition', 'Esta invitación fue rechazada en el buzón para esta ruta.');
  }

  const sentAt = Date.now();
  const inviteRef = db.collection('rideInvites').doc(inviteDocId);

  try {
    await inviteRef.set(
      {
        fromUid,
        toUid,
        groupId: routeCode,
        groupName,
        sentAt,
        kind: inviteKind,
        status: 'pending',
      },
      { merge: true }
    );
  } catch (e) {
    logger.error('sendRideInvite rideInvites', e);
    throw new HttpsError('internal', 'No se pudo guardar la invitación.');
  }

  return { ok: true, routeCode };
});

export const onRideInviteWrite = onDocumentWritten(
  {
    document: 'rideInvites/{inviteId}',
    region: 'europe-west1',
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const userId = String(after.get('toUid') || '').trim();
    if (!userId) return;
    const prevSent = event.data?.before?.exists ? event.data.before.get('sentAt') : null;
    const nextSent = after.get('sentAt');
    if (prevSent !== null && prevSent === nextSent) return;
    const st = String(after.get('status') || '');
    if (st !== '' && st !== 'pending') return;
    const groupName = String(after.get('groupName') || 'Ruta').trim() || 'Ruta';
    const groupId = String(after.get('groupId') || '').trim().toUpperCase();
    if (groupId.length !== 6) return;
    const url = `${APP_ORIGIN}/?join=${groupId}`;
    await sendMulticastToUser(
      userId,
      'Invitación a ruta — MotoRide',
      `${groupName} (${groupId}). Abre la app para responder.`,
      { type: 'ride_invite', groupId, url, tag: `invite_${groupId}` }
    );
  }
);

/**
 * Cada 5 min: rutas programadas cuya salida está entre ~55 y ~65 minutos desde ahora → push a miembros (una vez).
 */
export const notifyScheduledRouteJoinWindow = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Europe/Madrid',
    region: 'europe-west1',
  },
  async () => {
    const now = Date.now();
    const lower = now + 55 * 60 * 1000;
    const upper = now + 65 * 60 * 1000;
    let groupSnap: QuerySnapshot;
    try {
      groupSnap = await db
        .collection('groups')
        .where('isScheduled', '==', true)
        .where('scheduledTimestamp', '>=', lower)
        .where('scheduledTimestamp', '<=', upper)
        .get();
    } catch (e) {
      logger.error('notifyScheduledRouteJoinWindow query', e);
      return;
    }

    for (const doc of groupSnap.docs) {
      const d = doc.data();
      const ts = Number(d.scheduledTimestamp);
      if (!Number.isFinite(ts)) continue;
      if (d.joinWindowPushForTs === ts) continue;
      const members = Array.isArray(d.members) ? d.members.map((x: unknown) => String(x)) : [];
      const name = String(d.name || 'Ruta').trim() || 'Ruta';
      const code = doc.id;
      const url = `${APP_ORIGIN}/?join=${code}`;

      try {
        await doc.ref.update({ joinWindowPushForTs: ts });
      } catch (e) {
        logger.warn('joinWindowPushForTs update failed', doc.id, e);
        continue;
      }

      for (const uid of members) {
        if (!uid) continue;
        try {
          await sendMulticastToUser(
            uid,
            'MotoRide — ventana de salida',
            `${name}: ya puedes entrar al mapa, chat de voz y acuerdos (1 h antes de la hora).`,
            { type: 'scheduled_join', groupId: code, url, tag: `sched_join_${code}_${ts}` }
          );
        } catch (e) {
          logger.warn('notify member', uid, e);
        }
      }
    }
  }
);

/**
 * Cada hora: elimina grupos con `createdAt` de hace ≥24 h que ya no apliquen como “abiertos”.
 * Omite si `isRecording == true`. Omite rutas programadas (`isScheduled`) cuya `scheduledTimestamp`
 * sigue en el futuro (aunque el doc sea antiguo). Borra subcolección `planMessages` e invitaciones `rideInvites` del código.
 */
export const purgeStaleOpenGroups = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'Europe/Madrid',
    region: 'europe-west1',
  },
  async () => {
    const now = Date.now();
    const cutoff = now - OPEN_GROUP_MAX_AGE_MS;
    let deleted = 0;
    let skipped = 0;
    try {
      const groupSnap = await db
        .collection('groups')
        .where('createdAt', '<=', cutoff)
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get();
      for (const doc of groupSnap.docs) {
        const d = doc.data();
        if (d.isRecording === true) {
          skipped += 1;
          continue;
        }
        const isSched = d.isScheduled === true;
        const st = readFirestoreMillis(d.scheduledTimestamp);
        if (isSched) {
          if (st == null) {
            skipped += 1;
            continue;
          }
          if (st > now) {
            skipped += 1;
            continue;
          }
        }
        const createdMs = readFirestoreMillis(d.createdAt);
        if (createdMs == null || createdMs > cutoff) {
          skipped += 1;
          continue;
        }
        const code = doc.id;
        try {
          await deleteByQueryBatches(doc.ref.collection('planMessages'), 400);
        } catch (e) {
          logger.warn('purgeStaleOpenGroups planMessages', code, e);
        }
        try {
          await deleteByQueryBatches(db.collection('rideInvites').where('groupId', '==', code), 400);
        } catch (e) {
          logger.warn('purgeStaleOpenGroups rideInvites', code, e);
        }
        try {
          await doc.ref.delete();
          deleted += 1;
        } catch (e) {
          logger.error('purgeStaleOpenGroups delete group', code, e);
        }
      }
      if (deleted > 0 || groupSnap.size > 0) {
        logger.info('purgeStaleOpenGroups done', { deleted, scanned: groupSnap.size, skipped });
      }
    } catch (e) {
      logger.error('purgeStaleOpenGroups', e);
    }
  }
);
