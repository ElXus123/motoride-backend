/** Información del cliente para soporte y depuración (correo, logs). */

/** Correo público de contacto / soporte (mailto en la app). */
export const SUPPORT_EMAIL = 'motorideapp1@gmail.com';

export type ClientPlatform = 'iOS' | 'Android' | 'Other';

export function getClientPlatform(): ClientPlatform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  return 'Other';
}

/** Etiqueta legible del navegador (no sustituye al User-Agent completo). */
export function getBrowserLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/CriOS/i.test(ua)) return 'Chrome (iOS)';
  if (/FxiOS/i.test(ua)) return 'Firefox (iOS)';
  if (/EdgiOS/i.test(ua)) return 'Edge (iOS)';
  if (/iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium/i.test(ua)) {
    return 'Safari (iOS)';
  }
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Edg\//i.test(ua) || /EdgA/i.test(ua)) return 'Edge';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome|Chromium/i.test(ua)) return 'Safari';
  return 'Otro / desconocido';
}

export function buildSupportMailBody(userNote: string): string {
  const note = userNote.trim();
  const main =
    note ||
    [
      'Hola,',
      '',
      'Escribe aquí tu mensaje (duda, fallo que ves o sugerencia).',
      '',
      'Gracias.',
    ].join('\n');
  const href = typeof window !== 'undefined' ? window.location.href : '';
  const optional = [
    '',
    '—',
    'Datos opcionales para el equipo:',
    `${getClientPlatform()} · ${getBrowserLabel()}`,
    typeof screen !== 'undefined' ? `Pantalla: ${screen.width}×${screen.height}` : '',
    href ? `Enlace: ${href}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
  return `${main}\n${optional}`;
}

export function getSupportMailtoHref(): string {
  const subject = encodeURIComponent('Consulta MotoRide');
  const body = encodeURIComponent(buildSupportMailBody(''));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * Copia texto con Clipboard API y fallback (iOS / HTTP / permisos).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // continuar a fallback
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
