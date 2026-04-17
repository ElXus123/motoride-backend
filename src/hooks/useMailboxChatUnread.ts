import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { tryDirectChatFirestoreId } from '../lib/directChatId';
import { normalizeFriendIds } from '../lib/routeListing';

export type UnreadPlanRow = { groupId: string; groupName: string; preview: string; at: number };
export type UnreadDmRow = { peerUid: string; peerLabel: string; preview: string; at: number };

type RouteLite = { id?: string; name?: string; members?: unknown; isScheduled?: boolean };

function planReceiptId(groupId: string): string {
  return `plan_${groupId.trim().toUpperCase()}`;
}

function dmReceiptId(chatId: string): string {
  return `dm_${chatId}`;
}

export function useMailboxChatUnread(
  userUid: string | undefined,
  friendsRaw: unknown,
  scheduledRoutes: RouteLite[]
): {
  unreadPlans: UnreadPlanRow[];
  unreadDms: UnreadDmRow[];
  messageBadgeCount: number;
} {
  const receiptsRef = useRef<Record<string, number>>({});
  const [receipts, setReceipts] = useState<Record<string, number>>({});
  const [planSnap, setPlanSnap] = useState<Record<string, { at: number; preview: string; fromUid: string }>>({});
  const [dmSnap, setDmSnap] = useState<Record<string, { at: number; preview: string; fromUid: string }>>({});
  const [dmLabels, setDmLabels] = useState<Record<string, string>>({});
  const dmPeersFetchedRef = useRef<Set<string>>(new Set());

  const friendIds = useMemo(() => normalizeFriendIds(friendsRaw), [friendsRaw]);

  useEffect(() => {
    dmPeersFetchedRef.current = new Set();
  }, [friendIds.join('|')]);

  const memberScheduled = useMemo(() => {
    if (!userUid) return [];
    return scheduledRoutes.filter((r) => {
      if (r?.isScheduled !== true) return false;
      const id = String(r.id || '').trim().toUpperCase();
      if (id.length !== 6) return false;
      const mem = Array.isArray(r.members) ? r.members.map((x: unknown) => String(x)) : [];
      return mem.includes(userUid);
    });
  }, [scheduledRoutes, userUid]);

  useEffect(() => {
    if (!userUid) {
      receiptsRef.current = {};
      setReceipts({});
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'users', userUid, 'readReceipts'),
      (snap) => {
        const m: Record<string, number> = {};
        snap.forEach((d) => {
          const v = d.data() as { lastReadAt?: unknown };
          const n = typeof v.lastReadAt === 'number' && Number.isFinite(v.lastReadAt) ? v.lastReadAt : 0;
          m[d.id] = n;
        });
        receiptsRef.current = m;
        setReceipts(m);
      },
      () => {
        /* ignore */
      }
    );
    return () => unsub();
  }, [userUid]);

  useEffect(() => {
    if (!userUid) {
      setPlanSnap({});
      return;
    }
    const unsubs: (() => void)[] = [];
    for (const r of memberScheduled) {
      const gid = String(r.id || '').trim().toUpperCase();
      const q = query(collection(db, 'groups', gid, 'planMessages'), orderBy('createdAt', 'desc'), limit(1));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const d = snap.docs[0];
          if (!d) {
            setPlanSnap((prev) => {
              const next = { ...prev };
              delete next[gid];
              return next;
            });
            return;
          }
          const x = d.data() as Record<string, unknown>;
          const createdAt =
            typeof x.createdAt === 'number' && Number.isFinite(x.createdAt)
              ? x.createdAt
              : x.createdAt && typeof (x.createdAt as { toMillis?: () => number }).toMillis === 'function'
                ? (x.createdAt as { toMillis: () => number }).toMillis()
                : 0;
          const fromUid = String(x.uid ?? '');
          const preview = String(x.text ?? '').slice(0, 80);
          setPlanSnap((prev) => ({ ...prev, [gid]: { at: createdAt, preview, fromUid } }));
        },
        () => {
          /* ignore */
        }
      );
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
  }, [userUid, memberScheduled]);

  useEffect(() => {
    if (!userUid) {
      setDmSnap({});
      return;
    }
    const unsubs: (() => void)[] = [];
    for (const fid of friendIds) {
      const chatId = tryDirectChatFirestoreId(userUid, fid);
      if (!chatId) continue;
      const q = query(collection(db, 'privateChats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(1));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const d = snap.docs[0];
          if (!d) {
            setDmSnap((prev) => {
              const next = { ...prev };
              delete next[chatId];
              return next;
            });
            return;
          }
          const x = d.data() as Record<string, unknown>;
          const createdAt =
            typeof x.createdAt === 'number' && Number.isFinite(x.createdAt)
              ? x.createdAt
              : x.createdAt && typeof (x.createdAt as { toMillis?: () => number }).toMillis === 'function'
                ? (x.createdAt as { toMillis: () => number }).toMillis()
                : 0;
          const fromUid = String(x.uid ?? '');
          const preview = String(x.text ?? '').slice(0, 80);
          setDmSnap((prev) => ({ ...prev, [chatId]: { at: createdAt, preview, fromUid } }));
        },
        () => {
          /* ignore */
        }
      );
      unsubs.push(unsub);
    }
    return () => unsubs.forEach((u) => u());
  }, [userUid, friendIds]);

  useEffect(() => {
    if (!userUid) {
      dmPeersFetchedRef.current = new Set();
      return;
    }
    void (async () => {
      for (const chatId of Object.keys(dmSnap)) {
        const peerUid =
          friendIds.find((fid) => tryDirectChatFirestoreId(userUid, fid) === chatId) ?? '';
        if (!peerUid || dmPeersFetchedRef.current.has(peerUid)) continue;
        dmPeersFetchedRef.current.add(peerUid);
        try {
          const snap = await getDoc(doc(db, 'users', peerUid));
          const name = snap.exists()
            ? String((snap.data() as { displayName?: string }).displayName || '').trim().slice(0, 40) || peerUid
            : peerUid;
          setDmLabels((prev) => ({ ...prev, [peerUid]: name }));
        } catch {
          setDmLabels((prev) => ({ ...prev, [peerUid]: peerUid }));
        }
      }
    })();
  }, [userUid, dmSnap, friendIds]);

  const unreadPlans = useMemo((): UnreadPlanRow[] => {
    if (!userUid) return [];
    const out: UnreadPlanRow[] = [];
    for (const r of memberScheduled) {
      const gid = String(r.id || '').trim().toUpperCase();
      const row = planSnap[gid];
      if (!row || row.at <= 0) continue;
      if (row.fromUid === userUid) continue;
      const lr = receipts[planReceiptId(gid)] ?? 0;
      if (row.at <= lr) continue;
      out.push({
        groupId: gid,
        groupName: String(r.name || 'Ruta').trim() || 'Ruta',
        preview: row.preview,
        at: row.at,
      });
    }
    out.sort((a, b) => b.at - a.at);
    return out;
  }, [userUid, memberScheduled, planSnap, receipts]);

  const unreadDms = useMemo((): UnreadDmRow[] => {
    if (!userUid) return [];
    const out: UnreadDmRow[] = [];
    for (const fid of friendIds) {
      const chatId = tryDirectChatFirestoreId(userUid, fid);
      if (!chatId) continue;
      const row = dmSnap[chatId];
      if (!row || row.at <= 0) continue;
      if (row.fromUid === userUid) continue;
      const lr = receipts[dmReceiptId(chatId)] ?? 0;
      if (row.at <= lr) continue;
      out.push({
        peerUid: fid,
        peerLabel: dmLabels[fid] || fid,
        preview: row.preview,
        at: row.at,
      });
    }
    out.sort((a, b) => b.at - a.at);
    return out;
  }, [userUid, friendIds, dmSnap, receipts, dmLabels]);

  const messageBadgeCount = unreadPlans.length + unreadDms.length;

  return { unreadPlans, unreadDms, messageBadgeCount };
}

/** Marca leído el hilo de planificación (máx. `lastSeenCreatedAt` ya visto). */
export async function markPlanChatRead(userUid: string, groupId: string, lastSeenCreatedAt: number): Promise<void> {
  const gid = groupId.trim().toUpperCase();
  if (!userUid || gid.length !== 6) return;
  try {
    await setDoc(
      doc(db, 'users', userUid, 'readReceipts', planReceiptId(gid)),
      { lastReadAt: Math.max(0, Math.floor(lastSeenCreatedAt)) },
      { merge: true }
    );
  } catch {
    /* ignore */
  }
}

/** Marca leído el DM (máx. `lastSeenCreatedAt`). */
export async function markDmChatRead(userUid: string, peerUid: string, lastSeenCreatedAt: number): Promise<void> {
  const chatId = tryDirectChatFirestoreId(userUid, peerUid);
  if (!userUid || !chatId) return;
  try {
    await setDoc(
      doc(db, 'users', userUid, 'readReceipts', dmReceiptId(chatId)),
      { lastReadAt: Math.max(0, Math.floor(lastSeenCreatedAt)) },
      { merge: true }
    );
  } catch {
    /* ignore */
  }
}
