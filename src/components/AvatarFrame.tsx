import type { ReactNode } from 'react';
import { getFrameDefinition, NO_FRAME_ID, type FrameDefinition } from '../lib/frames';

/**
 * Marco decorativo alrededor del avatar. Convive con el anillo de nivel (`levelRing.ts`):
 * el anillo sigue siendo el borde del propio avatar y el marco se dibuja por fuera, en un
 * margen que se reserva con padding, así que no se duplican ni se pisan.
 *
 * `size` es el diámetro del avatar interior en px. Los tamaños pequeños usan un margen
 * más fino (el marco se reduce, no se quita).
 *
 * El SVG se genera desde `frameSvgMarkup` para que React (perfil, ranking, cabecera) y los
 * iconos de Leaflet (que son HTML plano) dibujen exactamente el mismo marco.
 */

const FRAME_PAD_RATIO_SMALL = 0.12;
const FRAME_PAD_RATIO_LARGE = 0.16;
const SMALL_SIZE_MAX = 48;

/** Margen (px) que el marco ocupa alrededor del avatar. 0 si no hay marco. */
export function getFramePad(size: number, frameId?: string | null): number {
  const frame = getFrameDefinition(frameId || NO_FRAME_ID);
  if (!frame || frame.id === NO_FRAME_ID) return 0;
  const ratio = size <= SMALL_SIZE_MAX ? FRAME_PAD_RATIO_SMALL : FRAME_PAD_RATIO_LARGE;
  return Math.round(size * ratio);
}

/** Lado total (px) del contenedor con marco. Igual a `size` sin marco. */
export function getFrameOuterSize(size: number, frameId?: string | null): number {
  return size + getFramePad(size, frameId) * 2;
}

/**
 * Contenido SVG del marco (viewBox 0 0 100 100). `gradId` debe ser un id HTML válido y único
 * por definición de gradiente; las definiciones de un mismo marco son idénticas, así que
 * repetir el id en varias instancias es inocuo.
 */
export function frameSvgMarkup(frame: FrameDefinition): string {
  const gradId = `frame-grad-${frame.id}`;
  const [light, dark] = frame.colors;
  const stroke = `url(#${gradId})`;
  const parts: string[] = [
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="${light}"/><stop offset="55%" stop-color="${dark}"/><stop offset="100%" stop-color="${light}"/>` +
      `</linearGradient></defs>`,
  ];

  switch (frame.pattern) {
    case 'halo':
      parts.push(`<circle cx="50" cy="50" r="48" fill="none" stroke="${stroke}" stroke-width="2.5"/>`);
      break;
    case 'dashed':
      parts.push(
        `<circle cx="50" cy="50" r="46" fill="none" stroke="${stroke}" stroke-width="5" stroke-dasharray="7 4"/>`
      );
      break;
    case 'knobs': {
      const lines = Array.from(
        { length: 24 },
        (_, i) => `<line x1="50" y1="2.5" x2="50" y2="7" transform="rotate(${i * 15} 50 50)"/>`
      ).join('');
      parts.push(`<g stroke="${stroke}" stroke-width="3.2" stroke-linecap="round">${lines}</g>`);
      break;
    }
    case 'laurel': {
      const leaves: string[] = [];
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const angle = side * (150 - i * 22);
          leaves.push(
            `<ellipse cx="50" cy="6" rx="2.6" ry="5" transform="rotate(${angle} 50 50)" opacity="${(0.95 - i * 0.08).toFixed(2)}"/>`
          );
        }
      }
      parts.push(`<g fill="${stroke}">${leaves.join('')}</g>`);
      break;
    }
    case 'crown': {
      const spikes = [-40, -20, 0, 20, 40]
        .map((a) => `<polygon points="50,0 53.2,6 46.8,6" transform="rotate(${a} 50 50)"/>`)
        .join('');
      parts.push(`<g fill="${stroke}">${spikes}</g>`);
      break;
    }
    default:
      break;
  }

  // Aro base metálico (todos menos halo, dashed y knobs, que ya tienen trazo propio).
  if (frame.pattern !== 'halo' && frame.pattern !== 'dashed' && frame.pattern !== 'knobs') {
    parts.push(`<circle cx="50" cy="50" r="46" fill="none" stroke="${stroke}" stroke-width="4.5"/>`);
  }
  return parts.join('');
}

/**
 * HTML de un SVG de marco para iconos de Leaflet (`L.divIcon`), colocado en un contenedor
 * `position: relative`. `centerPx` es el centro del avatar dentro de ese contenedor.
 * Cadena vacía si no hay marco.
 */
export function frameOverlayHtml(
  frameId: string | null | undefined,
  outerPx: number,
  centerPx: { x: number; y: number }
): string {
  const frame = getFrameDefinition(frameId || NO_FRAME_ID);
  if (!frame || frame.id === NO_FRAME_ID) return '';
  const left = centerPx.x - outerPx / 2;
  const top = centerPx.y - outerPx / 2;
  return (
    `<svg viewBox="0 0 100 100" width="${outerPx}" height="${outerPx}" aria-hidden="true" ` +
    `style="position:absolute;left:${left}px;top:${top}px;pointer-events:none;overflow:visible;">` +
    frameSvgMarkup(frame) +
    `</svg>`
  );
}

type AvatarFrameProps = {
  /** Id del marco ya validado (usar `getEquippedFrame` o `resolvePeerFrameId`). `none` o desconocido = sin marco. */
  frameId?: string | null;
  /** Diámetro del avatar interior en px. */
  size: number;
  children: ReactNode;
  className?: string;
};

export function AvatarFrame({ frameId, size, children, className = '' }: AvatarFrameProps) {
  const frame = getFrameDefinition(frameId || NO_FRAME_ID);
  const hasFrame = !!frame && frame.id !== NO_FRAME_ID;
  const pad = getFramePad(size, frameId);
  const outer = size + pad * 2;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: outer, height: outer }}
    >
      {children}
      {hasFrame && frame && <FrameArt frame={frame} outer={outer} />}
    </span>
  );
}

function FrameArt({ frame, outer }: { frame: FrameDefinition; outer: number }) {
  const glow = frame.tier === 'elite' || frame.tier === 'oro';
  return (
    <svg
      viewBox="0 0 100 100"
      width={outer}
      height={outer}
      aria-label={`Marco: ${frame.name}`}
      role="img"
      className="pointer-events-none absolute inset-0"
      style={glow ? { filter: `drop-shadow(0 0 4px ${frame.colors[0]}66)` } : undefined}
      dangerouslySetInnerHTML={{ __html: frameSvgMarkup(frame) }}
    />
  );
}
