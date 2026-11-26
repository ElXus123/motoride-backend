import {
  collection,
  deleteField,
  doc,
  FieldPath,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { RouteStop, RouteStopKind } from './routeStops';

/**
 * Votación en grupo de las paradas de la ruta.
 *
 * Modelo (subcolección groups/{groupId}/stopVotes/{docId}):
 * - docId = `${routeKeyHash(routeKey)}_${stopId con "/" cambiado por "_"}`. Va ligado a la ruta para que
 *   una nueva ruta del mismo grupo no choque con los votos de la anterior (un doc existente no se recrea).
 * - Campos: routeKey, stopId ("node/123"), name (≤ 80), kind, lat, lng, km (posición en la ruta), votes
 *   (mapa uid → true), updatedAt (serverTimestamp).
 * - Cada miembro tiene como mucho un voto en la ruta (lo garantiza el cliente al mover el voto; las reglas
 *   solo permiten tocar la clave propia de `votes`).
 *
 * Regla de mayoría (única fuente de verdad: `isStopChosen` / `pickChosenStop`):
 * - Electorado E = uids distintos con un voto registrado en cualquiera de las paradas de la ruta.
 * - Una parada S está «elegida» si votos(S) ≥ 1 y votos(S) × 2 > |E| (más de la mitad del electorado).
 * - Si hay varias elegidas, gana la de más votos; empate → la de menor km; empate → docId alfabético.
 * - Empates entre dos paradas (p. ej. 1 y 1 con |E| = 2) no eligen ninguna.
 *
 * Escrituras: cada voto es una escritura por campo (`votes.<uid>`), nunca el mapa entero, así dos votos
 * simultáneos de distintos miembros no se pisan aunque se hagan a la vez.
 */

export const STOP_VOTE_KINDS: readonly RouteStopKind[] = ['fuel', 'cafe', 'viewpoint'];

export type StopVoteDoc = {
  docId: string;
  routeKey: string;
  stopId: string;
  name: string;
  kind: RouteStopKind;
  lat: number;
  lng: number;
  km: number;
  votes: Record<string, true>;
};

/** Fila lista para la UI (panel de paradas). */
export type RouteStopCandidate = {
  docId: string;
  stopId: string;
  kind: RouteStopKind;
  name: string | null;
  lat: number;
  lng: number;
  alongM: number;
  votes: number;
  mine: boolean;
  chosen: boolean;
};

export type VoteOp = { docId: string; op: 'set' | 'delete' };

/** Hash estable y corto (djb2, base36) de la clave de ruta. */
export function routeKeyHash(routeKey: string): string {
  let h = 5381;
  for (let i = 0; i < routeKey.length; i++) h = ((h * 33) ^ routeKey.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function stopVoteDocId(routeKey: string, stopId: string): string {
  return `${routeKeyHash(routeKey)}_${stopId.replace('/', '_')}`;
}

export function countVotes(doc: StopVoteDoc): number {
  return Object.values(doc.votes).filter((v) => v === true).length;
}

/** Electorado: uids con un voto registrado en cualquiera de las paradas de la ruta. */
export function electorateOf(docs: StopVoteDoc[]): Set<string> {
  const voters = new Set<string>();
  for (const d of docs) {
    for (const [uid, v] of Object.entries(d.votes)) if (v === true) voters.add(uid);
  }
  return voters;
}

/** Regla de mayoría simple: al menos 1 voto y más de la mitad del electorado. */
export function isStopChosen(votes: number, electorateSize: number): boolean {
  return votes >= 1 && votes * 2 > electorateSize;
}

/** Parada elegida por el grupo, o null si ninguna cumple la regla de mayoría. */
export function pickChosenStop(docs: StopVoteDoc[]): { doc: StopVoteDoc; votes: number } | null {
  const size = electorateOf(docs).size;
  let best: { doc: StopVoteDoc; votes: number } | null = null;
  for (const doc of docs) {
    const votes = countVotes(doc);
    if (!isStopChosen(votes, size)) continue;
    if (
      !best ||
      votes > best.votes ||
      (votes === best.votes && doc.km < best.doc.km) ||
      (votes === best.votes && doc.km === best.doc.km && doc.docId < best.doc.docId)
    ) {
      best = { doc, votes };
    }
  }
  return best;
}

/** Operaciones para dejar el voto de `uid` solo en `targetDocId` (o en ninguna si es null). */
export function buildVoteMoveOps(docs: StopVoteDoc[], uid: string, targetDocId: string | null): VoteOp[] {
  const ops: VoteOp[] = [];
  for (const d of docs) {
    const has = d.votes[uid] === true;
    if (d.docId === targetDocId) {
      if (!has) ops.push({ docId: d.docId, op: 'set' });
    } else if (has) {
      ops.push({ docId: d.docId, op: 'delete' });
    }
  }
  return ops;
}

/**
 * Aplica una operación de voto con la semántica de escritura por campo de Firestore
 * (`votes.<uid>` se toca; el resto de claves no cambian). Pura: la usan los tests para simular la fusión.
 */
export function applyVoteOp(votes: Record<string, true>, uid: string, op: VoteOp['op']): Record<string, true> {
  const next = { ...votes };
  if (op === 'set') next[uid] = true;
  else delete next[uid];
  return next;
}

export function toRouteStop(doc: StopVoteDoc): RouteStop {
  return {
    id: doc.stopId,
    kind: doc.kind,
    name: doc.name || null,
    lat: doc.lat,
    lng: doc.lng,
    alongM: doc.km * 1000,
    offRouteM: 0,
  };
}

/** Filas para el panel: a partir de los docs de Firestore, o de la lista local (Overpass) si aún no hay docs. */
export function buildCandidates(
  docs: StopVoteDoc[],
  localStops: RouteStop[] | null,
  routeKey: string,
  uid: string | null
): RouteStopCandidate[] | null {
  if (docs.length > 0) {
    const chosenId = pickChosenStop(docs)?.doc.docId ?? null;
    return docs.map((d) => ({
      docId: d.docId,
      stopId: d.stopId,
      kind: d.kind,
      name: d.name || null,
      lat: d.lat,
      lng: d.lng,
      alongM: d.km * 1000,
      votes: countVotes(d),
      mine: !!uid && d.votes[uid] === true,
      chosen: d.docId === chosenId,
    }));
  }
  if (!localStops) return null;
  return localStops.map((s) => ({
    docId: stopVoteDocId(routeKey, s.id),
    stopId: s.id,
    kind: s.kind,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    alongM: s.alongM,
    votes: 0,
    mine: false,
    chosen: false,
  }));
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valida un documento leído de Firestore. Devuelve null si le falta algo o es inconsistente. */
export function parseStopVoteDoc(docId: string, data: Record<string, unknown>): StopVoteDoc | null {
  if (typeof data.routeKey !== 'string' || typeof data.stopId !== 'string') return null;
  if (!/^(node|way|relation)\/\d{1,20}$/.test(data.stopId)) return null;
  if (!STOP_VOTE_KINDS.includes(data.kind as RouteStopKind)) return null;
  if (!isNum(data.lat) || !isNum(data.lng) || !isNum(data.km)) return null;
  if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) return null;
  const rawVotes = data.votes;
  if (!rawVotes || typeof rawVotes !== 'object') return null;
  const votes: Record<string, true> = {};
  for (const [uid, v] of Object.entries(rawVotes as Record<string, unknown>)) {
    if (v === true) votes[uid] = true;
  }
  return {
    docId,
    routeKey: data.routeKey,
    stopId: data.stopId,
    name: typeof data.name === 'string' ? data.name.slice(0, 80) : '',
    kind: data.kind as RouteStopKind,
    lat: data.lat,
    lng: data.lng,
    km: data.km,
    votes,
  };
}

export type StopVoteSnapshot = { docs: StopVoteDoc[]; fromCache: boolean };

/**
 * Un único listener por ruta: escucha los docs de la ruta activa en el grupo.
 * Quien llama debe cancelarlo (la función devuelta) al salir de la ruta.
 */
export function subscribeRouteStopVotes(
  db: Firestore,
  groupId: string,
  routeKey: string,
  onData: (snapshot: StopVoteSnapshot) => void,
  onError: (error: unknown) => void
): () => void {
  const q = query(collection(db, 'groups', groupId, 'stopVotes'), where('routeKey', '==', routeKey));
  return onSnapshot(
    q,
    (snap) => {
      const docs: StopVoteDoc[] = [];
      snap.forEach((d) => {
        const parsed = parseStopVoteDoc(d.id, d.data() as Record<string, unknown>);
        if (parsed) docs.push(parsed);
      });
      onData({ docs, fromCache: snap.metadata.fromCache });
    },
    onError
  );
}

/**
 * Publica las candidatas de la ruta (una sola escritura en lote). Solo debe llamarse cuando el listener
 * ya ha confirmado que no hay docs para esa ruta; si otro miembro publicó antes, el lote falla entero
 * (las reglas no permiten recrear ni vaciar `votes`) y no se pierde ningún voto.
 */
export async function publishRouteStopCandidates(
  db: Firestore,
  groupId: string,
  routeKey: string,
  stops: RouteStop[]
): Promise<void> {
  if (stops.length === 0) return;
  const batch = writeBatch(db);
  for (const s of stops) {
    batch.set(doc(db, 'groups', groupId, 'stopVotes', stopVoteDocId(routeKey, s.id)), {
      routeKey,
      stopId: s.id,
      name: (s.name ?? '').slice(0, 80),
      kind: s.kind,
      lat: s.lat,
      lng: s.lng,
      km: s.alongM / 1000,
      votes: {},
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Aplica las operaciones de voto en un lote. Escrituras por campo: no pisan votos de otros miembros. */
export async function applyVoteOps(db: Firestore, groupId: string, uid: string, ops: VoteOp[]): Promise<void> {
  if (ops.length === 0) return;
  const batch = writeBatch(db);
  for (const op of ops) {
    const ref = doc(db, 'groups', groupId, 'stopVotes', op.docId);
    const value = op.op === 'set' ? true : deleteField();
    batch.update(ref, new FieldPath('votes', uid), value, 'updatedAt', serverTimestamp());
  }
  await batch.commit();
}
