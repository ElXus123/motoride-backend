/** Textos compartidos para tarjetas de historial (perfil y amigos). */

export function formatRideCardTitle(groupName: string | undefined, endTime: number | undefined): string {
  const name = (groupName || 'Ruta').trim() || 'Ruta';
  const d =
    endTime != null && Number.isFinite(endTime) ? new Date(endTime) : new Date();
  const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });
  return `${name} ${dateStr}`;
}

export function formatRideCardSubtitle(endTime: number | undefined): string {
  const d =
    endTime != null && Number.isFinite(endTime) ? new Date(endTime) : new Date();
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' })} • ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

export function rideHistoryPointsEarned(ride: { score?: unknown; pointsEarned?: unknown }): number {
  const n = Number(ride.score ?? ride.pointsEarned ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
