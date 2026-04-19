import { useId, type ReactNode, type ReactElement } from 'react';
import type { MedalDefinition } from '../lib/achievements';

type Props = {
  def: MedalDefinition;
  size?: number;
  className?: string;
};

type GlyphCommon = {
  ring: string;
  core: string;
  accent: string;
  s: number;
  className?: string;
  defsId: string;
};

/** IDs reales de achievements.ts → categoría de glifo (los prefijos km_/rides_ no existían). */
const KM_MEDAL_IDS = new Set([
  'twentyfive_km',
  'fifty_km',
  'one_hundred_km',
  'two_hundred_km',
  'three_hundred_km',
  'five_hundred_km',
  'seven_hundred_fifty_km',
  'one_thousand_km',
  'one_thousand_five_hundred_km',
  'two_thousand_five_hundred_km',
  'five_thousand_km',
]);

/** `first_ride` tiene glifo propio (GlyphFirstRide). */
const RIDES_MEDAL_IDS = new Set(['ten_rides', 'fifty_rides']);

const CURVES_MEDAL_IDS = new Set([
  'twentyfive_curves',
  'one_hundred_curves',
  'two_hundred_fifty_curves',
  'five_hundred_curves',
  'one_thousand_curves',
]);

function levelRomanLabel(id: string): string {
  if (id === 'level_5') return 'V';
  if (id === 'level_10') return 'X';
  if (id === 'level_15') return 'XV';
  if (id === 'level_20') return 'XX';
  if (id === 'level_25') return 'XXV';
  return '★';
}

function leanDegreeLabel(id: string): string {
  if (id === 'lean_30') return '30°';
  if (id === 'lean_epic_45') return '45°';
  if (id === 'lean_line') return '55°';
  return '°';
}

/** Cinta con pliegue central y colas (estilo chapa / arcade). `defs` fuera del grupo filtrado — evita glitches en Safari. */
function RibbonDeluxe({ accent, ring, defsId }: { accent: string; ring: string; defsId: string }) {
  const g = `${defsId}-rib`;
  return (
    <>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={1} />
          <stop offset="38%" stopColor="#fafafa" stopOpacity={0.35} />
          <stop offset="55%" stopColor={ring} stopOpacity={0.98} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.72} />
        </linearGradient>
      </defs>
      <g filter={`url(#${defsId}-dropshadow)`}>
        <path
          d="M28 44.5 L20 54 L24.5 48.5 L28 46.2 L31.5 48.5 L36 54 L28 44.5 Z"
          fill={`url(#${g})`}
          stroke={ring}
          strokeWidth={0.6}
          strokeOpacity={0.5}
        />
        <path d="M20 54 L22 50.5 M36 54 L34 50.5" stroke={ring} strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
        <path d="M28 46.2 L28 44.5" stroke={ring} strokeWidth={0.9} strokeOpacity={0.35} strokeLinecap="round" />
      </g>
    </>
  );
}

/** Marco metálico común: bisel, viñeta y sombra. */
function MedalFrame({
  defsId,
  ring,
  core,
  accent,
  children,
}: {
  defsId: string;
  ring: string;
  core: string;
  accent: string;
  children: ReactNode;
}) {
  const gMetal = `${defsId}-metal`;
  const gVig = `${defsId}-vig`;
  return (
    <>
      <defs>
        <linearGradient id={gMetal} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.65} />
          <stop offset="35%" stopColor={ring} stopOpacity={0.95} />
          <stop offset="72%" stopColor={core} stopOpacity={1} />
          <stop offset="100%" stopColor={core} stopOpacity={0.88} />
        </linearGradient>
        <radialGradient id={gVig} cx="32%" cy="26%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.18} />
          <stop offset="38%" stopColor={core} stopOpacity={0.12} />
          <stop offset="100%" stopColor={core} stopOpacity={0.94} />
        </radialGradient>
        <filter id={`${defsId}-dropshadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#000000" floodOpacity="0.5" />
        </filter>
        <clipPath id={`${defsId}-clip`}>
          <circle cx="28" cy="27" r="17.4" />
        </clipPath>
      </defs>
      <circle cx="28" cy="27" r="21.8" fill="none" stroke={`url(#${gMetal})`} strokeWidth={2.8} />
      <circle cx="28" cy="27" r="19.5" fill={`url(#${gVig})`} stroke={ring} strokeWidth={1.2} strokeOpacity={0.85} />
      <ellipse cx="28" cy="19" rx="11" ry="6.5" fill="#ffffff" fillOpacity={0.08} />
      <ellipse cx="28" cy="35" rx="12" ry="5" fill="#000000" fillOpacity={0.12} />
      <circle cx="28" cy="27" r="17.2" fill="none" stroke={accent} strokeWidth={0.45} strokeOpacity={0.28} />
      <g clipPath={`url(#${defsId}-clip)`}>{children}</g>
      <RibbonDeluxe accent={accent} ring={ring} defsId={defsId} />
    </>
  );
}

function wrapMedal(common: GlyphCommon, inner: ReactNode): ReactElement {
  const { s, className, defsId, ring, core, accent } = common;
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <MedalFrame defsId={defsId} ring={ring} core={core} accent={accent}>
        {inner}
      </MedalFrame>
    </svg>
  );
}

