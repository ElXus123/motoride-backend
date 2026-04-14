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
