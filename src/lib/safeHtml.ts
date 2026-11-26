/**
 * Utilidades para meter datos de usuario en HTML (p. ej. `L.divIcon({ html })`).
 * Cualquier texto o URL que venga de Firestore debe pasar por aquí antes de concatenarse.
 */

/** Escapa texto para contenido y atributos HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RASTER_DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/**
 * Devuelve una URL segura para `<img src>` o `null`.
 * Acepta solo `https://` válida (comprobada con `new URL`) o una imagen raster en data URI
 * (la foto subida desde el perfil se guarda así). Rechaza `javascript:`, `http:` y cualquier otro esquema.
 */
export function safeProfileImageSrc(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (RASTER_DATA_IMAGE.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