/** Carretera en perspectiva + rueda (kilómetros) estilo arcade retro. */
function GlyphKm(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-road`} x1="28" y1="12" x2="28" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3f3f46" stopOpacity={0.95} />
          <stop offset="45%" stopColor="#27272a" stopOpacity={1} />
          <stop offset="100%" stopColor="#0a0a0b" stopOpacity={1} />
        </linearGradient>
      </defs>
      <path d="M18 14 L38 14 L34 42 L22 42 Z" fill={`url(#${defsId}-road)`} stroke={ring} strokeWidth={0.65} strokeOpacity={0.45} />
      <path d="M20 18 L36 18 M21 24 L35 24 M22 30 L34 30 M23 36 L33 36" stroke="#ffffff" strokeWidth={0.35} strokeOpacity={0.06} strokeLinecap="round" />
      <path d="M27.5 14 L27.5 40" stroke="#fbbf24" strokeWidth={1.2} strokeDasharray="2.5 2" strokeLinecap="round" opacity={0.9} />
      <path d="M22 16 L22 38 M34 16 L34 38" stroke="#52525b" strokeWidth={0.9} strokeLinecap="round" opacity={0.7} />
      <g fill="#facc15" opacity={0.85}>
        <circle cx="22" cy="22" r="1.1" />
        <circle cx="34" cy="22" r="1.1" />
        <circle cx="22" cy="32" r="1.1" />
        <circle cx="34" cy="32" r="1.1" />
      </g>
      <g stroke={accent} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} fill="none">
        <path d="M14 22 L18 20 M42 22 L38 20" />
        <path d="M12 28 L16 26 M44 28 L40 26" />
      </g>
      <g fill="none" stroke={accent} strokeWidth={1.65}>
        <circle cx="28" cy="39" r="6.2" />
        <circle cx="28" cy="39" r="4.2" />
        <circle cx="28" cy="39" r="2" />
        {Array.from({ length: 8 }, (_, i) => i * 45).map((deg) => (
          <line
            key={deg}
            x1="28"
            y1="39"
            x2={28 + 5.5 * Math.cos((deg * Math.PI) / 180)}
            y2={39 + 5.5 * Math.sin((deg * Math.PI) / 180)}
            stroke={ring}
            strokeWidth={0.85}
            opacity={0.88}
          />
        ))}
      </g>
      <circle cx="28" cy="39" r="1.8" fill="#18181b" />
      <circle cx="28" cy="39" r="1.1" fill={accent} />
      <circle cx="27" cy="38" r="0.45" fill="#ffffff" fillOpacity={0.35} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Ruta GPS / manillar: trazo brillante con waypoints. */
function GlyphRides(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-route`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
          <stop offset="50%" stopColor={accent} stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <path
        d="M13 30 Q28 12 43 30"
        fill="none"
        stroke={accent}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.2}
      />
      <path
        d="M13 30 Q28 12 43 30"
        fill="none"
        stroke={`url(#${defsId}-route)`}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <path
        d="M17 26 Q28 14 39 26"
        fill="none"
        stroke={accent}
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.45}
      />
      <circle cx="14" cy="29.5" r="4.2" fill="none" stroke={accent} strokeWidth={0.9} opacity={0.45} />
      <circle cx="14" cy="29.5" r="3.8" fill={accent} opacity={0.95} />
      <circle cx="14" cy="29.5" r="1.6" fill={ring} />
      <circle cx="42" cy="29.5" r="4.2" fill="none" stroke={accent} strokeWidth={0.9} opacity={0.45} />
      <circle cx="42" cy="29.5" r="3.8" fill={accent} opacity={0.95} />
      <circle cx="42" cy="29.5" r="1.6" fill={ring} />
      <circle cx="28" cy="19.5" r="2.2" fill={ring} stroke={accent} strokeWidth={0.8} />
      <path d="M26 22 L30 22 L29 28 L27 28 Z" fill={accent} opacity={0.4} />
      <circle cx="28" cy="25" r="10" fill="none" stroke={accent} strokeWidth={0.45} strokeDasharray="1.5 2" opacity={0.3} />
      <g fill={accent} opacity={0.75}>
        <circle cx="20" cy="24" r="1" />
        <circle cx="28" cy="20" r="1.1" />
        <circle cx="36" cy="24" r="1" />
      </g>
    </>
  );
  return wrapMedal(p, inner);
}

