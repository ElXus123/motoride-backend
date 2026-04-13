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
      socket.join(data.groupId);
      (socket as any).groupId = data.groupId;
      (socket as any).uid = data.uid;
      console.log(`User ${socket.id} (uid: ${data.uid}) joined group: ${data.groupId}`);
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
      socket.join(`${groupId}-voice`);
      // Notify others in the voice room that a new user joined
      socket.to(`${groupId}-voice`).emit("user-joined-voice", socket.id);
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
      if (groupId) {
        console.log(`User ${socket.id} (uid: ${uid}) left group: ${groupId}`);
        socket.to(groupId).emit("user-left", { uid });
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
        res.status(200).send('MotoBikeSocial socket backend is running.');
      });
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
