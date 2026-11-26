import type { Server, Socket } from "socket.io";
import {
  TokenBucket,
  finiteInRange,
  sanitizeLocationPayload,
  sanitizeText,
  validGroupId,
} from "./server-security";

/** Tamaño máximo de un mensaje de socket.io (64 KB). Se usa en server.ts y en las pruebas. */
export const SOCKET_MAX_HTTP_BUFFER = 64 * 1024;

/** Cada cuánto se vuelve a comprobar la pertenencia a un grupo (lectura en Firestore). */
const MEMBERSHIP_TTL_MS = 60_000;
const UPDATE_BURST = 5;
const UPDATE_PER_SECOND = 5;

export interface RealtimeDeps {
  /** Verifica un ID token de Firebase y devuelve el uid. Debe lanzar si no es válido. */
  verifyToken: (token: string) => Promise<{ uid: string }>;
  /** true si `uid` aparece en groups/{groupId}.members. */
  isMember: (uid: string, groupId: string) => Promise<boolean>;
}

interface SocketState {
  uid: string;
  groupId?: string;
  memberUntil: Map<string, number>;
  voiceGroups: Set<string>;
  updateBucket: TokenBucket;
}

function state(socket: Socket): SocketState {
  return socket.data as SocketState;
}

export function registerRealtime(io: Server, deps: RealtimeDeps): void {
  // 1) Autenticación: sin ID token de Firebase válido no hay conexión.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
      return next(new Error("unauthorized"));
    }
    try {
      const decoded = await deps.verifyToken(token);
      const s = socket.data as SocketState;
      s.uid = decoded.uid;
      s.memberUntil = new Map();
      s.voiceGroups = new Set();
      s.updateBucket = new TokenBucket(UPDATE_BURST, UPDATE_PER_SECOND);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  /** Membresía con caché corta por socket. Si ya no es miembro, sale de la sala. */
  async function requireMember(socket: Socket, groupId: string): Promise<boolean> {
    const s = state(socket);
    const now = Date.now();
    const until = s.memberUntil.get(groupId);
    if (until !== undefined && until > now) return true;
    let ok = false;
    try {
      ok = await deps.isMember(s.uid, groupId);
    } catch {
      ok = false;
    }
    if (ok) {
      s.memberUntil.set(groupId, now + MEMBERSHIP_TTL_MS);
    } else {
      s.memberUntil.delete(groupId);
      socket.leave(groupId);
    }
    return ok;
  }

  function fail(socket: Socket, event: string, reason: string): void {
    socket.emit("group-error", { event, reason });
  }

  io.on("connection", (socket) => {
    const s = state(socket);
    console.log("User connected:", socket.id);

    socket.on("join-group", async (data: { groupId?: unknown }) => {
      const groupId = validGroupId(data?.groupId);
      if (!groupId) return fail(socket, "join-group", "invalid-group");
      if (!(await requireMember(socket, groupId))) return fail(socket, "join-group", "not-member");

      const disconnectKey = `${groupId}:${s.uid}`;
      const pendingTimer = pendingDisconnectTimers.get(disconnectKey);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingDisconnectTimers.delete(disconnectKey);
      }
      socket.join(groupId);
      s.groupId = groupId;
      console.log(`User ${socket.id} (uid: ${s.uid}) joined group: ${groupId}`);
      // Los que ya estaban reenvían su posición (el recién unido ve al host).
      socket.to(groupId).emit("location-sync-request", { joinedUid: s.uid });
      // El recién unido también reenvía la suya: el host la recibe aunque el primer paquete se perdiera.
      socket.emit("location-sync-request", { joinedUid: s.uid, self: true });
    });

    socket.on("leave-group", (data: { groupId?: unknown; isHost?: unknown; timestamp?: unknown }) => {
      const groupId = validGroupId(data?.groupId);
      if (!groupId || !socket.rooms.has(groupId)) return;
      const disconnectKey = `${groupId}:${s.uid}`;
      const pendingTimer = pendingDisconnectTimers.get(disconnectKey);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingDisconnectTimers.delete(disconnectKey);
      }
      socket.leave(groupId);
      socket.to(groupId).emit("user-left", { uid: s.uid, reason: "explicit-leave" });
      if (data.isHost === true) {
        socket.to(groupId).emit("host-left-route", {
          uid: s.uid,
          timestamp: finiteInRange(data.timestamp, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
        });
      }
      console.log(`User ${socket.id} (uid: ${s.uid}) explicitly left group: ${groupId}`);
    });

    socket.on("update-location", async (raw: unknown) => {
      // Límite de frecuencia: el exceso se descarta antes de tocar nada.
      if (!s.updateBucket.take()) return;
      const payload = sanitizeLocationPayload(raw, s.uid);
      if (!payload) return;
      if (!socket.rooms.has(payload.groupId)) return; // solo grupos a los que se ha unido
      if (!(await requireMember(socket, payload.groupId))) return;
      socket.to(payload.groupId).emit("location-updated", payload);
    });

    socket.on("trigger-alert", async (data: Record<string, unknown> | null) => {
      const groupId = validGroupId(data?.groupId);
      const type = sanitizeText(data?.type, 40);
      if (!groupId || !type) return;
      if (!socket.rooms.has(groupId)) return;
      if (!(await requireMember(socket, groupId))) return;
      const lat = finiteInRange(data?.lat, -90, 90);
      const lng = finiteInRange(data?.lng, -180, 180);
      socket.to(groupId).emit("alert-triggered", {
        groupId,
        uid: s.uid,
        displayName: sanitizeText(data?.displayName, 60) || "Motero",
        type,
        ...(lat !== null && lng !== null ? { lat, lng } : {}),
      });
    });

    // Señalización WebRTC (voz)
    socket.on("join-voice", async (rawGroupId: unknown) => {
      const groupId = validGroupId(rawGroupId);
      if (!groupId) return;
      if (!(await requireMember(socket, groupId))) return fail(socket, "join-voice", "not-member");
      const room = `${groupId}-voice`;
      const existing = Array.from(io.sockets.adapter.rooms.get(room) ?? []);
      socket.join(room);
      s.voiceGroups.add(groupId);
      socket.to(room).emit("user-joined-voice", socket.id);
      // Quien entra tarde también debe conocer a los que ya estaban.
      for (const peerId of existing) {
        if (peerId !== socket.id) socket.emit("user-joined-voice", peerId);
      }
    });

    socket.on("leave-voice", (rawGroupId: unknown) => {
      const groupId = validGroupId(rawGroupId);
      if (!groupId) return;
      s.voiceGroups.delete(groupId);
      socket.leave(`${groupId}-voice`);
      socket.to(`${groupId}-voice`).emit("user-left-voice", socket.id);
    });

    /** Solo se señaliza a sockets que comparten una sala de voz con el emisor. */
    function sharesVoiceWith(targetId: unknown): string | null {
      if (typeof targetId !== "string" || targetId.length === 0) return null;
      const target = io.sockets.sockets.get(targetId);
      if (!target) return null;
      const ts = target.data as SocketState;
      for (const g of s.voiceGroups) {
        if (ts.voiceGroups?.has(g)) return targetId;
      }
      return null;
    }

    socket.on("webrtc-signal", (data: { target?: unknown; signal?: unknown } | null) => {
      if (!data?.signal) return;
      const target = sharesVoiceWith(data.target);
      if (!target) return;
      io.to(target).emit("webrtc-signal", { caller: socket.id, signal: data.signal });
    });

    // Un participante (no iniciador) pide al otro que rehaga el enlace de voz entre ambos.
    socket.on("voice-peer-reset", (data: { target?: unknown } | null) => {
      const target = sharesVoiceWith(data?.target);
      if (!target) return;
      io.to(target).emit("voice-peer-reset", { caller: socket.id });
    });

    // Antes de perder las salas: avisar a las salas de voz para que nadie se quede con un enlace fantasma.
    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.endsWith("-voice")) socket.to(room).emit("user-left-voice", socket.id);
      }
    });

    socket.on("disconnect", () => {
      const groupId = s.groupId;
      const uid = s.uid;
      if (groupId && uid) {
        const disconnectKey = `${groupId}:${uid}`;
        const existingTimer = pendingDisconnectTimers.get(disconnectKey);
        if (existingTimer) clearTimeout(existingTimer);
        const timer = setTimeout(() => {
          pendingDisconnectTimers.delete(disconnectKey);
          console.log(`User ${uid} timed out after disconnect in group: ${groupId}`);
          socket.to(groupId).emit("user-left", { uid, reason: "disconnect-timeout" });
        }, DISCONNECT_GRACE_MS);
        pendingDisconnectTimers.set(disconnectKey, timer);
      }
      console.log("User disconnected:", socket.id);
    });
  });
}

const DISCONNECT_GRACE_MS = 20000;
const pendingDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
