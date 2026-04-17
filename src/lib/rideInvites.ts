/**
 * Invitaciones a ruta: colección raíz `rideInvites/{docId}`.
 * docId = `${fromUid}_${toUid}_${groupId}` (uids de Firebase no contienen `_`).
 * Así el invitador escribe solo documentos que controla por reglas (fromUid == auth).
 */

export type RideInviteKind = 'live_ride' | 'scheduled_ride';

export type RideInviteStatus = 'pending' | 'accepted' | 'rejected' | 'dismissed';

export type RideInviteDocData = {
  fromUid: string;
  toUid: string;
  groupId: string;
  groupName: string;
  sentAt: number;
  kind: RideInviteKind;
  status: RideInviteStatus;
};

export function buildRideInviteDocId(fromUid: string, toUid: string, groupIdUpper: string): string {
  const f = String(fromUid || '').trim();
  const t = String(toUid || '').trim();
  const g = String(groupIdUpper || '').trim().toUpperCase();
  return `${f}_${t}_${g}`;
}

export function buildInviteRejectionDocId(fromUid: string, groupIdUpper: string): string {
  const f = String(fromUid || '').trim();
  const g = String(groupIdUpper || '').trim().toUpperCase();
  return `${f}_${g}`;
}
