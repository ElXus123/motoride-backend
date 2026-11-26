/**
 * Iconos de maniobra OSRM: trazo vectorial limpio con grosor único (SW) en todas
 * las maniobras, para que se lean igual a 32 px (compacto) y 40 px (normal).
 * Las puntas se dibujan centradas en el extremo del trazo y sobresalen 9 u.
 * Rotondas: anillo con flecha de sentido + número de salida centrado.
 */

import type { ReactNode } from 'react';

type Props = {
  maneuverType?: string;
  maneuverModifier?: string;
  /** OSRM `maneuver.exit` (1-based), solo rotondas. */
  roundaboutExit?: number | null;
  size?: number;
  className?: string;
};

const VB = '0 0 64 64';

/** Grosor único de trazo (viewBox 64). A 32 px ≈ 3.5 px; a 40 px ≈ 4.4 px. */
const SW = 7;

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: SW,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Punta triangular centrada en el extremo del trazo (sobresale hacia delante). */
const HEAD_D = 'M 0 -9 L 8 6 L -8 6 Z';

/** Punta en (x,y); rotDeg 0 = apunta hacia arriba, positivo = sentido horario. */
function ArrowHead({ x, y, rotDeg }: { x: number; y: number; rotDeg: number }) {
  return <path fill="currentColor" transform={`translate(${x} ${y}) rotate(${rotDeg})`} d={HEAD_D} />;
}

/** Espejo horizontal (derecha a partir de la izquierda). */
function Mirror({ children }: { children: ReactNode }) {
  return <g transform="translate(64 0) scale(-1 1)">{children}</g>;
}

/** Giro ~90° a la izquierda. */
function LeftTurn90() {
  return (
    <>
      <path {...STROKE} d="M 38 54 V 30 Q 38 17 26 17 H 16" />
      <ArrowHead x={16} y={17} rotDeg={-90} />
    </>
  );
}

function StraightArrow() {
  return (
    <>
      <path {...STROKE} d="M 32 54 V 18" />
      <ArrowHead x={32} y={16} rotDeg={0} />
    </>
  );
}

/** Leve a la izquierda: tramo recto y diagonal suave (~30°). */
function SlightLeft() {
  return (
    <>
      <path {...STROKE} d="M 36 54 V 34 L 24 12" />
      <ArrowHead x={24} y={12} rotDeg={-30} />
    </>
  );
}

/** Cerrado a la izquierda: horquilla que vuelve hacia abajo-izquierda. */
function SharpLeft() {
  return (
    <>
      <path {...STROKE} d="M 42 54 V 26 L 18 44" />
      <ArrowHead x={18} y={44} rotDeg={-130} />
    </>
  );
}

/** Cambio de sentido: sube, gira por arriba y baja. */
function UTurn() {
  return (
    <>
      <path {...STROKE} d="M 44 54 V 30 Q 44 12 26 12 Q 14 12 14 24" />
      <ArrowHead x={14} y={24} rotDeg={180} />
    </>
  );
}

/**
 * Rotonda: anillo grueso, flecha de sentido sobre el anillo (abajo-izquierda,
 * sentido horario) y número de salida centrado.
 */
function RoundaboutIcon({ exit }: { exit: number | null }) {
  const label = exit != null && exit > 0 && exit <= 99 ? String(exit) : '?';
  const fs = label.length > 1 ? 20 : 26;
  return (
    <>
      <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" strokeWidth={SW} />
      <ArrowHead x={17.86} y={46.14} rotDeg={-45} />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontSize={fs}
        fontWeight="800"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </>
  );
}

/** Salir de rotonda: arco de circulación que sale hacia la derecha. */
function ExitRoundaboutIcon() {
  return (
    <>
      <path {...STROKE} d="M 32 50 A 16 16 0 0 1 32 18" />
      <path {...STROKE} d="M 32 18 Q 32 10 46 10" />
      <ArrowHead x={46} y={10} rotDeg={90} />
    </>
  );
}

/** Rampa de autovía/autopista (salida o entrada), espejada si es por la izquierda. */
function HighwayRamp({ side }: { side: 'left' | 'right' }) {
  const ramp = (
    <>
      <path {...STROKE} d="M 22 54 V 16" />
      <path {...STROKE} d="M 32 54 V 36 L 50 18" />
      <ArrowHead x={50} y={18} rotDeg={45} />
    </>
  );
  if (side === 'right') return <>{ramp}</>;
  return <Mirror>{ramp}</Mirror>;
}

