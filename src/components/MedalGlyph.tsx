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

const KM_DISTANCE_BY_ID: Record<string, number> = {
  twentyfive_km: 25,
  fifty_km: 50,
  one_hundred_km: 100,
  two_hundred_km: 200,
  three_hundred_km: 300,
  five_hundred_km: 500,
  seven_hundred_fifty_km: 750,
  one_thousand_km: 1000,
  one_thousand_five_hundred_km: 1500,
  two_thousand_five_hundred_km: 2500,
  five_thousand_km: 5000,
};

/** `first_ride` tiene glifo propio (GlyphFirstRide). */
const RIDES_MEDAL_IDS = new Set(['ten_rides', 'fifty_rides']);

const RIDES_COUNT_BY_ID: Record<string, 10 | 50> = {
  ten_rides: 10,
  fifty_rides: 50,
};

const CURVES_MEDAL_IDS = new Set([
  'twentyfive_curves',
  'one_hundred_curves',
  'two_hundred_fifty_curves',
  'five_hundred_curves',
  'one_thousand_curves',
]);

const CURVE_COUNT_BY_ID: Record<string, number> = {
  twentyfive_curves: 25,
  one_hundred_curves: 100,
  two_hundred_fifty_curves: 250,
  five_hundred_curves: 500,
  one_thousand_curves: 1000,
};

/** Texto legible en la chapa según umbral (km acumulados). */
function formatKmLabel(km: number): string {
  if (km === 1000) return '1k';
  if (km === 1500) return '1.5k';
  if (km === 2500) return '2.5k';
  if (km === 5000) return '5k';
  return String(km);
}

function formatCurveLabel(n: number): string {
  if (n >= 1000) return '1k';
  return String(n);
}

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

