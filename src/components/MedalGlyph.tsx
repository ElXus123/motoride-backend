import type { MedalDefinition } from '../lib/achievements';

type Props = {
  def: MedalDefinition;
  size?: number;
  className?: string;
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

const RIDES_MEDAL_IDS = new Set(['first_ride', 'ten_rides', 'fifty_rides']);

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

/** Cinta inferior estilo cinta de medalla de videojuego. */
function Ribbon({ accent }: { accent: string }) {
  return <path d="M28 46 L22 54 L28 50 L34 54 Z" fill={accent} opacity={0.92} />;
}

/** Carretera en perspectiva + rueda (kilómetros) estilo arcade retro. */
function GlyphKm({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Anillo exterior con efecto brillo */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Efecto de velocidad - carriles */}
      <g stroke={accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" fill="none">
        <path d="M28 12 L29.5 32 M27 14 L28.5 34 M28.5 13 L27 33" />
        <path d="M38 20 L37.5 36 M36.5 21 L35.5 37 M39 19 L38.5 35" />
      </g>
      {/* Rueda con textura de neumático */}
      <g fill="none" stroke={accent} strokeWidth="2">
        <circle cx="28" cy="40" r="6" />
        <circle cx="28" cy="40" r="3" />
        <circle cx="28" cy="40" r="1" fill={accent} />
      </g>
      {/* Sombra de velocidad */}
      <path d="M12 42 h32" stroke={ring} strokeWidth="1.5" strokeLinecap="round" opacity={0.4} />
      {/* Cinta inferior */}
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Manillar visto desde arriba (rutas / salidas) estilo motocross. */
function GlyphRides({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Contenedor */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Tráfico - dos líneas paralelas */}
      <path
        d="M14 28 Q28 16 42 28"
        fill="none"
        stroke={accent}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M17 24 Q28 12 39 24"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.7}
      />
      {/* Punto de inicio y final */}
      <circle cx="16" cy="28" r="3.5" fill={ring} stroke={accent} strokeWidth="1" />
      <circle cx="40" cy="28" r="3.5" fill={ring} stroke={accent} strokeWidth="1" />
      {/* Centro de la ruta */}
      <rect x="25" y="22" width="6" height="14" rx="2" fill={accent} opacity={0.35} />
      {/* Brillo de velocidad */}
      <circle cx="28" cy="27" r="12" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="2 2" opacity={0.3} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Tramo revirado (curvas) estilo rally raid. */
function GlyphCurves({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Anillo */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Curva principal */}
      <path
        d="M12 36 Q20 14 28 24 T44 20"
        fill="none"
        stroke={accent}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Trazo secundario - línea de curva */}
      <path
        d="M14 40 Q26 28 36 38 Q30 44 18 40"
        fill="none"
        stroke={ring}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.75}
      />
      {/* Detalles de rally */}
      <circle cx="28" cy="27" r="8" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="2 2" opacity={0.3} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Moto de perfil con arco de inclinación estilo videojuego arcade. */
function GlyphLean({
  ring,
  core,
  accent,
  label,
  s,
  className,
}: {
  ring: string;
  core: string;
  accent: string;
  label: string;
  s: number;
  className?: string;
}) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Anillo con brillo */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Sombra de inclinación */}
      <path d="M10 44 Q28 8 46 44" fill="none" stroke={accent} strokeWidth="1.5" strokeDasharray="2 2" opacity={0.5} />
      {/* Arco de inclinación */}
      <g transform="rotate(-12 28 32)">
        {/* Sombra */}
        <circle cx="22" cy="38" r="5" fill="none" stroke={accent} strokeWidth="2" opacity={0.4} />
        <circle cx="36" cy="38" r="5" fill="none" stroke={accent} strokeWidth="2" opacity={0.4} />
        {/* Forma principal de inclinación */}
        <path
          d="M18 34 Q28 18 38 32 L36 36 L20 36 Z"
          fill={ring}
          opacity={0.45}
          stroke={accent}
          strokeWidth="1.5"
        />
        {/* Líneas de aceleración */}
        <path d="M30 22 L34 14 L38 20" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
      </g>
      {/* Nivel label */}
      <text x="28" y="14" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900" fillOpacity={0.8}>
        {label}
      </text>
      {/* Cinta */}
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Velocímetro estilo cuenta-km retro arcade. */
function GlyphSpeedo({
  ring,
  core,
  accent,
  label,
  s,
  className,
}: {
  ring: string;
  core: string;
  accent: string;
  label: string;
  s: number;
  className?: string;
}) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Velocímetro circular */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Marcador de velocidad */}
      <path
        d="M14 34 A14 14 0 0 1 42 34"
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Agujas */}
      <path d="M28 34 L34 22" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="34" cy="22" r="1.5" fill={accent} />
      {/* Centro */}
      <circle cx="28" cy="34" r="2.5" fill={accent} />
      {/* Marcador de velocidad */}
      <text x="28" y="48" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900" fillOpacity={0.8}>
        {label}
      </text>
      {/* Brillo */}
      <circle cx="28" cy="27" r="14" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity={0.25} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Escudo marchas / nivel estilo arcade de carreras. */
