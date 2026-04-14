/**
 * Visibilidad de rutas planificadas en la sección "Explorar rutas planificadas".
 * El código/enlace de unión sigue funcionando salvo que restrinjas en reglas de servidor (aquí solo filtrado en cliente).
 */

export type RouteListing = 'public' | 'friends_only' | 'unlisted';

export const ROUTE_LISTING_DEFAULT: RouteListing = 'public';

export const ROUTE_LISTING_LABELS: Record<RouteListing, { title: string; description: string }> = {
  public: {
    title: 'Pública',
    description: 'Cualquiera puede verla al buscar por provincia o municipio.',
  },
  friends_only: {
    title: 'Solo amigos',
    description: 'Solo tus amigos en MotoRide la verán en el explorador (tú siempre la ves).',
  },
  unlisted: {
    title: 'Privada',
    description: 'No aparece en el explorador; comparte el código o el enlace para apuntarse.',
  },
};

export function normalizeFriendIds(friends: unknown): string[] {
  if (!Array.isArray(friends)) return [];
  return friends.map((x) => String(x).trim()).filter(Boolean);
}

/** Si la ruta debe mostrarse en la lista de exploración para este usuario. */
export function canShowRouteInExplore(
  route: { createdBy?: string; routeListing?: string },
  viewerUid: string | undefined,
  friendUids: string[]
): boolean {
  if (!viewerUid) return false;
  const listing = (route.routeListing as RouteListing) || ROUTE_LISTING_DEFAULT;
  if (listing === 'unlisted') return false;
  if (listing === 'friends_only') {
    const creator = route.createdBy || '';
    return creator === viewerUid || friendUids.includes(creator);
  }
  return true;
}

/**
 * Puede enviar invitaciones a la bandeja (misma lógica que “tuya” o “pública en explorar”):
 * organizador siempre; otros usuarios solo si la ruta es pública en el explorador.
 */
export function canInviteToScheduledRoute(
  route: {
    createdBy?: string;
    routeListing?: string;
    isScheduled?: boolean;
    scheduledTimestamp?: number;
    code?: string;
  },
  viewerUid: string | undefined
): boolean {
  if (!viewerUid || !route?.code) return false;
  if (route.isScheduled !== true) return false;
  /** El organizador puede invitar aunque la hora ya haya pasado (sigue en Mis próximas / bandeja). */
  if (route.createdBy === viewerUid) return true;
  if ((route.scheduledTimestamp || 0) <= Date.now()) return false;
  const listing = (route.routeListing as RouteListing) || ROUTE_LISTING_DEFAULT;
  if (listing === 'public') return true;
  return false;
}