/** Kilómetros acumulados: número del hito + cuentakilómetros (dial) + carretera. */
function GlyphKm(p: GlyphCommon & { km: number }) {
  const { ring, accent, defsId, km } = p;
  const label = formatKmLabel(km);
  const fs = label.length >= 4 ? 11 : label.length >= 3 ? 13 : 15;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-road`} x1="28" y1="14" x2="28" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3f3f46" stopOpacity={0.95} />
          <stop offset="50%" stopColor="#27272a" stopOpacity={1} />
          <stop offset="100%" stopColor="#0a0a0b" stopOpacity={1} />
        </linearGradient>
      </defs>
      {/* Carretera en perspectiva (solo contexto) */}
      <path d="M19 15 L37 15 L33 38 L23 38 Z" fill={`url(#${defsId}-road)`} stroke={ring} strokeWidth={0.5} strokeOpacity={0.4} />
      <path d="M27.5 15 L27.5 36" stroke="#fbbf24" strokeWidth={0.9} strokeDasharray="2 2" strokeLinecap="round" opacity={0.75} />
      {/* Dial tipo odómetro */}
      <rect x="14" y="17" width="28" height="22" rx="2.5" fill="#0c0c0e" stroke={ring} strokeWidth={0.9} opacity={0.92} />
      <text
        x="28"
        y="33.5"
        textAnchor="middle"
        fill={accent}
        fontSize={fs}
        fontWeight={900}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {label}
      </text>
      <text x="28" y="37.5" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} fontFamily="system-ui, sans-serif" opacity={0.85}>
        km
      </text>
      <path d="M16 40 h24" stroke={accent} strokeWidth={1.2} strokeLinecap="round" opacity={0.35} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Rutas completadas: número grande + trazo de ruta (varias salidas). */
function GlyphRides(p: GlyphCommon & { count: 10 | 50 }) {
  const { ring, accent, defsId, count } = p;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-route`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.25} />
          <stop offset="50%" stopColor={accent} stopOpacity={1} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <text x="28" y="24" textAnchor="middle" fill={accent} fontSize={count === 50 ? 20 : 22} fontWeight={900} fontFamily="system-ui, sans-serif">
        {count}
      </text>
      <text x="28" y="31" textAnchor="middle" fill={ring} fontSize="6.5" fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.9}>
        rutas
      </text>
      <path
        d="M12 38 Q20 32 28 36 T44 34"
        fill="none"
        stroke={`url(#${defsId}-route)`}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx="14" cy="36.5" r="2" fill={accent} stroke={ring} strokeWidth={0.5} />
      <circle cx="28" cy="37.5" r="2" fill={accent} stroke={ring} strokeWidth={0.5} />
      <circle cx="40" cy="35.5" r="2" fill={accent} stroke={ring} strokeWidth={0.5} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Curvas contadas: S clara + número de curvas superadas. */
function GlyphCurves(p: GlyphCommon & { count: number }) {
  const { ring, accent, defsId, count } = p;
  const label = formatCurveLabel(count);
  const fs = label.length >= 3 ? 14 : 16;
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-curve`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity={0.85} />
          <stop offset="100%" stopColor={ring} stopOpacity={1} />
        </linearGradient>
      </defs>
      <text x="28" y="19" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {label}
      </text>
      <text x="28" y="25" textAnchor="middle" fill={ring} fontSize="6" fontWeight={700} fontFamily="system-ui, sans-serif" opacity={0.88}>
        curvas
      </text>
      <path
        d="M11 38 C16 22 22 22 28 30 C34 38 40 38 45 22"
        fill="none"
        stroke="#ffffff"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.1}
      />
      <path
        d="M11 38 C16 22 22 22 28 30 C34 38 40 38 45 22"
        fill="none"
        stroke={`url(#${defsId}-curve)`}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 40 L16 36 M40 24 L42 20" stroke={accent} strokeWidth={1} strokeLinecap="round" opacity={0.45} />
    </>
  );
  return wrapMedal(p, inner);
}

/** Inclinación: moto de perfil con giro claro + ángulo. */
function GlyphLean(props: GlyphCommon & { label: string }) {
  const { label, ...common } = props;
  const { ring, accent } = common;
  const inner = (
    <>
      <path d="M14 39 A14 14 0 0 1 42 39" fill="none" stroke={accent} strokeWidth={1.1} strokeLinecap="round" opacity={0.35} />
      <g transform="rotate(-24 28 33)">
        <circle cx="19" cy="36" r="4.2" fill="none" stroke={accent} strokeWidth={1.9} />
        <circle cx="35" cy="33" r="4.2" fill="none" stroke={accent} strokeWidth={1.9} />
        <path
          d="M19 36 L26 22 L33 24 L35 33"
          fill="none"
          stroke={ring}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M26 22 Q28 18 31 20" fill="none" stroke={accent} strokeWidth={1.4} strokeLinecap="round" />
        <ellipse cx="28" cy="19" rx="3.5" ry="2.6" fill={accent} fillOpacity={0.4} stroke={accent} strokeWidth={0.6} />
      </g>
      <text x="28" y="14" textAnchor="middle" fill={accent} fontSize="11" fontWeight={900} fontFamily="system-ui, sans-serif">
        {label}
      </text>
      <text x="28" y="42" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} opacity={0.75}>
        inclinación
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
      <text x="28" y="41" textAnchor="middle" fill={accent} fontSize="11" fontWeight={900} fontFamily="system-ui, sans-serif">
        <tspan>{label}</tspan>
        <tspan fill={ring} fontSize="6" fontWeight={700} opacity={0.82}>
          {' '}
          km/h
        </tspan>
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
      <text x="28" y="40" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} opacity={0.75}>
        nivel
      </text>
    </>
  );
  return wrapMedal(common, inner);
}

function dualStatFontSize(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  if (m > 16) return 5.5;
  if (m > 12) return 6.5;
  if (m > 9) return 7;
  return 8;
}

/** Maestro: 50 rutas + 400 km (cadena de logros). */
function GlyphChainMaster(p: GlyphCommon) {
  const { ring, accent } = p;
  const inner = (
    <>
      <g fill="none" stroke={accent} strokeWidth={1.5} strokeLinecap="round">
        <ellipse cx="21" cy="19" rx="4.5" ry="3.2" />
        <ellipse cx="35" cy="19" rx="4.5" ry="3.2" />
        <path d="M25.5 19 h5" stroke={ring} strokeWidth={2} />
      </g>
      <text x="28" y="32" textAnchor="middle" fill={accent} fontSize={7} fontWeight={900} fontFamily="system-ui, sans-serif">
        50 rutas
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={7} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        400 km
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Nunca superaste 120 km/h: señal tipo “límite” en verde + check. */
function GlyphPrudent(p: GlyphCommon) {
  const { ring, accent, core } = p;
  const inner = (
    <>
      <circle cx="28" cy="29" r="13" fill={core} stroke="#22c55e" strokeWidth={2.8} />
      <circle cx="28" cy="29" r="10.5" fill="#14532d" opacity={0.45} />
      <path d="M21 29 L25.5 33.5 L35 22" fill="none" stroke={accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <text x="28" y="18" textAnchor="middle" fill={accent} fontSize="8" fontWeight={900} fontFamily="system-ui, sans-serif">
        máx 120
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} opacity={0.85}>
        km/h
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Máximo &lt; 90 km/h: tortuga + tope de velocidad. */
function GlyphTurtle(p: GlyphCommon) {
  const { ring, accent } = p;
  const inner = (
    <>
      <ellipse cx="26" cy="30" rx="11" ry="6.5" fill={accent} fillOpacity={0.25} stroke={ring} strokeWidth={1} />
      <ellipse cx="26" cy="29" rx="7" ry="4.5" fill={accent} fillOpacity={0.35} stroke={ring} strokeWidth={0.6} />
      <path d="M17 30 Q22 26 26 28 Q30 26 35 30" fill="none" stroke={ring} strokeWidth={0.9} opacity={0.55} />
      <circle cx="36" cy="27" r="3.2" fill={accent} stroke={ring} strokeWidth={0.7} />
      <circle cx="35.2" cy="26.2" r="0.9" fill={ring} />
      <path d="M15 29 L12 29 M15 31 L11 31" stroke={accent} strokeWidth={1.6} strokeLinecap="round" />
      <text x="28" y="16" textAnchor="middle" fill={accent} fontSize="9" fontWeight={900} fontFamily="system-ui, sans-serif">
        ≤90
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} opacity={0.8}>
        km/h máx
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
      <text x="28" y="14" textAnchor="middle" fill={accent} fontSize="8" fontWeight={900} fontFamily="system-ui, sans-serif">
        ≥120 km/h
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
      <text x="28" y="13" textAnchor="middle" fill={accent} fontSize="10" fontWeight={900} fontFamily="system-ui, sans-serif">
        ≥150 km/h
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Parada café: taza + requisitos 10 rutas / 80 km. */
function GlyphCoffeeLoop(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const lineA = '10 rutas';
  const lineB = '80 km';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-cup`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.4} />
          <stop offset="100%" stopColor="#44403c" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <path
        d="M17 14 h10 q2.5 0 2.5 2.5 v5 q0 2.5 -2.5 2.5 h-8 q-2.5 0 -2.5 -2.5 v-5 q0 -2.5 2.5 -2.5"
        fill={`url(#${defsId}-cup)`}
        stroke={accent}
        strokeWidth={0.9}
      />
      <path d="M27.5 16 h3 q1.2 0 1.2 1.5 v1.2" fill="none" stroke={accent} strokeWidth={0.9} strokeLinecap="round" />
      <g stroke={accent} strokeWidth={0.7} strokeLinecap="round" fill="none" opacity={0.65}>
        <path d="M20 11 Q20.5 9 21 11" />
        <path d="M22 10.5 Q22.5 8.5 23 10.5" />
        <path d="M24 11 Q24.5 9 25 11" />
      </g>
      <text x="28" y="33" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Rosa de los vientos + 100 curvas y 15 rutas. */
function GlyphCompassRose(p: GlyphCommon) {
  const { ring, accent, defsId, core } = p;
  const lineA = '100 curvas';
  const lineB = '15 rutas';
  const fs = dualStatFontSize(lineA, lineB);
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
      <circle cx="28" cy="17" r="7.5" fill="none" stroke={accent} strokeWidth={0.45} strokeOpacity={0.38} />
      <circle cx="28" cy="17" r="1.6" fill={core} stroke={accent} strokeWidth={0.55} />
      <path d="M28 11 L30.5 18 L28 23 L25.5 18 Z" fill={`url(#${defsId}-n)`} stroke={ring} strokeWidth={0.35} />
      <path d="M21 17 L26.5 16 L35 17 L26.5 18 Z" fill={`url(#${defsId}-s)`} stroke={ring} strokeWidth={0.35} />
      <text x="28" y="10.5" textAnchor="middle" fill={accent} fontSize="5" fontWeight={900}>
        N
      </text>
      <text x="28" y="30" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="40" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Peregrino: vieira + 1000 km y 20 rutas (Camino). */
function GlyphPeregrino(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const lineA = '1000 km';
  const lineB = '20 rutas';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <defs>
        <radialGradient id={`${defsId}-shell`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.35} />
        </radialGradient>
      </defs>
      <path
        d="M28 12 Q37 19 36 26 Q35 31 28 33 Q21 31 20 26 Q19 19 28 12"
        fill={`url(#${defsId}-shell)`}
        stroke={ring}
        strokeWidth={1.1}
      />
      <path d="M28 16 Q31 21 28 30 Q25 21 28 16" fill="none" stroke={accent} strokeWidth={0.85} strokeLinecap="round" opacity={0.75} />
      <text x="28" y="36" textAnchor="middle" fill={accent} fontSize={Math.min(fs, 7)} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="42.5" textAnchor="middle" fill={ring} fontSize={Math.min(fs, 7)} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Cazador de curvas: 150 curvas + 300 km + mira sobre una S. */
function GlyphCurveHunter(p: GlyphCommon) {
  const { ring, accent } = p;
  const lineA = '150 curvas';
  const lineB = '300 km';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <path
        d="M10 18 Q18 14 24 20 Q30 26 38 16"
        fill="none"
        stroke={ring}
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.75}
      />
      <circle cx="28" cy="17" r="6.5" fill="none" stroke={accent} strokeWidth={1} opacity={0.85} />
      <path d="M24 14 L32 20 M32 14 L24 20" stroke={accent} strokeWidth={0.9} strokeLinecap="round" opacity={0.55} />
      <circle cx="28" cy="17" r="1.4" fill={accent} />
      <text x="28" y="32" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Ruta plateada: 800 km + 40 rutas + triángulo plateado (tramo). */
function GlyphSilverRoad(p: GlyphCommon) {
  const { accent, defsId, ring } = p;
  const lineA = '800 km';
  const lineB = '40 rutas';
  const fs = dualStatFontSize(lineA, lineB);
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
        d="M17 22 L28 12 L39 22"
        fill="none"
        stroke={`url(#${defsId}-ag)`}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
      <text x="28" y="32" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Odisea dorada: 2000 km + 75 rutas + sol (viaje largo). */
function GlyphGoldOdyssey(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const lineA = '2000 km';
  const lineB = '75 rutas';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <defs>
        <radialGradient id={`${defsId}-sun`} cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fde047" stopOpacity={0.95} />
          <stop offset="70%" stopColor={accent} stopOpacity={0.65} />
          <stop offset="100%" stopColor={ring} stopOpacity={0.3} />
        </radialGradient>
      </defs>
      <circle cx="28" cy="16" r="7" fill={`url(#${defsId}-sun)`} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = ((deg - 90) * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={28 + 8 * Math.cos(r)}
            y1={16 + 8 * Math.sin(r)}
            x2={28 + 10.5 * Math.cos(r)}
            y2={16 + 10.5 * Math.sin(r)}
            stroke="#facc15"
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      })}
      <text x="28" y="31" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Cromado: 300 curvas + 600 km + brillo tipo depósito. */
function GlyphMirrorPolish(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const lineA = '300 curvas';
  const lineB = '600 km';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-chrome`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
          <stop offset="40%" stopColor={accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor="#71717a" stopOpacity={0.5} />
        </linearGradient>
      </defs>
      <ellipse cx="28" cy="17" rx="9" ry="5" fill="none" stroke={`url(#${defsId}-chrome)`} strokeWidth={1.6} opacity={0.75} />
      <path d="M18 15 L22 20 M38 15 L34 20" stroke="#f4f4f5" strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
      <text x="28" y="32" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Mula: 200 km + 10 rutas (carga constante). */
function GlyphMule(p: GlyphCommon) {
  const { ring, accent } = p;
  const lineA = '200 km';
  const lineB = '10 rutas';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <path
        d="M16 18 h8 l2 4 h-12 l2 -4 z"
        fill={accent}
        fillOpacity={0.2}
        stroke={accent}
        strokeWidth={0.9}
      />
      <path
        d="M32 18 h8 l2 4 h-12 l2 -4 z"
        fill={accent}
        fillOpacity={0.2}
        stroke={accent}
        strokeWidth={0.9}
      />
      <path d="M22 18 v-3 M34 18 v-3" stroke={ring} strokeWidth={1.2} strokeLinecap="round" />
      <text x="28" y="15" textAnchor="middle" fill={accent} fontSize="5.5" fontWeight={900} opacity={0.8}>
        alforjas
      </text>
      <text x="28" y="33" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Espíritu libre: dados + azar (sin regla fija). */
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
      <text x="28" y="13" textAnchor="middle" fill={accent} fontSize="11" fontWeight={900} fontFamily="system-ui, sans-serif">
        ?
      </text>
      <text x="28" y="44" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} opacity={0.75}>
        al azar
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Primera ruta terminada: meta + “1 ruta”. */
function GlyphFirstRide(p: GlyphCommon) {
  const { ring, accent, core } = p;
  const inner = (
    <>
      <path d="M17 13 v20" stroke={ring} strokeWidth={2} strokeLinecap="round" />
      <path d="M17 13 Q23 12.5 29 14 L29 21 Q23 20.5 17 20 Z" fill={core} stroke={accent} strokeWidth={0.75} />
      <g>
        <rect x="18" y="14" width="4.5" height="4.5" fill={accent} />
        <rect x="23.5" y="14" width="4.5" height="4.5" fill="#fafafa" opacity={0.92} />
        <rect x="18" y="18.5" width="4.5" height="4.5" fill="#fafafa" opacity={0.92} />
        <rect x="23.5" y="18.5" width="4.5" height="4.5" fill={accent} />
      </g>
      <text x="28" y="36" textAnchor="middle" fill={accent} fontSize="11" fontWeight={900} fontFamily="system-ui, sans-serif">
        1ª ruta
      </text>
      <text x="28" y="42" textAnchor="middle" fill={ring} fontSize="5.5" fontWeight={700} opacity={0.8}>
        meta
      </text>
    </>
  );
  return wrapMedal(p, inner);
}

/** Noche: 500 km + 25 rutas + luna. */
function GlyphNightStyle(p: GlyphCommon) {
  const { ring, accent, defsId } = p;
  const lineA = '500 km';
  const lineB = '25 rutas';
  const fs = dualStatFontSize(lineA, lineB);
  const inner = (
    <>
      <defs>
        <linearGradient id={`${defsId}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e0e7ff" stopOpacity={0.95} />
          <stop offset="100%" stopColor={accent} stopOpacity={0.45} />
        </linearGradient>
      </defs>
      <path
        d="M38 13 A8 8 0 1 1 26 16 A8 8 0 0 0 38 13"
        fill={`url(#${defsId}-moon)`}
        opacity={0.92}
        stroke={accent}
        strokeWidth={0.3}
        strokeOpacity={0.35}
      />
      <circle cx="18" cy="15" r="0.9" fill="#f8fafc" opacity={0.9} />
      <circle cx="40" cy="19" r="0.7" fill="#f8fafc" opacity={0.85} />
      <text x="28" y="31" textAnchor="middle" fill={accent} fontSize={fs} fontWeight={900} fontFamily="system-ui, sans-serif">
        {lineA}
      </text>
      <text x="28" y="41" textAnchor="middle" fill={ring} fontSize={fs} fontWeight={800} fontFamily="system-ui, sans-serif" opacity={0.95}>
        {lineB}
      </text>
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
    const km = KM_DISTANCE_BY_ID[id];
    if (km === undefined) return <GlyphFallbackTrophy {...p} />;
    return <GlyphKm {...p} km={km} />;
  }
  if (id === 'first_ride') {
    return <GlyphFirstRide {...p} />;
  }
  if (RIDES_MEDAL_IDS.has(id)) {
    const c = RIDES_COUNT_BY_ID[id];
    if (c === undefined) return <GlyphFallbackTrophy {...p} />;
    return <GlyphRides {...p} count={c} />;
  }
  if (CURVES_MEDAL_IDS.has(id)) {
    const c = CURVE_COUNT_BY_ID[id];
    if (c === undefined) return <GlyphFallbackTrophy {...p} />;
    return <GlyphCurves {...p} count={c} />;
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
      return <GlyphChainMaster {...p} />;
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
