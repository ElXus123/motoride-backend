import type { MedalDefinition } from '../lib/achievements';

type Props = {
  def: MedalDefinition;
  size?: number;
  className?: string;
};

/** SVG distintivo por medalla (motivo motero, compacto para vitrina). */
export default function MedalGlyph({ def, size = 56, className = '' }: Props) {
  const { id, ring, core, accent } = def;
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 56 56', className, 'aria-hidden': true as const };

  const ribbon = (
    <path
      d="M28 48 L22 56 L28 52 L34 56 Z"
      fill={accent}
      opacity={0.9}
    />
  );

  switch (id) {
    case 'spark_first_ride':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <path d="M28 12 L30 22 L40 20 L32 26 L38 34 L28 29 L18 34 L24 26 L16 20 L26 22 Z" fill={accent} />
          {ribbon}
        </svg>
      );
    case 'km_50':
    case 'km_100':
    case 'km_200':
    case 'km_500':
    case 'km_1000':
    case 'km_2500':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <ellipse cx="28" cy="26" rx="14" ry="5" fill="none" stroke={accent} strokeWidth="1.8" transform="rotate(-8 28 26)" />
          <circle cx="28" cy="26" r="4" fill={accent} opacity={0.85} />
          <path d="M16 26 Q28 14 40 26" fill="none" stroke={ring} strokeWidth="2" strokeLinecap="round" />
          {ribbon}
        </svg>
      );
    case 'lean_epic_45':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <path d="M38 14 L22 30 L18 26 L14 38 L26 34 L22 30" fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" />
          <text x="28" y="31" textAnchor="middle" fill={accent} fontSize="11" fontWeight="900">
            45°
          </text>
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
    case 'curves_100':
    case 'curves_500':
      return (
        <svg {...common}>
          <circle cx="28" cy="26" r="20" fill={core} stroke={ring} strokeWidth="2.5" />
          <path d="M14 30 Q22 14 28 26 T42 28" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M16 34 Q26 22 36 32" fill="none" stroke={ring} strokeWidth="1.8" strokeLinecap="round" opacity={0.8} />
          {ribbon}
        </svg>
      );
    case 'rides_10':
    case 'rides_50':
      return (
        <svg {...common}>
          <rect x="12" y="14" width="32" height="22" rx="4" fill={core} stroke={ring} strokeWidth="2" />
          <path d="M18 22 h20 M18 28 h14" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          <circle cx="40" cy="36" r="6" fill={ring} stroke={core} strokeWidth="1.5" />
          <circle cx="16" cy="36" r="6" fill={ring} stroke={core} strokeWidth="1.5" />
          {ribbon}
        </svg>
      );
    case 'level_5':
    case 'level_10':
      return (
        <svg {...common}>
          <polygon points="28,8 46,22 38,44 18,44 10,22" fill={core} stroke={ring} strokeWidth="2.2" />
          <text x="28" y="32" textAnchor="middle" fill={accent} fontSize="14" fontWeight="900">
            {id === 'level_10' ? 'X' : 'V'}
          </text>
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
