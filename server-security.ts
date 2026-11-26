/**
 * Utilidades de seguridad del servidor (sin dependencias de Firebase ni de red):
 * validación de payloads, saneado de texto/URL y límites de frecuencia.
 */

const GROUP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_LAT_LNG_ABS = { lat: 90, lng: 180 };
const MAX_SPEED_MS = 150; // ~540 km/h: por encima se considera dato corrupto
const MAX_ALERT_JSON = 2048;

export function validGroupId(v: unknown): string | null {
  return typeof v === "string" && GROUP_ID_RE.test(v) ? v : null;
}

export function finiteInRange(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** Texto limitado a `max` caracteres (code points), sin caracteres de control. */
export function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const clean = v.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return Array.from(clean).slice(0, max).join("");
}

/** Solo https y dominios de Google (fotos de perfil de Google). Cualquier otra cosa -> "". */
export function sanitizePhotoUrl(v: unknown): string {
  if (typeof v !== "string" || v.length === 0 || v.length > 2048) return "";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "";
  }
  if (u.protocol !== "https:" || u.username || u.password) return "";
  const host = u.hostname.toLowerCase();
  const isGoogle = host === "googleusercontent.com" || host.endsWith(".googleusercontent.com");
  return isGoogle ? u.toString() : "";
}

function sanitizeAlert(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return sanitizeText(v, 200) || null;
  if (typeof v !== "object") return null;
  try {
    const json = JSON.stringify(v);
    if (json.length > MAX_ALERT_JSON) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeHeading(v: unknown): number {
  const h = finiteInRange(v, -720, 720);
  if (h === null) return 0;
  return ((h % 360) + 360) % 360;
}

export interface LocationPayload {
  groupId: string;
  uid: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  score: number;
  level: number;
  timestamp: number;
  photoURL: string;
  displayName: string;
  alert: unknown;
  profileFrameId: string;
}

/**
 * Construye el payload que se reenvía a la sala. El uid SIEMPRE viene del token verificado
 * (uidVerificado), nunca del cliente. Devuelve null si el paquete no es válido.
 */
export function sanitizeLocationPayload(raw: unknown, uidVerificado: string): LocationPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const groupId = validGroupId(d.groupId);
  const lat = finiteInRange(d.lat, -MAX_LAT_LNG_ABS.lat, MAX_LAT_LNG_ABS.lat);
  const lng = finiteInRange(d.lng, -MAX_LAT_LNG_ABS.lng, MAX_LAT_LNG_ABS.lng);
  if (!groupId || lat === null || lng === null) return null;
  return {
    groupId,
    uid: uidVerificado,
    lat,
    lng,
    speed: finiteInRange(d.speed, 0, MAX_SPEED_MS) ?? 0,
    heading: normalizeHeading(d.heading),
    score: Math.floor(finiteInRange(d.score, 0, 1e9) ?? 0),
    level: Math.floor(finiteInRange(d.level, 1, 1000) ?? 1),
    timestamp: finiteInRange(d.timestamp, 0, Number.MAX_SAFE_INTEGER) ?? Date.now(),
    photoURL: sanitizePhotoUrl(d.photoURL),
    displayName: sanitizeText(d.displayName, 60) || "Motero",
    alert: sanitizeAlert(d.alert),
    profileFrameId: sanitizeText(d.profileFrameId, 40) || "none",
  };
}

/** Limitador de tokens: `capacity` eventos de ráfaga y `perSecond` de recarga. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly capacity: number, private readonly perSecond: number, now = Date.now()) {
    this.tokens = capacity;
    this.last = now;
  }
  take(now = Date.now()): boolean {
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.perSecond);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

/** Ventana fija por clave (p. ej. IP): máximo `max` hits por `windowMs`. */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  hit(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    cur.count += 1;
    return cur.count <= this.max;
  }
}

/** Origen permitido: CORS_ORIGIN (lista separada por comas) o, por defecto, la web y localhost en dev. */
export function resolveAllowedOrigins(envValue: string | undefined, nodeEnv: string | undefined): string[] {
  const fromEnv = (envValue ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const defaults = ["https://motobike.juarp123.workers.dev"];
  if (nodeEnv !== "production") {
    defaults.push("http://localhost:3000", "http://localhost:5173", "http://localhost:4173");
  }
  return defaults;
}