function GlyphLevel({
  ring,
  core,
  accent,
  roman,
  s,
  className,
}: {
  ring: string;
  core: string;
  accent: string;
  roman: string;
  s: number;
  className?: string;
}) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Escudo */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Base del nivel */}
      <path d="M16 18 L40 18 L36 40 L20 40 Z" fill={ring} opacity={0.35} stroke={accent} strokeWidth="1.8" />
      {/* Barra de progreso */}
      <path d="M22 22 h12 M22 26 h10" stroke={accent} strokeWidth="1.6" strokeLinecap="round" opacity={0.6} />
      {/* Rombo central */}
      <path d="M28 18 L30 25 L28 32 L26 25 Z" fill={accent} opacity={0.2} />
      {/* Nivel */}
      <text x="28" y="36" textAnchor="middle" fill={accent} fontSize="13" fontWeight="900" fillOpacity={0.9}>
        {roman}
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Cadena + estrella (logros combinados) estilo mecánica. */
function GlyphCombo({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      {/* Contenedor */}
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      {/* Cadena central */}
      <g fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round">
        <ellipse cx="22" cy="30" rx="5" ry="3.5" />
        <ellipse cx="34" cy="30" rx="5" ry="3.5" />
        {/* Enlace */}
        <path d="M27 30 h2" stroke={ring} strokeWidth="2.2" />
      </g>
      {/* Estrella central */}
      <path d="M28 16 L30 22 L36 22 L31 26 L33 32 L28 28 L23 32 L25 26 L20 22 L26 22 Z" fill={ring} opacity={0.85} />
      {/* Detalles mecánicos */}
      <circle cx="22" cy="30" r="2.5" fill={ring} opacity={0.5} />
      <circle cx="34" cy="30" r="2.5" fill={ring} opacity={0.5} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Conductor prudente: techo 120 km/h — escudo + tope. */
function GlyphPrudent({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path
        d="M18 18 h20 l-2 22 h-16 Z"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 22 L26 26 L32 20" fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="28" y="38" textAnchor="middle" fill={accent} fontSize="8" fontWeight="900" fillOpacity={0.95}>
        {'<120'}
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Tortuga: ritmo tranquilo. */
function GlyphTurtle({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <ellipse cx="28" cy="31" rx="13" ry="8" fill={accent} opacity={0.28} />
      <circle cx="38" cy="27" r="3.5" fill={accent} />
      <path d="M15 33 Q22 29 28 33" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
      <text x="28" y="17" textAnchor="middle" fill={accent} fontSize="7.5" fontWeight="900" fillOpacity={0.85}>
        ≤90
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Superar 120 — rayo / punta de lanza. */
function GlyphSpeedCrack({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M18 38 L26 18 L30 28 L38 14 L32 38 Z" fill={accent} opacity={0.92} />
      <text x="28" y="46" textAnchor="middle" fill={ring} fontSize="8" fontWeight="900" fillOpacity={0.9}>
        120+
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Huracán — viento + 150. */
function GlyphHuracan({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path
        d="M14 22 Q28 14 42 22 M16 30 Q28 22 40 30 M18 38 Q28 30 38 38"
        fill="none"
        stroke={accent}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <text x="28" y="48" textAnchor="middle" fill={accent} fontSize="10" fontWeight="900" fillOpacity={0.95}>
        150
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Café + asfalto corto. */
function GlyphCoffeeLoop({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M20 22 h10 q4 0 4 4 v6 q0 4 -4 4 h-8 q-4 0 -4 -4 v-6 q0 -4 4 -4" fill="none" stroke={accent} strokeWidth="1.8" />
      <path d="M30 24 h4 q2 0 2 2 v2" fill="none" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M22 38 Q28 32 34 38" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" opacity={0.8} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Rosa de los vientos. */
function GlyphCompassRose({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <circle cx="28" cy="28" r="2.5" fill={accent} />
      <path d="M28 14 L30 26 L28 38 L26 26 Z" fill={accent} opacity={0.45} />
      <path d="M14 28 L26 26 L42 28 L26 30 Z" fill={ring} opacity={0.5} />
      <path d="M28 14 L32 26 M28 38 L32 26 M14 28 L26 28 M42 28 L32 28" stroke={accent} strokeWidth="1.2" strokeLinecap="round" opacity={0.7} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Peregrino — vieira. */
function GlyphPeregrino({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path
        d="M28 16 Q38 24 36 34 Q34 40 28 42 Q22 40 20 34 Q18 24 28 16"
        fill={accent}
        opacity={0.35}
        stroke={ring}
        strokeWidth="1.5"
      />
      <path d="M28 22 v12 M24 28 h8" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity={0.8} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Cazador de curvas — mira + eses. */
function GlyphCurveHunter({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <circle cx="28" cy="28" r="12" fill="none" stroke={accent} strokeWidth="1.5" />
      <circle cx="28" cy="28" r="2" fill={accent} />
      <path d="M16 18 L40 38 M40 18 L16 38" stroke={accent} strokeWidth="1.2" opacity={0.5} />
      <path d="M14 36 Q22 20 30 28 T46 22" fill="none" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Ruta plateada — carretera metálica. */
function GlyphSilverRoad({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M18 38 L28 14 L38 38" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <path d="M24 30 h8 M26 34 h4" stroke={accent} strokeWidth="1.2" strokeLinecap="round" opacity={0.6} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Odisea dorada — sol sobre horizonte. */
function GlyphGoldOdyssey({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <circle cx="28" cy="22" r="8" fill={accent} opacity={0.35} />
      <path d="M12 36 h32" stroke={ring} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 34 Q28 30 42 34" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" opacity={0.85} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Cromado — reflejos en V. */
function GlyphMirrorPolish({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M16 20 L22 38 M40 20 L34 38" stroke={accent} strokeWidth="2.5" strokeLinecap="round" opacity={0.85} />
      <path d="M20 18 L28 40 L36 18" fill="none" stroke={ring} strokeWidth="1.4" strokeLinecap="round" opacity={0.5} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Mula — carga (sacos) + ruta. */
function GlyphMule({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <rect x="18" y="22" width="20" height="14" rx="2" fill="none" stroke={accent} strokeWidth="2" />
      <path d="M22 22 v-4 M34 22 v-4" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 38 Q28 32 42 38" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Espíritu libre — dados. */
function GlyphWildcard({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <rect x="17" y="17" width="22" height="22" rx="3" fill="none" stroke={accent} strokeWidth="2" transform="rotate(-8 28 28)" />
      <circle cx="24" cy="24" r="2" fill={accent} transform="rotate(-8 28 28)" />
      <circle cx="32" cy="32" r="2" fill={accent} transform="rotate(-8 28 28)" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Primera ruta — bandera a cuadros + rueda. */
function GlyphFirstRide({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M19 15 v24" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="21" y="15" width="4" height="4" fill={accent} />
      <rect x="25" y="15" width="4" height="4" fill={core} />
      <rect x="21" y="19" width="4" height="4" fill={core} />
      <rect x="25" y="19" width="4" height="4" fill={accent} />
      <circle cx="28" cy="38" r="5" fill="none" stroke={accent} strokeWidth="1.8" />
      <circle cx="28" cy="38" r="2" fill={accent} opacity={0.6} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Noche — luna y estrellas (500 km + 25 rutas). */
function GlyphNightStyle({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M38 14 A11 11 0 1 1 22 18" fill={accent} opacity={0.4} />
      <circle cx="24" cy="16" r="1.5" fill={accent} />
      <circle cx="34" cy="18" r="1.2" fill={accent} />
      <circle cx="20" cy="35" r="1" fill={accent} />
      <circle cx="36" cy="35" r="1" fill={accent} />
      <path d="M28 36 L32 28 L36 36" fill="none" stroke={ring} strokeWidth="1.8" strokeLinejoin="round" />
      <Ribbon accent={accent} />
    </svg>
  );
}

function GlyphFallbackTrophy({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
      <path d="M20 20 L12 36 L32 36 L24 20 Z" fill={accent} opacity={0.5} />
      <circle cx="28" cy="28" r="8" fill={accent} opacity={0.45} />
      <circle cx="28" cy="22" r="4" fill="white" opacity={0.2} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** SVG distintivo por medalla estilo videojuego arcade de motos. */
export default function MedalGlyph({ def, size = 56, className = '' }: Props) {
  const { id, ring, core, accent } = def;
  const s = size;
  const commonClass = className;
  const p = { ring, core, accent, s, className: commonClass };

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