/** Tramo revirado (eses) + marcas de goma. */
function GlyphCurves(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-curve`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor={ring} stopOpacity={1} />
        </linearGradient>
      </defs>
      <path
        d="M13 38 Q22 18 28 26 Q34 34 44 18"
        fill="none"
        stroke="#ffffff"
        strokeWidth={4.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.12}
      />
      <path
        d="M13 38 Q22 18 28 26 Q34 34 44 18"
        fill="none"
        stroke={`url(#${defsId}-curve)`}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 40 Q24 30 32 36 Q28 36 20 40"
        fill="none"
        stroke={ring}
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.45}
      />
      <g fill={accent} opacity={0.85}>
        <path d="M18 22 L20 18 L22 22 Z" />
        <path d="M34 30 L36 26 L38 30 Z" />
      </g>
      <ellipse cx="28" cy="32" rx="4" ry="1.2" fill={accent} opacity={0.15} transform="rotate(-25 28 32)" />
      <ellipse cx="24" cy="24" rx="3" ry="1" fill={accent} opacity={0.12} transform="rotate(15 24 24)" />
    </>
  );
  return wrapMedal(p, inner);
}

/** Moto de perfil + arco de inclinación y grados. */
function GlyphLean(props: GlyphCommon & { label: string }) {
  const { label, ...common } = props;
  const { ring, accent } = common;
  const inner = (
    <>
      <path d="M11 42 Q28 10 45 42" fill="none" stroke={accent} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.35} />
      <path
        d="M16 40 A12 12 0 0 1 40 40"
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.55}
      />
      <g transform="rotate(-18 28 33)">
        <ellipse cx="28" cy="36" rx="9" ry="3.2" fill={ring} opacity={0.35} />
        <path
          d="M20 34 L24 22 L32 20 L36 28 L34 36 L22 36 Z"
          fill={accent}
          fillOpacity={0.55}
          stroke={ring}
          strokeWidth={0.8}
        />
        <circle cx="22" cy="34" r="3.5" fill="none" stroke={accent} strokeWidth={1.6} />
        <circle cx="34" cy="32" r="3.5" fill="none" stroke={accent} strokeWidth={1.6} />
        <path d="M30 20 L33 14 L36 18" fill="none" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </g>
      <text x="28" y="16" textAnchor="middle" fill="#000000" fillOpacity={0.35} fontSize="10" fontWeight={900} fontFamily="system-ui, sans-serif">
        {label}
      </text>
      <text x="28" y="15.5" textAnchor="middle" fill={accent} fontSize="10" fontWeight={900} fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </>
  );
  return wrapMedal(common, inner);
}

