import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerRealtime, SOCKET_MAX_HTTP_BUFFER } from "./server-realtime";
import { FixedWindowLimiter, resolveAllowedOrigins } from "./server-security";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Firebase Admin con la cuenta de servicio en FIREBASE_SERVICE_ACCOUNT_JSON (texto JSON).
 * Si falta o no es válida, el servidor arranca pero rechaza TODO (fallo seguro).
 * Nunca se registra el contenido de la variable ni mensajes de error que puedan contenerlo.
 */
function initFirebaseAdmin(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.error(
      "[SEGURIDAD] FIREBASE_SERVICE_ACCOUNT_JSON no está definida. Se RECHAZARÁN todas las conexiones de socket y /ice-servers hasta configurarla."
    );
    return false;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("[seguridad] Firebase Admin inicializado.");
    return true;
  } catch {
    console.error(
      "[SEGURIDAD] FIREBASE_SERVICE_ACCOUNT_JSON no es una cuenta de servicio válida. Se RECHAZARÁN todas las conexiones."
    );
    return false;
  }
}

const firebaseReady = initFirebaseAdmin();

async function verifyToken(token: string): Promise<{ uid: string }> {
  if (!firebaseReady) throw new Error("auth-unavailable");
  const decoded = await admin.auth().verifyIdToken(token);
  return { uid: decoded.uid };
}

async function isGroupMember(uid: string, groupId: string): Promise<boolean> {
  if (!firebaseReady) return false;
  const snap = await admin.firestore().collection("groups").doc(groupId).get();
  const members = snap.data()?.members;
  return Array.isArray(members) && members.includes(uid);
}

async function startServer() {
  const app = express();
  // Render (y cualquier proxy) añade X-Forwarded-For: así el límite por IP usa la IP real del cliente.
  app.set("trust proxy", 1);
  const httpServer = createServer(app);
  const allowedOrigins = resolveAllowedOrigins(process.env.CORS_ORIGIN, process.env.NODE_ENV);
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER,
  });

  registerRealtime(io, { verifyToken, isMember: isGroupMember });

  const PORT = Number(process.env.PORT) || 3000;

  function applyCors(req: express.Request, res: express.Response): void {
    const origin = req.headers.origin;
    if (allowedOrigins.includes("*")) {
      res.set("Access-Control-Allow-Origin", "*");
    } else if (origin && allowedOrigins.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
  }

  /** Preflight para la cabecera Authorization de /ice-servers. */
  app.options("/ice-servers", (req, res) => {
    applyCors(req, res);
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.set("Access-Control-Max-Age", "600");
    res.sendStatus(204);
  });

  /**
   * Credenciales TURN temporales para la voz (WebRTC con datos móviles necesita TURN).
   * Opción A (recomendada, gratis hasta 1 TB/mes): Cloudflare Realtime TURN →
   *   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_KEY_API_TOKEN
   * Opción B: ICE_SERVERS_JSON con un array RTCIceServer fijo (p. ej. Metered, coturn propio).
   * Requiere ID token de Firebase en `Authorization: Bearer <token>` y límite de 30 peticiones/min por IP.
   */
  const iceLimiter = new FixedWindowLimiter(30, 60 * 1000);
  let turnCache: { at: number; body: unknown } | null = null;
  app.get("/ice-servers", async (req, res) => {
    applyCors(req, res);
    res.set("Cache-Control", "no-store");

    if (!iceLimiter.hit(req.ip || "unknown")) {
      res.set("Retry-After", "60");
      res.status(429).json({ error: "rate-limited" });
      return;
    }
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
    if (!match) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      await verifyToken(match[1]);
    } catch {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      if (turnCache && Date.now() - turnCache.at < 30 * 60 * 1000) {
        res.json(turnCache.body);
        return;
      }
      const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
      const token = process.env.CLOUDFLARE_TURN_KEY_API_TOKEN;
      if (keyId && token) {
        const r = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 4 * 60 * 60 }),
          }
        );
        if (r.ok) {
          const body = await r.json();
          turnCache = { at: Date.now(), body };
          res.json(body);
          return;
        }
        console.warn("Cloudflare TURN respondió", r.status);
      }
      if (process.env.ICE_SERVERS_JSON) {
        res.json({ iceServers: JSON.parse(process.env.ICE_SERVERS_JSON) });
        return;
      }
      res.json({ iceServers: [] });
    } catch (e) {
      console.warn("ice-servers error", e);
      res.json({ iceServers: [] });
    }
  });

  // Ping ligero para despertar el servicio (Render free se duerme sin tráfico) y comprobarlo.
  app.get("/health", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "no-store");
    res.status(200).json({ ok: true, service: "socket-backend", uptime: Math.round(process.uptime()) });
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
      app.get('/', (_req, res) => {
        res.status(200).send('MotoRide socket backend is running.');
      });
    }
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[seguridad] CORS: ${allowedOrigins.join(", ")}`);
  });
}

startServer();
