/**
 * Distancia mostrada en el HUD de navegación (redondeo legible, locale es-ES).
 */
export function formatNavDistanceMeters(meters: number): string {
  const m = Math.max(0, meters);
  if (!Number.isFinite(m)) return '—';
  if (m >= 1000) {
    const km = m / 1000;
    return `${km.toLocaleString('es-ES', {
      minimumFractionDigits: km >= 10 ? 0 : 1,
      maximumFractionDigits: 1,
    })} km`;
  }
  const rounded =
    m >= 200 ? Math.round(m / 10) * 10 : m >= 30 ? Math.round(m / 5) * 5 : Math.round(m);
  return `${rounded} m`;
}

/** Hora de llegada en formato 24 h de España (HH:mm, zona Europe/Madrid, sin depender del dispositivo). */
export function formatNavEtaClock(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid',
  }).format(new Date(epochMs));
}

/** Duración restante: «45 min» o «2 h 05 min». */
export function formatNavDurationS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
