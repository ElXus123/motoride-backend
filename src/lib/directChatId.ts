/**
 * Id estable para `privateChats/{id}` entre dos usuarios (orden léxico de uid).
 * Los uid de Firebase Auth no contienen `_`, así que la concatenación es inequívoca.
 */

export function tryDirectChatMembersOrdered(uidA: string, uidB: string): [string, string] | null {
  const a = String(uidA || '').trim();
  const b = String(uidB || '').trim();
  if (!a || !b || a === b) return null;
  return a < b ? [a, b] : [b, a];
}

export function tryDirectChatFirestoreId(uidA: string, uidB: string): string | null {
  const pair = tryDirectChatMembersOrdered(uidA, uidB);
  if (!pair) return null;
  return `${pair[0]}_${pair[1]}`;
}
