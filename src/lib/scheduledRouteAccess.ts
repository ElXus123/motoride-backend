/** Ventana para entrar al mapa, participantes y chat de voz (ms antes de `scheduledTimestamp`). */
export const SCHEDULED_ROUTE_EARLY_JOIN_MS = 60 * 60 * 1000;

/**
 * Desde 1 h antes de la hora programada se puede abrir la sesión en vivo (mapa / voz).
 * Antes solo aplica apuntarse y vista previa de la ruta.
 */
export function canEnterScheduledRouteSession(scheduledTimestamp: number | undefined | null): boolean {
  const t = Number(scheduledTimestamp);
  if (!Number.isFinite(t) || t <= 0) return false;
  return Date.now() >= t - SCHEDULED_ROUTE_EARLY_JOIN_MS;
}
