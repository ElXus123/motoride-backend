import type { MedalDefinition } from '../lib/achievements';

type Props = {
  def: MedalDefinition;
  size?: number;
  className?: string;
};

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
  if (id === 'lean_55') return '55°';
  return '°';
}

function speedTierLabel(id: string): string {
  if (id === 'speed_80') return '80';
  if (id === 'speed_100') return '100';
  if (id === 'speed_150') return '150';
  return '';
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

/** SVG distintivo por medalla estilo videojuego arcade de motos. */
export default function MedalGlyph({ def, size = 56, className = '' }: Props) {
  const { id, ring, core, accent } = def;
  const s = size;
  const commonClass = className;

  if (id.startsWith('km_')) {
    return <GlyphKm ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
  }
  if (id.startsWith('rides_')) {
    return <GlyphRides ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
  }
  if (id.startsWith('curves_')) {
    return <GlyphCurves ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
  }
  if (id.startsWith('lean_')) {
    return <GlyphLean ring={ring} core={core} accent={accent} label={leanDegreeLabel(id)} s={s} className={commonClass} />;
  }
  if (id.startsWith('speed_')) {
    return <GlyphSpeedo ring={ring} core={core} accent={accent} label={`${speedTierLabel(id)}+`} s={s} className={commonClass} />;
  }
  if (id.startsWith('level_')) {
    return <GlyphLevel ring={ring} core={core} accent={accent} roman={levelRomanLabel(id)} s={s} className={commonClass} />;
  }
  if (id.startsWith('combo_')) {
    return <GlyphCombo ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
  }

  const common = { width: s, height: s, viewBox: '0 0 56 56' as const, className: commonClass, 'aria-hidden': true as const };

  switch (id) {
    case 'spark_first_ride':
      // Primera salida - llanta girando
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
          {/* Llanas de acción */}
          <path d="M28 12 v8 M24 16 h8" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          {/* Centro */}
          <rect x="24" y="22" width="8" height="14" rx="2" fill="none" stroke={ring} strokeWidth="2" />
          {/* Detalles */}
          <path d="M26 26 h4 M26 30 h3" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
          {/* Trayectoria */}
          <path d="M18 40 Q28 34 38 40" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity={0.8} />
          <Ribbon accent={accent} />
        </svg>
      );
    case 'flash_prudente':
      // Conducto prudente - velocímetro en verde
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
          {/* Panel de velocímetro */}
          <rect x="17" y="15" width="22" height="22" rx="3" fill="none" stroke={accent} strokeWidth="2" />
          {/* Marcador */}
          <text x="28" y="30" textAnchor="middle" fill={accent} fontSize="11" fontWeight="900" fillOpacity={0.9}>
            120
          </text>
          {/* Línea de seguridad */}
          <path d="M19 33 L37 19" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
          {/* Señal verde */}
          <circle cx="40" cy="14" r="4" fill={ring} />
          {/* Rayo verde */}
          <path d="M38.5 14 L40 15.5 L42.5 12" stroke={core} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <Ribbon accent={accent} />
        </svg>
      );
    case 'flash_veloz':
      // Veloz - rayo de velocidad
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
          {/* Rayo */}
          <path d="M16 38 L24 18 L30 28 L38 14 L32 38 Z" fill={accent} opacity={0.92} />
          {/* Efecto de velocidad */}
          <path d="M12 22 L18 20 M40 24 L46 22" stroke={ring} strokeWidth="1.8" strokeLinecap="round" opacity={0.6} />
          {/* Velocidad */}
          <text x="28" y="46" textAnchor="middle" fill={ring} fontSize="8" fontWeight="900" fillOpacity={0.8}>
            120+
          </text>
          <Ribbon accent={accent} />
        </svg>
      );
    case 'flash_tortuga':
      // Tortuga - shell
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
          {/* Caparazón */}
          <ellipse cx="28" cy="30" rx="14" ry="9" fill={accent} opacity={0.28} />
          {/* Ojo */}
          <circle cx="38" cy="26" r="4" fill={accent} />
          {/* Camino */}
          <path d="M14 32 Q20 28 26 32" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
          {/* Velocidad */}
          <text x="28" y="17" textAnchor="middle" fill={accent} fontSize="8" fontWeight="900" fillOpacity={0.8}>
            ≤90 km/h
          </text>
          <Ribbon accent={accent} />
        </svg>
      );
    case 'night_style':
      // Noche - estrellas y luna
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
          {/* Luna */}
          <path d="M38 14 A11 11 0 1 1 22 18" fill={accent} opacity={0.4} />
          {/* Estrella */}
          <path d="M14 38 L20 32 L18 40 Z" fill={accent} opacity={0.5} />
          {/* Estrellas */}
          <circle cx="24" cy="16" r="1.5" fill={accent} />
          <circle cx="34" cy="18" r="1.2" fill={accent} />
          <circle cx="20" cy="35" r="1" fill={accent} />
          <circle cx="36" cy="35" r="1" fill={accent} />
          {/* Trayectoria */}
          <path d="M28 36 L32 28 L36 36" fill="none" stroke={ring} strokeWidth="1.8" strokeLinejoin="round" />
          <Ribbon accent={accent} />
        </svg>
      );
    default:
      // Default - trofeo
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.5" />
          {/* Trofeo */}
          <path d="M20 20 L12 36 L32 36 L24 20 Z" fill={accent} opacity={0.5} />
          {/* Copa */}
          <circle cx="28" cy="28" r="8" fill={accent} opacity={0.45} />
          {/* Brillo */}
          <circle cx="28" cy="22" r="4" fill="white" opacity={0.2} />
          <Ribbon accent={accent} />
        </svg>
      );
  }
}
