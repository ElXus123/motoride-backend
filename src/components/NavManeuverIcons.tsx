/**
 * Iconos de maniobra para navegación OSRM: estilo plano, relleno / trazo grueso,
 * giro en L con esquina redondeada; variantes para rotonda y enlaces.
 */

import type { ReactNode } from 'react';

type Props = {
  maneuverType?: string;
  maneuverModifier?: string;
  size?: number;
  className?: string;
};

const VB = '0 0 64 64';

/** Giro 90° a la izquierda: trazo grueso en L + punta. */
function LeftTurn90Flat() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 44 56 V 30 Q 44 16 30 16 H 18"
      />
      <path fill="currentColor" d="M 18 8 L 6 18 L 18 24 V 16 H 28 Q 36 16 36 24 V 56 H 44 V 30 Q 44 10 26 10 H 18 V 8 Z" />
    </>
  );
}

function RightTurn90Flat() {
  return (
    <g transform="translate(64 0) scale(-1 1)">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 44 56 V 30 Q 44 16 30 16 H 18"
      />
      <path fill="currentColor" d="M 18 8 L 6 18 L 18 24 V 16 H 28 Q 36 16 36 24 V 56 H 44 V 30 Q 44 10 26 10 H 18 V 8 Z" />
    </g>
  );
}

function StraightArrow() {
  return <path fill="currentColor" d="M 32 6 L 18 26 H 26 V 56 H 38 V 26 H 46 Z" />;
}

function SlightLeft() {
  return (
    <g transform="translate(32 32) rotate(-36) translate(-32 -32)">
      <path fill="currentColor" d="M 32 8 L 18 52 H 28 L 32 34 L 36 52 H 46 Z" />
    </g>
  );
}

function SlightRight() {
  return (
    <g transform="translate(32 32) rotate(36) translate(-32 -32)">
      <path fill="currentColor" d="M 32 8 L 18 52 H 28 L 32 34 L 36 52 H 46 Z" />
    </g>
  );
}

function SharpLeft() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 48 56 V 32 Q 48 10 26 10 H 12"
      />
      <path fill="currentColor" d="M 12 4 L 4 14 L 12 18 V 10 H 24 Q 42 10 42 28 V 56 H 48 V 32 Q 48 6 22 6 H 12 V 4 Z" />
    </>
  );
}

function SharpRight() {
  return (
    <g transform="translate(64 0) scale(-1 1)">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 48 56 V 32 Q 48 10 26 10 H 12"
      />
      <path fill="currentColor" d="M 12 4 L 4 14 L 12 18 V 10 H 24 Q 42 10 42 28 V 56 H 48 V 32 Q 48 6 22 6 H 12 V 4 Z" />
    </g>
  );
}

function UTurn() {
  return (
    <path
      fill="currentColor"
      d="M 44 56 V 40 Q 44 12 22 12 Q 8 12 8 26 V 34 H 4 L 14 8 L 24 34 H 20 V 28 Q 20 18 28 18 H 36 Q 40 18 40 26 V 56 Z"
    />
  );
}

/** Entrar / seguir rotonda: círculo grueso incompleto + flecha tangencial. */
function RoundaboutIcon() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        d="M 48 24 A 20 20 0 1 1 24 48"
      />
      <path fill="currentColor" d="M 10 28 L 4 20 L 4 36 Z" />
    </>
  );
}

/** Salir de rotonda: arco + flecha saliendo. */
function ExitRoundaboutIcon() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        d="M 42 38 A 16 16 0 1 1 28 18"
      />
      <path fill="currentColor" d="M 6 22 L 2 16 L 2 28 Z" />
    </>
  );
}

/** Salida / entrada autovía: vía principal + rampa divergente. */
function HighwayRamp({ side }: { side: 'left' | 'right' }) {
  const ramp = (
    <>
      <path fill="currentColor" d="M 26 8 H 18 V 56 H 26 V 8 Z" />
      <path
        fill="currentColor"
        d="M 34 56 L 34 34 L 52 18 L 52 56 H 58 V 14 L 36 32 L 36 56 Z"
      />
    </>
  );
  if (side === 'right') return <>{ramp}</>;
  return <g transform="translate(64 0) scale(-1 1)">{ramp}</g>;
}

function ForkIcon() {
  return (
    <>
      <path fill="currentColor" d="M 28 8 H 20 V 56 H 28 V 8 Z" />
      <path fill="currentColor" d="M 36 8 H 44 V 30 L 54 18 V 8 H 46 V 26 L 38 34 V 8 Z" />
    </>
  );
}

function MergeIcon() {
  return (
    <>
      <path fill="currentColor" d="M 24 8 H 16 V 56 H 24 V 8 Z" />
      <path fill="currentColor" d="M 40 56 V 38 L 54 24 L 40 10 V 8 H 32 V 12 L 44 24 L 32 36 V 56 Z" />
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

function modifierBucket(m: string): 'left' | 'slight_left' | 'sharp_left' | 'right' | 'slight_right' | 'sharp_right' | 'straight' | 'uturn' | 'none' {
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

export function ManeuverTurnIcon({ maneuverType, maneuverModifier, size = 28, className }: Props) {
  const t = (maneuverType || '').toLowerCase().trim();
  const modRaw = (maneuverModifier || '').toLowerCase().trim();
  const bucket = modifierBucket(modRaw);

  const wrap = (children: ReactNode) => (
    <svg width={size} height={size} viewBox={VB} className={`shrink-0 ${className || ''}`} aria-hidden>
      {children}
    </svg>
  );

  if (t === 'arrive') {
    return <ArrivePin size={size} className={className} />;
  }

  if (t === 'roundabout' || t === 'rotary' || t === 'roundabout turn') {
    return wrap(<RoundaboutIcon />);
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
    if (bucket === 'left' || bucket === 'slight_left' || bucket === 'sharp_left') return wrap(<LeftTurn90Flat />);
    if (bucket === 'right' || bucket === 'slight_right' || bucket === 'sharp_right') return wrap(<RightTurn90Flat />);
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
        return wrap(<SharpRight />);
      case 'slight_left':
        return wrap(<SlightLeft />);
      case 'slight_right':
        return wrap(<SlightRight />);
      case 'left':
        return wrap(<LeftTurn90Flat />);
      case 'right':
        return wrap(<RightTurn90Flat />);
      case 'straight':
        return wrap(<StraightArrow />);
      default:
        return wrap(<StraightArrow />);
    }
  }

  return wrap(<StraightArrow />);
}

export function getDirectionIcon(type?: string, modifier?: string, size = 28) {
  return <ManeuverTurnIcon maneuverType={type} maneuverModifier={modifier} size={size} />;
}
