import { useEffect, useRef } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

const ONE_H_MS = 60 * 60 * 1000;
/** Tras el instante «falta 1 h», seguimos intentando unos minutos por si el navegador estaba suspendido. */
const SCHED_AFTER_ONE_H_GRACE_MS = 15 * 60 * 1000;

function notificationsSupported(): boolean {
  return typeof globalThis !== 'undefined' && 'Notification' in globalThis;
}

function postMotorideNotification(title: string, body: string, tag: string): void {
  try {
    if (!notificationsSupported() || globalThis.Notification.permission !== 'granted') return;
    const origin =
      typeof globalThis.window !== 'undefined' && globalThis.window.location?.origin
        ? globalThis.window.location.origin
        : '';
    const icon = origin ? `${origin}/icon-192.png` : undefined;
    void new globalThis.Notification(title, { body, tag, icon, lang: 'es' });
  } catch {
    /* ignore */
  }
}

function tryConsumeDedupeKey(key: string): boolean {
  try {
    if (globalThis.localStorage?.getItem(key)) return false;
    globalThis.localStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

function rideInviteDedupeKey(fromUid: string, groupId: string, sentAt: number): string {
  return `motoride_notif_ride_${String(fromUid || '').trim()}_${String(groupId || '').toUpperCase().trim()}_${sentAt}`;
}

type RideInvitePayload = {
  fromUid?: string;
  groupId?: string;
  groupName?: string;
  sentAt?: number;
  kind?: string;
};

/**
 * Notificaciones de sistema (Web Notification API; requiere permiso concedido, p. ej. vía `NotificationPermissionBanner`).
 * - ~1 h antes de una ruta programada (miembro del grupo).
 * - Invitación a ruta (colección `rideInvites`).
 * - Solicitud de amistad (`friendRequestsIncoming`).
 */
export function useMotorideSystemNotifications(userUid: string | undefined): void {
  const scheduledRoutesRef = useRef<{ id: string; scheduledTimestamp?: number; name?: string }[]>([]);
  const userDocFirstRef = useRef(true);
  const prevFriendIncomingRef = useRef<Set<string>>(new Set());
  const invitesFirstRef = useRef(true);

  useEffect(() => {
    if (!userUid) {
      userDocFirstRef.current = true;
      prevFriendIncomingRef.current = new Set();
      return;
    }
    userDocFirstRef.current = true;
    prevFriendIncomingRef.current = new Set();

    const unsub = onSnapshot(
      doc(db, 'users', userUid),
      (snap) => {
        try {
          if (!snap.exists()) return;
          const data = snap.data();
          const incoming: string[] = Array.isArray(data.friendRequestsIncoming)
            ? data.friendRequestsIncoming.map((x: unknown) => String(x || '').trim()).filter(Boolean)
            : [];
          if (userDocFirstRef.current) {
            userDocFirstRef.current = false;
            prevFriendIncomingRef.current = new Set(incoming);
            return;
          }

          const prev = prevFriendIncomingRef.current;
          for (const id of incoming) {
            if (!prev.has(id)) {
              postMotorideNotification(
                'Solicitud de amistad',
                'Tienes una solicitud pendiente en MotoRide. Abre Amigos para responder.',
                `friend-req-${id}`
              );
            }
          }
          prevFriendIncomingRef.current = new Set(incoming);
        } catch {
          /* ignore */
        }
      },
      (err) => {
        console.error('useMotorideSystemNotifications user doc', err);
      }
    );
    return () => unsub();
  }, [userUid]);

  useEffect(() => {
    if (!userUid) {
      invitesFirstRef.current = true;
      return;
    }
    invitesFirstRef.current = true;
    const q = query(
      collection(db, 'rideInvites'),
      where('toUid', '==', userUid),
      where('status', '==', 'pending'),
      limit(60)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        try {
          if (invitesFirstRef.current) {
            invitesFirstRef.current = false;
            return;
          }
          for (const ch of snap.docChanges()) {
            if (ch.type !== 'added' && ch.type !== 'modified') continue;
            const d = ch.doc.data() as RideInvitePayload;
            const from = String(d.fromUid || '').trim();
            const gid = String(d.groupId || '').toUpperCase().trim();
            const sentAt = Number(d.sentAt) || 0;
            if (!from || gid.length !== 6) continue;
            if (!tryConsumeDedupeKey(rideInviteDedupeKey(from, gid, sentAt))) continue;
            const title = d.kind === 'scheduled_ride' ? 'Invitación (ruta programada)' : 'Invitación a ruta';
            postMotorideNotification(
              title,
              `${String(d.groupName || 'Ruta').trim() || 'Ruta'} (${gid}). Revisa la bandeja en MotoRide.`,
              `invite-mailbox-${from}_${gid}_${sentAt}`
            );
          }
        } catch {
          /* ignore */
        }
      },
      (err) => {
        console.error('useMotorideSystemNotifications invites', err);
      }
    );
    return () => unsub();
  }, [userUid]);

  useEffect(() => {
    if (!userUid) {
      scheduledRoutesRef.current = [];
      return;
    }
    scheduledRoutesRef.current = [];
    const q = query(
      collection(db, 'groups'),
      where('members', 'array-contains', userUid),
      where('isScheduled', '==', true)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        try {
          scheduledRoutesRef.current = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as { scheduledTimestamp?: number; name?: string }),
          }));
        } catch {
          scheduledRoutesRef.current = [];
        }
      },
      (err) => {
        console.error('useMotorideSystemNotifications scheduled groups', err);
      }
    );

    const tick = () => {
      try {
        const now = Date.now();
        for (const r of scheduledRoutesRef.current) {
          const ts = Number(r.scheduledTimestamp);
          if (!Number.isFinite(ts) || ts <= now) continue;
          const oneHourBefore = ts - ONE_H_MS;
          if (now < oneHourBefore || now > oneHourBefore + SCHED_AFTER_ONE_H_GRACE_MS) continue;
          const id = String(r.id || '').trim();
          if (id.length !== 6) continue;
          const dk = `motoride_notif_sched1h_${id}_${ts}`;
          if (!tryConsumeDedupeKey(dk)) continue;
          const name = String(r.name || 'Ruta').trim() || 'Ruta';
          const when = new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
          postMotorideNotification(
            'Tu ruta empieza en ~1 h',
            `${name} (${id}). Salida: ${when}. Ya puedes entrar al mapa y al chat.`,
            `sched-1h-${id}-${ts}`
          );
        }
      } catch {
        /* ignore */
      }
    };

    const iv = globalThis.window.setInterval(tick, 25_000);
    tick();
    return () => {
      unsub();
      globalThis.window.clearInterval(iv);
    };
  }, [userUid]);
}
