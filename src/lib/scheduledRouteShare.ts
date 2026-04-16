/**
 * Fecha legible para invitaciones a rutas programadas (solo día/mes/año, es-ES).
 */
export function formatScheduledRideDayOnlyEs(timestampMs: number): string {
  try {
    const d = new Date(timestampMs);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export function buildScheduledInviteSharePayload(args: {
  routeName: string;
  scheduledTimestamp: number;
  url: string;
}): { title: string; text: string; clipboardText: string } {
  const name = args.routeName.trim() || 'la ruta';
  const day = formatScheduledRideDayOnlyEs(args.scheduledTimestamp);
  const text = day
    ? `Apúntate a la ruta «${name}» el ${day} desde este enlace:`
    : `Apúntate a la ruta «${name}» desde este enlace:`;
  return {
    title: `Ruta programada: ${name}`,
    text,
    clipboardText: `${text}\n${args.url}`,
  };
}
