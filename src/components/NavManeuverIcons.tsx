/**
 * Iconos de maniobra OSRM: trazo vectorial limpio (sin superposición fill+stroke
 * que genera bordes dentados). Rotondas: anillo visible + número de salida.
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

/** Flecha en punta triangular (relleno sólido). */
function ArrowHead({ x, y, rotDeg }: { x: number; y: number; rotDeg: number }) {
  return (
    <path
      fill="currentColor"
      transform={`translate(${x} ${y}) rotate(${rotDeg})`}
      d="M 0 -7 L 7 7 L -7 7 Z"
    />
  );
}

/** Giro ~90° a la izquierda: solo trazo + cabeza. */
function LeftTurn90Flat() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 38 54 V 30 Q 38 17 26 17 H 16"
      />
      <ArrowHead x={16} y={17} rotDeg={-90} />
    </>
  );
}

function RightTurn90Flat() {
  return (
    <g transform="translate(64 0) scale(-1 1)">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 38 54 V 30 Q 38 17 26 17 H 16"
      />
      <ArrowHead x={16} y={17} rotDeg={-90} />
    </g>
  );
}

function StraightArrow() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        d="M 32 50 V 14"
      />
      <ArrowHead x={32} y={14} rotDeg={0} />
    </>
  );
}

function SlightLeft() {
  return (
    <g transform="translate(32 32) rotate(-32) translate(-32 -32)">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 32 50 L 32 22 Q 32 14 24 14 H 14"
      />
      <ArrowHead x={14} y={14} rotDeg={-90} />
    </g>
  );
}

function SlightRight() {
  return (
    <g transform="translate(64 0) scale(-1 1)">
      <g transform="translate(32 32) rotate(-32) translate(-32 -32)">
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M 32 50 L 32 22 Q 32 14 24 14 H 14"
        />
        <ArrowHead x={14} y={14} rotDeg={-90} />
      </g>
    </g>
  );
}

function SharpLeft() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 42 54 V 34 Q 42 12 22 12 H 12"
      />
      <ArrowHead x={12} y={12} rotDeg={-90} />
    </>
  );
}

function SharpRight() {
  return (
    <g transform="translate(64 0) scale(-1 1)">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 42 54 V 34 Q 42 12 22 12 H 12"
      />
      <ArrowHead x={12} y={12} rotDeg={-90} />
    </g>
  );
}

function UTurn() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 44 52 V 38 Q 44 10 22 10 Q 10 10 10 22 V 30"
      />
      <ArrowHead x={10} y={30} rotDeg={180} />
    </>
  );
}

/**
 * Rotonda: círculo grueso + arco de sentido + número de salida centrado.
 */
function RoundaboutIcon({ exit }: { exit: number | null }) {
  const label =
    exit != null && exit > 0 && exit <= 99 ? String(exit) : '?';
  const fs = label.length > 1 ? 22 : 28;
  return (
    <>
      <circle
        cx="32"
        cy="32"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      {/* Indicación de sentido horario (entrada típica por abajo) */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        d="M 32 54 A 22 22 0 0 1 10 32"
        opacity="0.88"
      />
      <text
        x="32"
        y="32"
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

/** Salir de rotonda: arco de circulación + flecha que sale. */
function ExitRoundaboutIcon() {
  return (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        d="M 42 38 A 17 17 0 1 1 30 16"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 10 28 L 4 22"
      />
      <ArrowHead x={4} y={22} rotDeg={-125} />
    </>
  );
}

function HighwayRamp({ side }: { side: 'left' | 'right' }) {
  const ramp = (
    <>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        d="M 24 52 V 16"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 32 52 L 32 36 L 50 18"
      />
      <ArrowHead x={50} y={18} rotDeg={45} />
    </>
  );
  if (side === 'right') return <>{ramp}</>;
  return (
    <g transform="translate(64 0) scale(-1 1)">
      {ramp}
    </g>
  );
}

function ForkIcon() {
  return (
    <>
      <path fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" d="M 32 52 V 20" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        d="M 32 20 L 20 12"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        d="M 32 20 L 44 12"
      />
      <ArrowHead x={20} y={12} rotDeg={-130} />
      <ArrowHead x={44} y={12} rotDeg={130} />
    </>
  );
}

function MergeIcon() {
  return (
    <>
      <path fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" d="M 22 52 V 28" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M 42 52 L 42 38 L 28 24"
      />
      <ArrowHead x={22} y={28} rotDeg={180} />
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
