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

/** Cinta inferior común (tipo medalla colgante). */
function Ribbon({ accent }: { accent: string }) {
  return <path d="M28 46 L22 54 L28 50 L34 54 Z" fill={accent} opacity={0.92} />;
}

/** Carretera en perspectiva + rueda (kilómetros). */
function GlyphKm({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M28 14 L34 38 L22 38 Z" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" opacity={0.9} />
      <path d="M18 20 L28 14 L38 20" fill="none" stroke={ring} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="28" cy="40" r="5.5" fill="none" stroke={accent} strokeWidth="2" />
      <circle cx="28" cy="40" r="2" fill={accent} opacity={0.85} />
      <path d="M12 42 h32" stroke={ring} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Manillar visto desde arriba (rutas / salidas). */
function GlyphRides({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path
        d="M14 28 Q28 16 42 28"
        fill="none"
        stroke={accent}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="28" r="3" fill={ring} />
      <circle cx="40" cy="28" r="3" fill={ring} />
      <rect x="25" y="22" width="6" height="14" rx="1.5" fill={accent} opacity={0.35} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Tramo revirado (curvas). */
function GlyphCurves({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path
        d="M12 36 Q20 14 28 24 T44 20"
        fill="none"
        stroke={accent}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M14 40 Q26 28 36 38 Q30 44 18 40"
        fill="none"
        stroke={ring}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.75}
      />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Moto de perfil con arco de inclinación. */
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
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <g transform="rotate(-12 28 32)">
        <circle cx="22" cy="38" r="4.5" fill="none" stroke={accent} strokeWidth="1.8" />
        <circle cx="36" cy="38" r="4.5" fill="none" stroke={accent} strokeWidth="1.8" />
        <path
          d="M18 34 Q28 18 38 32 L36 36 L20 36 Z"
          fill={ring}
          opacity={0.45}
          stroke={accent}
          strokeWidth="1.2"
        />
        <path d="M30 22 L34 14 L38 20" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      </g>
      <path d="M10 44 Q28 8 46 44" fill="none" stroke={accent} strokeWidth="1" strokeDasharray="2 2" opacity={0.5} />
      <text x="28" y="14" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900">
        {label}
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Velocímetro estilo cuenta-km. */
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
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path
        d="M14 34 A14 14 0 0 1 42 34"
        fill="none"
        stroke={accent}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M28 34 L34 22" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="28" cy="34" r="2.5" fill={accent} />
      <text x="28" y="48" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900">
        {label}
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Escudo marchas / nivel. */
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
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M16 18 L40 18 L36 40 L20 40 Z" fill={ring} opacity={0.35} stroke={accent} strokeWidth="1.5" />
      <path d="M22 22 h12 M22 26 h10" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity={0.6} />
      <text x="28" y="36" textAnchor="middle" fill={accent} fontSize="13" fontWeight="900">
        {roman}
      </text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Cadena + estrella (logros combinados). */
function GlyphCombo({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <ellipse cx="22" cy="30" rx="5" ry="3.5" fill="none" stroke={accent} strokeWidth="1.8" />
      <ellipse cx="34" cy="30" rx="5" ry="3.5" fill="none" stroke={accent} strokeWidth="1.8" />
      <path d="M27 30 h2" stroke={ring} strokeWidth="2" />
      <path d="M28 16 L30 22 L36 22 L31 26 L33 32 L28 28 L23 32 L25 26 L20 22 L26 22 Z" fill={ring} opacity={0.85} />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** SVG distintivo por medalla (motivo motero, compacto para vitrina). */
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
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
          <path d="M28 12 v8 M24 16 h8" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <rect x="24" y="22" width="8" height="14" rx="2" fill="none" stroke={ring} strokeWidth="2" />
          <path d="M26 26 h4 M26 30 h3" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M18 40 Q28 34 38 40" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity={0.8} />
          <Ribbon accent={accent} />
        </svg>
      );
    case 'flash_prudente':
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
          <rect x="17" y="15" width="22" height="22" rx="3" fill="none" stroke={accent} strokeWidth="2" />
          <text x="28" y="30" textAnchor="middle" fill={accent} fontSize="11" fontWeight="900">
            120
          </text>
          <path d="M19 33 L37 19" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="40" cy="14" r="4" fill={ring} />
          <path d="M38.5 14 L40 15.5 L42.5 12" stroke={core} strokeWidth="1.2" fill="none" strokeLinecap="round" />
          <Ribbon accent={accent} />
        </svg>
      );
    case 'flash_veloz':
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
          <path d="M16 38 L24 18 L30 28 L38 14 L32 38 Z" fill={accent} opacity={0.92} />
          <path d="M12 22 L18 20 M40 24 L46 22" stroke={ring} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
          <text x="28" y="46" textAnchor="middle" fill={ring} fontSize="8" fontWeight="900">
            120+
          </text>
          <Ribbon accent={accent} />
        </svg>
      );
    case 'flash_tortuga':
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
          <ellipse cx="28" cy="30" rx="14" ry="9" fill={accent} opacity={0.28} />
          <circle cx="38" cy="26" r="4" fill={accent} />
          <path d="M14 32 Q20 28 26 32" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
          <text x="28" y="17" textAnchor="middle" fill={accent} fontSize="8" fontWeight="900">
            ≤90 km/h
          </text>
          <Ribbon accent={accent} />
        </svg>
      );
    case 'night_style':
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
          <path d="M38 14 A11 11 0 1 1 22 18" fill={accent} opacity={0.4} />
          <path d="M14 38 L20 32 L18 40 Z" fill={accent} opacity={0.5} />
          <circle cx="24" cy="16" r="1.2" fill={accent} />
          <circle cx="34" cy="18" r="0.9" fill={accent} />
          <path d="M28 36 L32 28 L36 36" fill="none" stroke={ring} strokeWidth="1.8" strokeLinejoin="round" />
          <Ribbon accent={accent} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
          <circle cx="28" cy="28" r="8" fill={accent} opacity={0.45} />
          <Ribbon accent={accent} />
        </svg>
      );
  }
}