/** Velocímetro con marcas y aguja. */
function GlyphSpeedo(props: GlyphCommon & { label: string }) {
  const { label, ...common } = props;
  const { ring, accent, defsId } = common;
  const ticks = [-60, -40, -20, 0, 20, 40, 60].map((angle, i) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    const r1 = i % 2 === 0 ? 12.5 : 11.5;
    const r2 = 14.8;
    const cx = 28;
    const cy = 34;
    return (
      <line
        key={angle}
        x1={cx + r1 * Math.cos(rad)}
        y1={cy + r1 * Math.sin(rad)}
        x2={cx + r2 * Math.cos(rad)}
        y2={cy + r2 * Math.sin(rad)}
        stroke={i % 2 === 0 ? accent : ring}
        strokeWidth={i % 2 === 0 ? 1.4 : 0.8}
        strokeLinecap="round"
        opacity={0.9}
      />
    );
  });
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-gauge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.5} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.15} />
        </linearGradient>
      </defs>
      <path
        d="M14 34 A14 14 0 0 1 42 34"
        fill="none"
        stroke="#000000"
        strokeOpacity={0.25}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M14 34 A14 14 0 0 1 42 34"
        fill="none"
        stroke={`url(#${defsId}-gauge)`}
        strokeWidth={3}
        strokeLinecap="round"
      />
      {ticks}
      <path d="M28 34 L36 20" stroke="#000000" strokeOpacity={0.35} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M28 34 L36 20" stroke={accent} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="28" cy="34" r="3" fill={ring} stroke={accent} strokeWidth={0.8} />
      <text
        x="28"
        y="47"
        textAnchor="middle"
        fill={accent}
        fontSize="11"
        fontWeight={900}
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
    </>
  );
  return wrapMedal(common, inner);
}

/** Escudo de nivel con galones y relieve. */
function GlyphLevel(props: GlyphCommon & { roman: string }) {
  const { roman, ...common } = props;
  const { ring, accent, defsId } = common;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-shield`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.25} />
        </linearGradient>
      </defs>
      <path
        d="M16 17 L40 17 L38 38 L28 43 L18 38 Z"
        fill={`url(#${defsId}-shield)`}
        stroke={accent}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d="M18 19 L38 19" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={1} strokeLinecap="round" />
      <path d="M20 21 h16 M20 25 h14" stroke={ring} strokeWidth={0.9} strokeLinecap="round" opacity={0.5} />
      <path d="M22 17 L28 12 L34 17" fill="none" stroke={accent} strokeWidth={1.4} strokeLinecap="round" />
      <text x="28" y="35" textAnchor="middle" fill="#000000" fillOpacity={0.25} fontSize="14" fontWeight={900} fontFamily="Georgia, serif">
        {roman}
      </text>
      <text x="28" y="34.5" textAnchor="middle" fill={accent} fontSize="14" fontWeight={900} fontFamily="Georgia, serif">
        {roman}
      </text>
    </>
  );
  return wrapMedal(common, inner);
}

/** Cadena de eslabones + estrella facetada. */
function GlyphCombo(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-star`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity={0.95} />
          <stop offset="100%" stopColor={ring} stopOpacity={1} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={accent} strokeWidth={1.85} strokeLinecap="round">
        <ellipse cx="22" cy="30.5" rx="5" ry="3.6" />
        <ellipse cx="34" cy="30.5" rx="5" ry="3.6" />
        <path d="M27 30.5 h2" stroke={ring} strokeWidth={2.4} />
      </g>
      <circle cx="22" cy="30.5" r="2.4" fill={ring} stroke={accent} strokeWidth={0.75} />
      <circle cx="34" cy="30.5" r="2.4" fill={ring} stroke={accent} strokeWidth={0.75} />
      <path
        d="M28 14 L30.8 22.5 L40 22.5 L32.6 28.2 L35.4 37 L28 31.8 L20.6 37 L23.4 28.2 L16 22.5 L25.2 22.5 Z"
        fill={`url(#${defsId}-star)`}
        stroke={ring}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path
        d="M28 18 L29.2 23.5 L35 23.5 L30.4 27 L32 32 L28 29.2 L24 32 L25.6 27 L21 23.5 L26.8 23.5 Z"
        fill="#ffffff"
        fillOpacity={0.2}
      />
    </>
  );
  return wrapMedal(p, inner);
}

