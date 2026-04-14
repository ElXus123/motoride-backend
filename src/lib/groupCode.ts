/** Código de grupo de exactamente 6 caracteres alfanuméricos (mayúsculas). Alineado con reglas Firestore. */
export function generateGroupCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const out: string[] = [];
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(6);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < 6; i++) {
      out.push(chars[buf[i]! % chars.length]);
    }
    return out.join('');
  }
  for (let i = 0; i < 6; i++) {
    out.push(chars[Math.floor(Math.random() * chars.length)]!);
  }
  return out.join('');
}
