import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const pendingDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DISCONNECT_GRACE_MS = 20000;
  const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map((o) => o.trim());
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Socket.io logic for real-time location and ranking sharing
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-group", (data: { groupId: string, uid: string }) => {
      if (!data?.groupId || !data?.uid) return;
      const disconnectKey = `${data.groupId}:${data.uid}`;
      const pendingTimer = pendingDisconnectTimers.get(disconnectKey);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingDisconnectTimers.delete(disconnectKey);
      }
      socket.join(data.groupId);
      (socket as any).groupId = data.groupId;
      (socket as any).uid = data.uid;
      console.log(`User ${socket.id} (uid: ${data.uid}) joined group: ${data.groupId}`);
      // Pide a los demás que reenvíen posición: el host ve al recién unido aunque llevara el mapa abierto sin refrescar.
      socket.to(data.groupId).emit("location-sync-request", { joinedUid: data.uid });
    });

    socket.on("leave-group", (data: { groupId: string, uid: string, isHost?: boolean, timestamp?: number }) => {
      if (!data?.groupId || !data?.uid) return;
      const disconnectKey = `${data.groupId}:${data.uid}`;
      const pendingTimer = pendingDisconnectTimers.get(disconnectKey);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingDisconnectTimers.delete(disconnectKey);
      }
      socket.leave(data.groupId);
      socket.to(data.groupId).emit("user-left", { uid: data.uid, reason: "explicit-leave" });
      if (data.isHost) {
        socket.to(data.groupId).emit("host-left-route", {
          uid: data.uid,
          timestamp: data.timestamp || Date.now()
        });
      }
      console.log(`User ${socket.id} (uid: ${data.uid}) explicitly left group: ${data.groupId}`);
    });

    socket.on("update-location", (data) => {
      if (!data?.groupId || !data?.uid || typeof data.lat !== "number" || typeof data.lng !== "number") return;
      // Broadcast location and score to everyone else in the group
      // data: { groupId, uid, lat, lng, speed, heading, score, photoURL, displayName, alert }
      socket.to(data.groupId).emit("location-updated", data);
    });

    socket.on("trigger-alert", (data) => {
      if (!data?.groupId || !data?.uid || !data?.type) return;
      // data: { groupId, uid, displayName, type }
      socket.to(data.groupId).emit("alert-triggered", data);
    });

    // WebRTC Signaling
    socket.on("join-voice", (groupId) => {
      if (!groupId) return;
      const room = `${groupId}-voice`;
      const existing = Array.from(io.sockets.adapter.rooms.get(room) ?? []);
      socket.join(room);
      socket.to(room).emit("user-joined-voice", socket.id);
      // Quien entra tarde también debe conocer a los que ya estaban (antes solo el primero veía a los demás).
      for (const peerId of existing) {
        if (peerId !== socket.id) {
          socket.emit("user-joined-voice", peerId);
        }
      }
    });

    socket.on("leave-voice", (groupId) => {
      if (!groupId) return;
      socket.leave(`${groupId}-voice`);
      socket.to(`${groupId}-voice`).emit("user-left-voice", socket.id);
    });

    socket.on("webrtc-signal", (data) => {
      if (!data?.target || !data?.signal) return;
      // data: { target: string, caller: string, signal: any }
      io.to(data.target).emit("webrtc-signal", {
        caller: socket.id,
        signal: data.signal
      });
    });

    socket.on("disconnect", () => {
      const groupId = (socket as any).groupId;
      const uid = (socket as any).uid; // Assuming I can store uid too
      if (groupId && uid) {
        const disconnectKey = `${groupId}:${uid}`;
        const existingTimer = pendingDisconnectTimers.get(disconnectKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const shouldServeStatic = process.env.SERVE_STATIC === "true";
    const hasDist = fs.existsSync(path.join(distPath, "index.html"));

    if (shouldServeStatic && hasDist) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      // Backend-only mode (recommended on Render when frontend is on Netlify)
      app.get('/health', (_req, res) => {
        res.status(200).json({ ok: true, service: "socket-backend" });
      });
      app.get('/', (_req, res) => {
        res.status(200).send('MotoRide socket backend is running.');
      });
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