/** Bifurcación: tronco y dos ramas con punta en cada salida. */
function ForkIcon() {
  return (
    <>
      <path {...STROKE} d="M 32 54 V 26" />
      <path {...STROKE} d="M 32 26 L 19 12" />
      <path {...STROKE} d="M 32 26 L 45 12" />
      <ArrowHead x={19} y={12} rotDeg={-56} />
      <ArrowHead x={45} y={12} rotDeg={56} />
    </>
  );
}

/** Incorporación: carril recto que absorbe el carril de la derecha. */
function MergeIcon() {
  return (
    <>
      <path {...STROKE} d="M 22 54 V 14" />
      <ArrowHead x={22} y={14} rotDeg={0} />
      <path {...STROKE} d="M 44 54 V 38 L 28 24" />
    </>
  );
}

function ArrivePin({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
      />
    </svg>
  );
}

function modifierBucket(
  m: string
): 'left' | 'slight_left' | 'sharp_left' | 'right' | 'slight_right' | 'sharp_right' | 'straight' | 'uturn' | 'none' {
  if (m.includes('uturn') || m.includes('u-turn')) return 'uturn';
  if (m.includes('sharp') && m.includes('left')) return 'sharp_left';
  if (m.includes('sharp') && m.includes('right')) return 'sharp_right';
  if (m.includes('slight') && m.includes('left')) return 'slight_left';
  if (m.includes('slight') && m.includes('right')) return 'slight_right';
  if (m.includes('left')) return 'left';
  if (m.includes('right')) return 'right';
  if (m.includes('straight')) return 'straight';
  return 'none';
}

export function ManeuverTurnIcon({
  maneuverType,
  maneuverModifier,
  roundaboutExit,
  size = 28,
  className,
}: Props) {
  const t = (maneuverType || '').toLowerCase().trim();
  const modRaw = (maneuverModifier || '').toLowerCase().trim();
  const bucket = modifierBucket(modRaw);

  const wrap = (children: ReactNode) => (
    <svg
      width={size}
      height={size}
      viewBox={VB}
      className={`shrink-0 overflow-visible ${className || ''}`}
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      {children}
    </svg>
  );

  if (t === 'arrive') {
    return <ArrivePin size={size} className={className} />;
  }

  if (t === 'roundabout' || t === 'rotary' || t === 'roundabout turn') {
    const ex =
      typeof roundaboutExit === 'number' && roundaboutExit > 0 ? Math.min(99, Math.round(roundaboutExit)) : null;
    return wrap(<RoundaboutIcon exit={ex} />);
  }

  if (t === 'exit roundabout' || t === 'exit rotary') {
    return wrap(<ExitRoundaboutIcon />);
  }

  if (t === 'off ramp' || t === 'on ramp') {
    return wrap(<HighwayRamp side={modRaw.includes('left') ? 'left' : 'right'} />);
  }

  if (t === 'fork' || (t === 'notification' && modRaw.includes('fork'))) {
    return wrap(<ForkIcon />);
  }

  if (t === 'merge' || t.includes('merge')) {
    return wrap(<MergeIcon />);
  }

  if (t === 'end of road') {
    if (bucket === 'left' || bucket === 'slight_left' || bucket === 'sharp_left') return wrap(<LeftTurn90 />);
    if (bucket === 'right' || bucket === 'slight_right' || bucket === 'sharp_right') return wrap(<Mirror><LeftTurn90 /></Mirror>);
    return wrap(<StraightArrow />);
  }

  if (t === 'continue' || t === 'new name' || t === 'notification') {
    return wrap(<StraightArrow />);
  }

  if (t === 'u-turn' || t === 'uturn') {
    return wrap(<UTurn />);
  }

  if (t === 'turn' || t === 'depart' || !t) {
    switch (bucket) {
      case 'uturn':
        return wrap(<UTurn />);
      case 'sharp_left':
        return wrap(<SharpLeft />);
      case 'sharp_right':
        return wrap(<Mirror><SharpLeft /></Mirror>);
      case 'slight_left':
        return wrap(<SlightLeft />);
      case 'slight_right':
        return wrap(<Mirror><SlightLeft /></Mirror>);
      case 'left':
        return wrap(<LeftTurn90 />);
      case 'right':
        return wrap(<Mirror><LeftTurn90 /></Mirror>);
      case 'straight':
        return wrap(<StraightArrow />);
      default:
        return wrap(<StraightArrow />);
    }
  }

  return wrap(<StraightArrow />);
}

export function getDirectionIcon(
  type?: string,
  modifier?: string,
  size = 28,
  roundaboutExit?: number | null
) {
  return (
    <ManeuverTurnIcon
      maneuverType={type}
      maneuverModifier={modifier}
      size={size}
      roundaboutExit={roundaboutExit}
    />
  );
}
