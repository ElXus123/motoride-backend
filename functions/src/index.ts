import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type QuerySnapshot } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/** Origen público de la PWA (ajusta si usas dominio propio). */
const APP_ORIGIN = process.env.MOTORIDE_APP_ORIGIN || 'https://motoapp-3e6c6.web.app';

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

export const onRideInviteWrite = onDocumentWritten(
  {
    document: 'users/{userId}/invites/{inviteId}',
    region: 'europe-west1',
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const userId = event.params.userId;
    const prevSent = event.data?.before?.exists ? event.data.before.get('sentAt') : null;
    const nextSent = after.get('sentAt');
    if (prevSent !== null && prevSent === nextSent) return;
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
