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
      return `Alerta de grupo. El usuario ${name} ha parado.`;
    case 'Averiado':
      return `Alerta de grupo. El usuario ${name} ha tenido una avería.`;
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

/** Riesgo de precipitación (banner tiempo / Open-Meteo), no es alerta de compañero por socket. */
export function speakMotoridePrecipitationRisk(): void {
  if (typeof globalThis.window === 'undefined' || !('speechSynthesis' in globalThis.window)) return;
  const text =
    'Alerta de tiempo. Posible precipitación cerca de tu posición o a lo largo de la ruta. Conduce con precaución.';
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

/** Radar fijo (Overpass) a ≤500 m; avisar al entrar en el umbral. */
export function speakMotorideRadarNearby(distanceM: number): void {
  if (typeof globalThis.window === 'undefined' || !('speechSynthesis' in globalThis.window)) return;
  const d = Number.isFinite(distanceM) ? Math.max(0, Math.round(distanceM)) : 0;
  const text = `Atención. Tienes un radar aproximadamente a ${d} metros.`;
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
