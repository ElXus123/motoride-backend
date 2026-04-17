/**
 * Locución para alertas enviadas por usuarios en el grupo (socket).
 * No usar para reconexión de voz ni mensajes del sistema (showMessage).
 */

const SPEAKABLE_ALERT_TYPES = new Set([
  'Caída',
  'Parado',
  'Averiado',
  'Repostar',
  'Repostando',
  'Peligro',
  'Accidente',
  'Policía',
]);

function phraseForAlert(type: string, displayName: string): string {
  const name = displayName.trim() || 'Un compañero';
  switch (type) {
    case 'Caída':
      return `Atención. ${name} podría haberse caído.`;
    case 'Parado':
      return `Alerta de grupo. ${name} indica parado o margen.`;
    case 'Averiado':
      return `Alerta de grupo. ${name} indica avería.`;
    case 'Repostar':
    case 'Repostando':
      return `Alerta de grupo. ${name} indica parada para repostar.`;
    case 'Peligro':
      return `Alerta de grupo. ${name} avisa de peligro en la vía.`;
    case 'Accidente':
      return `Alerta de grupo. ${name} avisa de accidente.`;
    case 'Policía':
      return `Alerta de grupo. ${name} avisa de control o policía.`;
    default:
      return '';
  }
}

export function shouldSpeakMotorideGroupAlert(type: string): boolean {
  return SPEAKABLE_ALERT_TYPES.has(type);
}

export function speakMotorideGroupAlert(type: string, displayName: string): void {
  if (!shouldSpeakMotorideGroupAlert(type)) return;
  if (typeof globalThis.window === 'undefined' || !('speechSynthesis' in globalThis.window)) return;
  const text = phraseForAlert(type, displayName);
  if (!text) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = 1;
    u.pitch = 1;
    globalThis.window.speechSynthesis.cancel();
    globalThis.window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
