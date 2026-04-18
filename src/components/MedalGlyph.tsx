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
  if (id === 'speed_80') return '80+';
  if (id === 'speed_100') return '100+';
  if (id === 'speed_150') return '150+';
  return '';
}

/** SVG distintivo por medalla (motivo motero, compacto para vitrina). */
export default function MedalGlyph({ def, size = 56, className = '' }: Props) {
  const { id, ring, core, accent } = def;
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 56 56', className, 'aria-hidden': true as const };

  const ribbon = (
    <path d="M28 48 L22 56 L28 52 L34 56 Z" fill={accent} opacity={0.9} />
  );

  if (id.startsWith('km_')) {
    return (
      <svg {...common}>
        <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
        <ellipse cx="28" cy="26" rx="14" ry="5" fill="none" stroke={accent} strokeWidth="1.8" transform="rotate(-8 28 26)" />
        <circle cx="28" cy="26" r="4" fill={accent} opacity={0.85} />
        <path d="M16 26 Q28 14 40 26" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
        {ribbon}
      </svg>
    );
  }

  if (id.startsWith('curves_')) {
    return (
      <svg {...common}>
        <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
        <path d="M14 30 Q22 14 28 26 T42 28" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M16 34 Q26 22 36 32" fill="none" stroke={ring} strokeWidth="1.8" strokeLinecap="round" opacity={0.8} />
        {ribbon}
      </svg>
    );
  }

  if (id.startsWith('rides_')) {
    return (
      <svg {...common}>
        <rect x="12" y="14" width="32" height="22" rx="4" fill={core} stroke={ring} strokeWidth="2" />
        <path d="M18 22 h20 M18 28 h14" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <circle cx="40" cy="36" r="6" fill={ring} stroke={core} strokeWidth="1.5" />
        <circle cx="16" cy="36" r="6" fill={ring} stroke={core} strokeWidth="1.5" />
        {ribbon}
      </svg>
    );
  }

  if (id.startsWith('level_')) {
    return (
      <svg {...common}>
        <polygon points="28,8 46,22 38,44 18,44 10,22" fill={core} stroke={ring} strokeWidth="2.2" />
        <text x="28" y="32" textAnchor="middle" fill={accent} fontSize="12" fontWeight="900">
          {levelRomanLabel(id)}
        </text>
        {ribbon}
      </svg>
    );
  }

  if (id.startsWith('lean_')) {
    return (
      <svg {...common}>
        <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
        <path d="M38 14 L22 30 L18 26 L14 38 L26 34 L22 30" fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" />
        <text x="28" y="31" textAnchor="middle" fill={accent} fontSize="11" fontWeight="900">
          {leanDegreeLabel(id)}
        </text>
        {ribbon}
      </svg>
    );
  }

  if (id.startsWith('speed_')) {
    const lbl = speedTierLabel(id);
    return (
      <svg {...common}>
        <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
        <path d="M18 28 L24 20 L30 28 L38 18 L32 34 Z" fill={accent} opacity={0.92} />
        <text x="28" y="41" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900">
          {lbl}
        </text>
        {ribbon}
      </svg>
    );
  }

  if (id.startsWith('combo_')) {
    return (
      <svg {...common}>
        <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
        <path d="M16 28 Q28 12 40 28 Q28 40 16 28" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <path d="M28 16 L30 24 L38 22 L32 28 L38 34 L28 30 L18 34 L24 28 L18 22 L26 24 Z" fill={ring} opacity={0.35} />
        {ribbon}
      </svg>
    );
  }

  switch (id) {
    case 'spark_first_ride':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <path d="M28 12 L30 22 L40 20 L32 26 L38 34 L28 29 L18 34 L24 26 L16 20 L26 22 Z" fill={accent} />
          {ribbon}
        </svg>
      );
    case 'flash_prudente':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <rect x="20" y="18" width="16" height="14" rx="2" fill="none" stroke={accent} strokeWidth="2" />
          <path d="M24 22 h8 M24 26 h8 M24 30 h5" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="40" cy="16" r="5" fill={ring} />
          <path d="M38 16 L40 18 L43 13" stroke={core} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {ribbon}
        </svg>
      );
    case 'flash_veloz':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <path d="M18 32 L26 18 L30 26 L38 14 L32 34 Z" fill={accent} opacity={0.95} />
          <text x="28" y="40" textAnchor="middle" fill={accent} fontSize="8" fontWeight="900">
            120+
          </text>
          {ribbon}
        </svg>
      );
    case 'flash_tortuga':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <ellipse cx="26" cy="28" rx="12" ry="8" fill={accent} opacity={0.35} />
          <circle cx="34" cy="24" r="3.5" fill={accent} />
          <path d="M14 30 Q18 26 22 30" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
          {ribbon}
        </svg>
      );
    case 'night_style':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <path d="M36 16 A10 10 0 1 1 22 20" fill={accent} opacity={0.35} />
          <circle cx="20" cy="18" r="1.5" fill={accent} />
          <circle cx="34" cy="22" r="1" fill={accent} />
          <circle cx="26" cy="14" r="1" fill={accent} />
          {ribbon}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <circle cx="28" cy="26" r="8" fill={accent} opacity={0.5} />
          {ribbon}
        </svg>
      );
  }
}