/** Conductor prudente: escudo verde + límite. */
function GlyphPrudent(p: GlyphCommon) {
  const { ring, accent, defsId, core } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-pru`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor="#166534" stopOpacity={0.5} />
        </linearGradient>
      </defs>
      <path
        d="M17 16 h22 l-2.5 24 h-17 Z"
        fill={`url(#${defsId}-pru)`}
        stroke={accent}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path d="M21 21 L25 25.5 L33 18.5" fill="none" stroke={accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <rect x="21" y="33" width="14" height="3.5" rx="1" fill={ring} opacity={0.85} />
      <text x="28" y="35.8" textAnchor="middle" fill={core} fontSize="6.5" fontWeight={900} fontFamily="system-ui, sans-serif">
        {'≤120'}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Tortuga con caparazón segmentado. */
function GlyphTurtle(p: GlyphCommon) {
  const { ring, accent } = p;
  const inner = (
    <>
      <ellipse cx="28" cy="31" rx="12.5" ry="7.5" fill={accent} fillOpacity={0.22} stroke={ring} strokeWidth={0.8} />
      <path d="M22 28 Q28 24 34 28" fill="none" stroke={ring} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
      <g stroke={accent} strokeWidth={0.85} fill="none" opacity={0.65}>
        <path d="M24 29.5 h8 M26 27.5 v4 M30 27.5 v4" strokeLinecap="round" />
      </g>
      <circle cx="37.5" cy="26" r="3.8" fill={accent} />
      <circle cx="36.5" cy="25" r="1" fill={ring} />
      <path d="M14 28 L18 28" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
      <text x="28" y="17" textAnchor="middle" fill={accent} fontSize="8" fontWeight={900} fontFamily="system-ui, sans-serif">
        ≤90
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Rayo eléctrico + 120+. */
function GlyphSpeedCrack(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-bolt`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fef08a" stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.95} />
        </linearGradient>
      </defs>
      <path d="M18 37 L25 21 L27 28 L33 17 L35 35 L30 30 L28 38 Z" fill="#000000" fillOpacity={0.2} />
      <path d="M17 38 L24 20 L27 28 L32 16 L36 36 L30 30 L28 38 Z" fill={`url(#${defsId}-bolt)`} stroke={ring} strokeWidth={0.55} />
      <g stroke={accent} strokeWidth={1.2} strokeLinecap="round" opacity={0.5}>
        <path d="M12 24 L16 22 M40 20 L44 18" />
      </g>
      <text x="28" y="14" textAnchor="middle" fill={accent} fontSize="9" fontWeight={900} fontFamily="system-ui, sans-serif">
        120+
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Huracán — espiral de viento. */
function GlyphHuracan(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-wind`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.2} />
          <stop offset="50%" stopColor={accent} stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      <path
        d="M38 20 Q22 18 20 28 Q18 36 38 34"
        fill="none"
        stroke={`url(#${defsId}-wind)`}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d="M34 16 Q16 20 18 32 Q20 40 38 38"
        fill="none"
        stroke={ring}
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.55}
      />
      <g fill={accent} opacity={0.9}>
        <circle cx="16" cy="22" r="1.5" />
        <circle cx="40" cy="26" r="1.5" />
        <circle cx="22" cy="34" r="1.5" />
      </g>
      <text x="28" y="14" textAnchor="middle" fill={accent} fontSize="12" fontWeight={900} fontFamily="system-ui, sans-serif">
        150
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Taza con vapor + curva de ruta. */
function GlyphCoffeeLoop(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-cup`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
          <stop offset="100%" stopColor="#44403c" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <ellipse cx="24.5" cy="26" rx="5" ry="1.8" fill="#000000" fillOpacity={0.2} />
      <path
        d="M19 24 h11 q3.5 0 3.5 3.5 v7 q0 3.5 -3.5 3.5 h-9 q-3.5 0 -3.5 -3.5 v-7 q0 -3.5 3.5 -3.5"
        fill={`url(#${defsId}-cup)`}
        stroke={accent}
        strokeWidth={1.2}
      />
      <path d="M30.5 26 h4 q2 0 2 2.5 v2" fill="none" stroke={accent} strokeWidth={1.3} strokeLinecap="round" />
      <g stroke={accent} strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.7}>
        <path d="M24 16 Q25 12 26 16" />
        <path d="M28 15 Q29 11 30 15" />
        <path d="M32 16 Q33 12 34 16" />
      </g>
      <path d="M18 39 Q28 33 38 39" fill="none" stroke={ring} strokeWidth={2} strokeLinecap="round" />
    </>
  );
  return wrapMedal(p, inner);
}

/** Rosa de los vientos clásica (N/S/E/W). */
function GlyphCompassRose(p: GlyphCommon) {
  const { ring, accent, defsId, core } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-n`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fca5a5" stopOpacity={1} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.9} />
        </linearGradient>
        <linearGradient id={`${defsId}-s`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity={1} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.85} />
        </linearGradient>
      </defs>
      <circle cx="28" cy="28" r="2.8" fill={core} stroke={accent} strokeWidth={0.8} />
      <path d="M28 15 L31 27 L28 41 L25 27 Z" fill={`url(#${defsId}-n)`} stroke={ring} strokeWidth={0.4} />
      <path d="M15 28 L27 25 L41 28 L27 31 Z" fill={`url(#${defsId}-s)`} stroke={ring} strokeWidth={0.4} />
      <text x="28" y="13.5" textAnchor="middle" fill={accent} fontSize="6" fontWeight={900}>
        N
      </text>
      <text x="28" y="44" textAnchor="middle" fill={accent} fontSize="6" fontWeight={900} opacity={0.7}>
        S
      </text>
      <circle cx="28" cy="28" r="11" fill="none" stroke={accent} strokeWidth={0.5} strokeOpacity={0.35} />
      <text x="12.5" y="29.5" textAnchor="middle" fill={accent} fontSize="5.5" fontWeight={900} opacity={0.75}>
        W
      </text>
      <text x="43.5" y="29.5" textAnchor="middle" fill={accent} fontSize="5.5" fontWeight={900} opacity={0.75}>
        E
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Vieira del Camino con nervaduras. */
function GlyphPeregrino(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <radialGradient id={`${defsId}-shell`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.35} />
        </radialGradient>
      </defs>
      <path
        d="M28 15 Q39 24 37 33 Q35 40 28 42 Q21 40 19 33 Q17 24 28 15"
        fill={`url(#${defsId}-shell)`}
        stroke={ring}
        strokeWidth={1.3}
      />
      <path d="M28 20 Q32 26 28 38 Q24 26 28 20" fill="none" stroke={accent} strokeWidth={1} strokeLinecap="round" opacity={0.7} />
      <path d="M22 24 Q28 28 34 24" fill="none" stroke={accent} strokeWidth={0.9} opacity={0.5} />
      <path d="M22 32 Q28 30 34 32" fill="none" stroke={accent} strokeWidth={0.9} opacity={0.5} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Mira táctica + trazo de curva. */
function GlyphCurveHunter(p: GlyphCommon) {
  const { ring, accent } = p;
  const inner = (
    <>
      <circle cx="28" cy="28" r="12" fill="none" stroke={accent} strokeWidth={1.6} opacity={0.85} />
      <circle cx="28" cy="28" r="9" fill="none" stroke={accent} strokeWidth={0.4} strokeDasharray="2 2" opacity={0.45} />
      <path d="M16 18 L40 38 M40 18 L16 38" stroke={accent} strokeWidth={1} opacity={0.4} />
      <circle cx="28" cy="28" r="2.4" fill={accent} stroke={ring} strokeWidth={0.6} />
      <path d="M13 34 Q22 18 30 26 T45 20" fill="none" stroke={ring} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M28 16 L28 12 M28 40 L28 44 M16 28 L12 28 M44 28 L48 28" stroke={accent} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Carretera plateada con brillo metálico. */
function GlyphSilverRoad(p: GlyphCommon) {
  const { accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-ag`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity={0.95} />
          <stop offset="50%" stopColor={accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.7} />
        </linearGradient>
      </defs>
      <path
        d="M17 38 L28 13 L39 38"
        fill="none"
        stroke={`url(#${defsId}-ag)`}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M24 29 h8 M26 33 h4" stroke="#e2e8f0" strokeWidth={1.3} strokeLinecap="round" opacity={0.75} />
      <path d="M22 20 L34 32" stroke="#ffffff" strokeWidth={0.8} strokeLinecap="round" opacity={0.35} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Sol dorado + horizonte de ruta. */
function GlyphGoldOdyssey(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <radialGradient id={`${defsId}-sun`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fde047" stopOpacity={0.95} />
          <stop offset="70%" stopColor={accent} stopOpacity={0.65} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.3} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="21" r="9" fill={`url(#${defsId}-sun)`} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = ((deg - 90) * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={28 + 10 * Math.cos(r)}
            y1={21 + 10 * Math.sin(r)}
            x2={28 + 13 * Math.cos(r)}
            y2={21 + 13 * Math.sin(r)}
            stroke="#facc15"
            strokeWidth={1.2}
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      })}
      <path d="M11 37 h34" stroke={ring} strokeWidth={2.8} strokeLinecap="round" />
      <path d="M13 35 Q28 31 43 35" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Cromado: reflejos cruzados tipo depósito. */
function GlyphMirrorPolish(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-chrome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="40%" stopColor={accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor="#71717a" stopOpacity={0.5} />
        </linearGradient>
      </defs>
      <ellipse cx="28" cy="28" rx="11" ry="13" fill="none" stroke={`url(#${defsId}-chrome)`} strokeWidth={2.2} opacity={0.6} />
      <path d="M15 19 L22 38 M41 19 L34 38" stroke="#f4f4f5" strokeWidth={2.8} strokeLinecap="round" opacity={0.9} />
      <path d="M19 17 L28 39 L37 17" fill="none" stroke={accent} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} />
      <circle cx="28" cy="28" r="3" fill="none" stroke={ring} strokeWidth={0.8} opacity={0.4} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Alforjas con correas + ruta ondulada. */
function GlyphMule(p: GlyphCommon) {
  const { ring, accent } = p;
  const inner = (
    <>
      <rect x="17" y="23" width="9" height="12" rx="1.5" fill={accent} fillOpacity={0.22} stroke={accent} strokeWidth={1.2} />
      <rect x="30" y="23" width="9" height="12" rx="1.5" fill={accent} fillOpacity={0.22} stroke={accent} strokeWidth={1.2} />
      <path d="M26 23 v-5 M30 23 v-5" stroke={ring} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="28" cy="18.5" r="2" fill={ring} stroke={accent} strokeWidth={0.5} opacity={0.9} />
      <path d="M22 21 Q28 19 34 21" fill="none" stroke={accent} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
      <path d="M13 39 Q28 33 43 39" fill="none" stroke={ring} strokeWidth={2.2} strokeLinecap="round" />
      <text x="28" y="13.5" textAnchor="middle" fill={accent} fontSize="6" fontWeight={900} opacity={0.75}>
        ×2
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Dados facetados (azar). */
function GlyphWildcard(p: GlyphCommon) {
  const { ring, accent } = p;
  const inner = (
    <>
      <g transform="rotate(-10 28 28)">
        <rect x="16" y="16" width="24" height="24" rx="4" fill={ring} fillOpacity={0.4} stroke={accent} strokeWidth={1.5} />
        <rect x="18" y="18" width="20" height="20" rx="2.5" fill="none" stroke="#ffffff" strokeOpacity={0.12} strokeWidth={0.6} />
        <circle cx="23" cy="23" r="2.4" fill={accent} />
        <circle cx="33" cy="33" r="2.4" fill={accent} />
        <circle cx="28" cy="28" r="1.8" fill={accent} opacity={0.6} />
      </g>
      <path d="M18 14 L38 14" stroke={accent} strokeWidth={0.8} strokeLinecap="round" opacity={0.35} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Bandera a cuadros ondulada + rueda. */
function GlyphFirstRide(p: GlyphCommon) {
  const { ring, accent, core } = p;
  const inner = (
    <>
      <path d="M18 14 v22" stroke={ring} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M18 14 Q24 13.5 30 15 L30 23 Q24 22.5 18 22 Z" fill={core} stroke={accent} strokeWidth={0.8} />
      <g>
        <rect x="19" y="15" width="5" height="5" fill={accent} />
        <rect x="25" y="15" width="5" height="5" fill="#fafafa" opacity={0.9} />
        <rect x="19" y="20" width="5" height="5" fill="#fafafa" opacity={0.9} />
        <rect x="25" y="20" width="5" height="5" fill={accent} />
      </g>
      <circle cx="28" cy="38" r="5.5" fill="none" stroke={accent} strokeWidth={1.65} />
      <circle cx="28" cy="38" r="3.5" fill="none" stroke={accent} strokeWidth={1.2} opacity={0.75} />
      <circle cx="28" cy="38" r="1.6" fill={accent} stroke={ring} strokeWidth={0.4} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Luna creciente + constelación + silueta de ruta. */
function GlyphNightStyle(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity={0.95} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.45} />
        </linearGradient>
      </defs>
      <path d="M36 14 A10 10 0 1 1 22 18 A10 10 0 0 0 36 14" fill={`url(#${defsId}-moon)`} opacity={0.9} stroke={accent} strokeWidth={0.35} strokeOpacity={0.4} />
      {[
        [16, 18, 1.2],
        [38, 22, 1],
        [22, 36, 0.9],
        [34, 38, 1.1],
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={r as number} fill="#f8fafc" opacity={0.85} />
      ))}
      <path d="M14 40 Q22 34 28 38 T42 36" fill="none" stroke={ring} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
    </>
  );
  return wrapMedal(p, inner);
}

function GlyphFallbackTrophy(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-cup`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" stopOpacity={0.9} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.75} />
        </linearGradient>
      </defs>
      <path d="M28 14 L32 26 L36 26 L33 32 L38 40 L28 36 L18 40 L23 32 L20 26 L24 26 Z" fill={`url(#${defsId}-cup)`} stroke={ring} strokeWidth={0.6} strokeLinejoin="round" />
      <path d="M16 26 h4 v8 M40 26 h-4 v8" fill="none" stroke={ring} strokeWidth={1.2} strokeLinecap="round" opacity={0.65} />
      <rect x="22" y="38" width="12" height="4" rx="1" fill={ring} opacity={0.85} />
    </>
  );
  return wrapMedal(p, inner);
}

/** SVG distintivo por medalla estilo videojuego arcade de motos. */
export default function MedalGlyph({ def, size = 56, className = '' }: Props) {
  const defsId = useId().replace(/:/g, '');
  const { id, ring, core, accent } = def;
  const s = size;
  const commonClass = className;
  const p: GlyphCommon = { ring, core, accent, s, className: commonClass, defsId };

  if (KM_MEDAL_IDS.has(id)) {
    return <GlyphKm {...p} />;
  }
  if (id === 'first_ride') {
    return <GlyphFirstRide {...p} />;
  }
  if (RIDES_MEDAL_IDS.has(id)) {
    return <GlyphRides {...p} />;
  }
  if (CURVES_MEDAL_IDS.has(id)) {
    return <GlyphCurves {...p} />;
  }
  if (id === 'speed_safe') {
    return <GlyphPrudent {...p} />;
  }
  if (id === 'speed_turtle') {
    return <GlyphTurtle {...p} />;
  }
  if (id === 'speed_over_120') {
    return <GlyphSpeedCrack {...p} />;
  }
  if (id === 'club_80') {
    return <GlyphSpeedo {...p} label="80" />;
  }
  if (id === 'speed_hundred') {
    return <GlyphSpeedo {...p} label="100" />;
  }
  if (id === 'huracan') {
    return <GlyphHuracan {...p} />;
  }
  if (id.startsWith('lean_')) {
    return <GlyphLean {...p} label={leanDegreeLabel(id)} />;
  }
  if (id.startsWith('level_')) {
    return <GlyphLevel {...p} roman={levelRomanLabel(id)} />;
  }

  switch (id) {
    case 'mule':
      return <GlyphMule {...p} />;
    case 'silver_road':
      return <GlyphSilverRoad {...p} />;
    case 'gold_odyssey':
      return <GlyphGoldOdyssey {...p} />;
    case 'curve_hunter':
      return <GlyphCurveHunter {...p} />;
    case 'compass_rose':
      return <GlyphCompassRose {...p} />;
    case 'peregrino':
      return <GlyphPeregrino {...p} />;
    case 'chain_master':
      return <GlyphCombo {...p} />;
    case 'coffee_loop':
      return <GlyphCoffeeLoop {...p} />;
    case 'mirror_polish':
      return <GlyphMirrorPolish {...p} />;
    case 'night_style':
      return <GlyphNightStyle {...p} />;
    case 'wildcard':
      return <GlyphWildcard {...p} />;
    default:
      return <GlyphFallbackTrophy {...p} />;
  }
}
