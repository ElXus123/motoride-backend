/**
 * Medallas / logros derivados de estadísticas en `users/{uid}`.
 * Diseño temático de mundo motero con SVGs personalizados.
 */

import { calculateLevel } from './utils';

export type UserMedalStats = {
  totalDistance?: unknown;
  totalLeftTurns?: unknown;
  totalRightTurns?: unknown;
  statsMaxSpeedKmh?: unknown;
  statsMaxLeanDeg?: unknown;
  ridesCompletedCount?: unknown;
  statsHadSpeedSample?: unknown;
  level?: unknown;
  points?: unknown;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v: unknown): boolean {
  return v === true;
}

function effectiveLevel(u: UserMedalStats): number {
  const pts = num(u.points);
  const lv = Math.max(1, Math.floor(Number(u.level) || 1));
  try {
    return calculateLevel(pts, lv).level;
  } catch {
    return lv;
  }
}

function totalCurves(u: UserMedalStats): number {
  return num(u.totalLeftTurns) + num(u.totalRightTurns);
}

export type MedalDefinition = {
  id: string;
  title: string;
  subtitle: string;
  ring: string;
  core: string;
  accent: string;
  isUnlocked: (u: UserMedalStats) => boolean;
};

// ====== HELMET ICONS (Casco de carreras con detalles) ======
function HelmetBase({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Carenado frontal */}
      <path d="M18 22 L22 10 L34 10 L38 22 Z" fill="none" stroke={accent} strokeWidth="2.5" />
      {/* Visera transparente */}
      <ellipse cx="28" cy="18" rx="10" ry="6" fill={accent} opacity="0.2" stroke="none" />
      {/* Aletas de ventilación */}
      <path d="M20 24 L20 28 L24 28 L24 24" fill="none" stroke={ring} strokeWidth="1.5" />
      <path d="M36 24 L36 28 L32 28 L32 24" fill="none" stroke={ring} strokeWidth="1.5" />
      {/* Logo central (estilo marca de casco) */}
      <circle cx="28" cy="28" r="6" fill={accent} opacity="0.3" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== CHAIN & SPROCKET ICONS (Cadena y piñón) ======
function ChainIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Piñón dentado */}
      <path d="M28 14 m-4 0 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0" fill="none" stroke={accent} strokeWidth="2" />
      {/* Cadena */}
      <ellipse cx="16" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="24" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="32" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="40" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="48" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      {/* Eslabones cruzados */}
      <path d="M20 26 h4 M28 22 h2" stroke={ring} strokeWidth="1.8" />
      <path d="M32 30 h4" stroke={ring} strokeWidth="1.8" />
      <path d="M26 24 v2 M34 28 v2" stroke={ring} strokeWidth="1.8" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== TIRE/SPOKES ICONS (Rueda con radios) ======
function TireIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Neumático */}
      <circle cx="28" cy="27" r="17" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
      {/* Llanta */}
      <circle cx="28" cy="27" r="13" fill="none" stroke={ring} strokeWidth="2.5" />
      {/* Radios */}
      <line x1="28" y1="14" x2="28" y2="40" stroke={accent} strokeWidth="1.5" />
      <line x1="16" y1="20" x2="40" y2="20" stroke={accent} strokeWidth="1.5" />
      <line x1="22" y1="12" x2="34" y2="40" stroke={accent} strokeWidth="1.5" />
      <line x1="34" y1="12" x2="22" y2="40" stroke={accent} strokeWidth="1.5" />
      {/* Pinchos / tacos de nieve */}
      <circle cx="20" cy="20" r="2" fill={accent} opacity="0.7" />
      <circle cx="36" cy="24" r="2" fill={accent} opacity="0.7" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== EXHAUST ICON (Escape / Escape pipe) ======
function ExhaustIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Tubo de escape */}
      <path d="M16 32 L34 32 L46 26 L48 20 L46 14 L28 8 L10 14 L8 20 L10 26 Z" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      {/* Salidas de escape */}
      <ellipse cx="12" cy="22" rx="3" ry="2" fill={accent} opacity="0.6" />
      <ellipse cx="44" cy="22" rx="3" ry="2" fill={accent} opacity="0.6" />
      {/* Fuego / gases */}
      <path d="M10 22 l-3 -2 M44 22 l3 -2" stroke={accent} strokeWidth="1" opacity="0.4" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== GAS TANK ICON (Depósito de combustible) ======
function FuelIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Depósito */}
      <path d="M14 24 L12 16 L44 16 L42 24 L40 36 L28 42 L16 36 Z" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      {/* Nivel de combustible */}
      <path d="M16 32 L40 32 L40 28 L16 28 Z" fill={accent} opacity="0.7" />
      {/* Flama pequeña */}
      <path d="M42 24 Q46 22 48 24" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== OIL CAN ICON (Aceite) ======
function OilCanIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Can */}
      <path d="M22 32 Q28 42 34 32 L36 30 L30 18 L26 30 Z" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      {/* Gotas de aceite */}
      <circle cx="20" cy="36" r="3" fill={accent} opacity="0.6" />
      <circle cx="26" cy="38" r="2.5" fill={accent} opacity="0.5" />
      <circle cx="32" cy="37" r="3" fill={accent} opacity="0.6" />
      <circle cx="38" cy="35" r="2.5" fill={accent} opacity="0.5" />
      {/* Línea de nivel */}
      <path d="M26 26 L30 26" stroke={ring} strokeWidth="1.5" opacity="0.6" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== SPEEDOMETER ICON (Velocímetro) ======
function SpeedometerIcon({ ring, core, accent, label, s }: { ring: string; core: string; accent: string; label: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Marcador */}
      <path d="M28 34 L35 24" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      {/* Escala */}
      <path d="M18 26 A8 8 0 0 1 38 26" fill="none" stroke={ring} strokeWidth="1.5" strokeDasharray="2 3" />
      {/* Aguja */}
      <path d="M28 34 L26 28 L24 22" stroke={ring} strokeWidth="2" fill="none" />
      {/* Número de velocidad */}
      <text x="28" y="46" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900">{label}</text>
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== FLAG CHECKER ICON (Fin de carrera) ======
function CheckeredFlagIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Bandera a cuadros */}
      <path d="M28 18 L46 24 L46 38 L28 44 L10 38 L10 24 Z" fill={accent} opacity="0.9" />
      {/* Cuadros */}
      <path d="M28 20 L32 24 L32 28 L28 32 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M32 28 L36 32 L36 36 L32 32 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M36 32 L40 36 L40 40 L36 36 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M10 26 L14 30 L14 34 L10 30 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M14 34 L18 38 L18 42 L14 38 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      {/* Poste */}
      <path d="M28 18 L28 44" stroke={ring} strokeWidth="2" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== PETROL PUMP ICON (Estación de servicio) ======
function PetrolPumpIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Bomba de gasolina */}
      <path d="M20 24 L20 18 L30 18 L30 24" fill="none" stroke={accent} strokeWidth="2" />
      <rect x="22" y="24" width="12" height="12" rx="2" fill={accent} opacity="0.4" stroke={ring} strokeWidth="1.5" />
      {/* Manguera */}
      <path d="M22 26 Q16 32 14 36" fill="none" stroke={ring} strokeWidth="1.8" strokeLinecap="round" />
      {/* Fuego en fondo */}
      <path d="M12 40 Q16 36 20 40 M36 40 Q40 36 44 40" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.5" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== GEAR SHIFT ICON (Cambios) ======
function GearShiftIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Palanca de cambios */}
      <circle cx="28" cy="27" r="6" fill="none" stroke={accent} strokeWidth="2.5" />
      <circle cx="28" cy="27" r="2" fill={accent} opacity="0.7" />
      {/* Diente de cambio */}
      <path d="M28 21 v4 M24 25 h4 M32 25 h4" stroke={ring} strokeWidth="1.8" strokeLinecap="round" />
      {/* Marca de velocidad */}
      <path d="M18 32 L24 26 L32 32 L38 26 L44 32" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round" opacity="0.6" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== CROWBAR / WRENCH ICON (Llave inglesa) ======
function WrenchIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Llave inglesa */}
      <path d="M28 24 l-3 4 l4 3 -2 4 l2 4 l-4 3 -3 4 l-4 -2 l-4 2 -3 -4 l-4 -3 2 -4 -2 -4 4 -3 3 -4 4 2 4 -2 3 4 4 3" fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== BATTERY ICON (Batería / eléctrica) ======
function BatteryIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Batería */}
      <path d="M18 24 L16 18 L40 18 L42 24 L40 36 L20 36 L18 32 Z" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      {/* Nivel de carga */}
      <path d="M20 26 L38 26 L38 28 L20 28 Z" fill={accent} opacity="0.7" />
      {/* Positivo */}
      <rect x="40" y="20" width="3" height="16" rx="1" fill={ring} />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== MAP ROUTE ICON (Ruta / GPS) ======
function MapRouteIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Ruta con waypoints */}
      <path d="M16 26 Q24 18 28 24 T40 22" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      {/* Waypoints */}
      <circle cx="16" cy="26" r="2.5" fill={ring} />
      <circle cx="28" cy="24" r="2.5" fill={ring} />
      <circle cx="40" cy="22" r="2.5" fill={ring} opacity="0.5" />
      {/* Agujas de mapa */}
      <path d="M24 30 L22 34 L28 36 L34 34 L32 30" fill="none" stroke={ring} strokeWidth="1.5" strokeLinejoin="round" opacity="0.6" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== CROSSHAIR ICON (Apuntado / precisión) ======
function CrosshairIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Retícula */}
      <circle cx="28" cy="27" r="12" fill="none" stroke={accent} strokeWidth="1.8" strokeDasharray="3 2" />
      <line x1="28" y1="18" x2="28" y2="44" stroke={accent} strokeWidth="1.5" />
      <line x1="18" y1="27" x2="44" y2="27" stroke={accent} strokeWidth="1.5" />
      {/* Punto central */}
      <circle cx="28" cy="27" r="1.5" fill={accent} />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== SPECTACLES ICON (Gafas / Protección) ======
function SpectaclesIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Gafas */}
      <ellipse cx="18" cy="27" rx="9" ry="7" fill="none" stroke={accent} strokeWidth="2.5" />
      <ellipse cx="38" cy="27" rx="9" ry="7" fill="none" stroke={accent} strokeWidth="2.5" />
      <line x1="27" y1="27" x2="29" y2="27" stroke={accent} strokeWidth="2.5" />
      {/* Lentes oscuros */}
      <ellipse cx="18" cy="27" rx="7" ry="5.5" fill={accent} opacity="0.3" />
      <ellipse cx="38" cy="27" rx="7" ry="5.5" fill={accent} opacity="0.3" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== STAR / STARDUST ICON (Estrella) ======
function StarIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Estrella */}
      <path d="M28 14 L33 22 L41 22 L30 28 L36 36 L28 30 L20 36 L26 28 L16 22 L24 22 Z" fill={accent} opacity="0.9" />
      {/* Brillo */}
      <circle cx="28" cy="27" r="4" fill={accent} opacity="0.4" />
      <Ribbon accent={accent} />
    </svg>
  );
}

// ====== CROWBAR ICON (Llave francesa) ======
function CrowbarIcon({ ring, core, accent, s }: { ring: string; core: string; accent: string; s: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      {/* Llave francesa */}
      <path d="M28 22 L32 34 L16 34 Z" fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M34 32 h-4 v-4" stroke={ring} strokeWidth="1.5" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Cinta inferior común (tipo medalla colgante). */
function Ribbon({ accent }: { accent: string }) {
  return <path d="M28 46 L22 54 L28 50 L34 54 Z" fill={accent} opacity={0.92} />;
}

export function getMedalIcon(id: string) {
  return {
    // Kilómetros y distancia general
    'km_25': 'TireIcon',
    'km_50': 'TireIcon',
    'km_100': 'TireIcon',
    'km_200': 'TireIcon',
    'km_300': 'TireIcon',
    'km_500': 'TireIcon',
    'km_750': 'FuelIcon',
    'km_1000': 'FuelIcon',
    'km_1500': 'FuelIcon',
    'km_2500': 'FuelIcon',
    'km_5000': 'FuelIcon',
    // Rutas completadas
    'spark_first_ride': 'HelmetBase',
    'rides_5': 'CheckeredFlagIcon',
    'rides_10': 'MapRouteIcon',
    'rides_25': 'MapRouteIcon',
    'rides_50': 'MapRouteIcon',
    'rides_100': 'MapRouteIcon',
    // Curvas
    'curves_25': 'ChainIcon',
    'curves_100': 'GearShiftIcon',
    'curves_250': 'ChainIcon',
    'curves_500': 'GearShiftIcon',
    'curves_1000': 'ChainIcon',
    // Inclinación
    'lean_30': 'TireIcon',
    'lean_epic_45': 'CrosshairIcon',
    'lean_55': 'CrosshairIcon',
    // Velocidad
    'speed_80': 'SpeedometerIcon',
    'speed_100': 'SpeedometerIcon',
    'speed_150': 'SpeedometerIcon',
    // Logros combinados
    'combo_asphalt_mule': 'BatteryIcon',
    'combo_silver_road': 'MapRouteIcon',
    'combo_gold_odyssey': 'CheckeredFlagIcon',
    'combo_curve_hunter': 'CrosshairIcon',
    'compass_rose': 'MapRouteIcon',
    'pilgrim_moto': 'FuelIcon',
    'chain_master': 'ChainIcon',
    'coffee_loop': 'WrenchIcon',
    'mirror_polish': 'WrenchIcon',
    'night_style': 'HelmetBase',
    // Niveles
    'level_5': 'GearShiftIcon',
    'level_10': 'GearShiftIcon',
    'level_15': 'GearShiftIcon',
    'level_20': 'GearShiftIcon',
    'level_25': 'GearShiftIcon',
    // Flash
    'flash_prudente': 'BatteryIcon',
    'flash_veloz': 'SpeedometerIcon',
    'flash_tortuga': 'BatteryIcon',
    // Primeros logros
    'spark_first_ride': 'HelmetBase',
    // Rosa de los vientos (fallback)
    'roses_rose': 'SpectaclesIcon',
  }[id] || 'StarIcon';
}

// ====== HELPER FUNCTIONS FOR MEDAL TYPES ======

/** Cinta inferior común (tipo medalla colgante). */
function Ribbon({ accent }: { accent: string }) {
  return <path d="M28 46 L22 54 L28 50 L34 54 Z" fill={accent} opacity={0.92} />;
}

/** Rueda con neumático (kilómetros). */
function GlyphTire({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <circle cx="28" cy="27" r="17" fill="none" stroke={accent} strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />
      <circle cx="28" cy="27" r="13" fill="none" stroke={ring} strokeWidth="2.5" />
      <line x1="28" y1="14" x2="28" y2="40" stroke={accent} strokeWidth="1.5" />
      <line x1="16" y1="20" x2="40" y2="20" stroke={accent} strokeWidth="1.5" />
      <line x1="22" y1="12" x2="34" y2="40" stroke={accent} strokeWidth="1.5" />
      <line x1="34" y1="12" x2="22" y2="40" stroke={accent} strokeWidth="1.5" />
      <circle cx="20" cy="20" r="2" fill={accent} opacity="0.7" />
      <circle cx="36" cy="24" r="2" fill={accent} opacity="0.7" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Cadena y piñón (curvas). */
function GlyphChain({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <circle cx="28" cy="20" r="8" fill="none" stroke={accent} strokeWidth="2" />
      <ellipse cx="16" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="24" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="32" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="40" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <ellipse cx="48" cy="30" rx="3" ry="4" fill="none" stroke={accent} strokeWidth="2.2" />
      <path d="M20 26 h4 M28 22 h2" stroke={ring} strokeWidth="1.8" />
      <path d="M32 30 h4" stroke={ring} strokeWidth="1.8" />
      <path d="M26 24 v2 M34 28 v2" stroke={ring} strokeWidth="1.8" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Velocímetro (velocidad). */
function GlyphSpeedo({ ring, core, accent, label, s, className }: { ring: string; core: string; accent: string; label: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M14 34 A14 14 0 0 1 42 34" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 34 L34 22" stroke={ring} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="28" cy="34" r="2.5" fill={accent} />
      <text x="28" y="48" textAnchor="middle" fill={accent} fontSize="9" fontWeight="900">{label}+</text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Casco (primeras rutas). */
function GlyphHelmet({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M18 22 L22 10 L34 10 L38 22 Z" fill="none" stroke={accent} strokeWidth="2.5" />
      <ellipse cx="28" cy="18" rx="10" ry="6" fill={accent} opacity="0.2" stroke="none" />
      <path d="M20 24 L20 28 L24 28 L24 24" fill="none" stroke={ring} strokeWidth="1.5" />
      <path d="M36 24 L36 28 L32 28 L32 24" fill="none" stroke={ring} strokeWidth="1.5" />
      <circle cx="28" cy="28" r="6" fill={accent} opacity="0.3" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Bandera a cuadros (fin de carrera). */
function GlyphFlag({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M28 18 L46 24 L46 38 L28 44 L10 38 L10 24 Z" fill={accent} opacity="0.9" />
      <path d="M28 20 L32 24 L32 28 L28 32 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M32 28 L36 32 L36 36 L32 32 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M36 32 L40 36 L40 40 L36 36 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M10 26 L14 30 L14 34 L10 30 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M14 34 L18 38 L18 42 L14 38 Z" fill="none" stroke={ring} strokeWidth="1.5" opacity="0.7" />
      <path d="M28 18 L28 44" stroke={ring} strokeWidth="2" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Depósito de combustible (kilometraje largo). */
function GlyphFuel({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M14 24 L12 16 L44 16 L42 24 L40 36 L28 42 L16 36 Z" fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 32 L40 32 L40 28 L16 28 Z" fill={accent} opacity="0.7" />
      <path d="M42 24 Q46 22 48 24" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Estrella (logros combinados). */
function GlyphStar({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M28 14 L33 22 L41 22 L30 28 L36 36 L28 30 L20 36 L26 28 L16 22 L24 22 Z" fill={accent} opacity="0.9" />
      <circle cx="28" cy="27" r="4" fill={accent} opacity="0.4" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Nivel (escalones de progreso). */
function GlyphLevel({ ring, core, accent, roman, s, className }: { ring: string; core: string; accent: string; roman: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M16 18 L40 18 L36 40 L20 40 Z" fill={ring} opacity="0.35" stroke={accent} strokeWidth="1.5" />
      <path d="M22 22 h12 M22 26 h10" stroke={accent} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      <text x="28" y="36" textAnchor="middle" fill={accent} fontSize="13" fontWeight="900">{roman}</text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Combos (elementos de mantenimiento). */
function GlyphCombo({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <ellipse cx="22" cy="30" rx="5" ry="3.5" fill="none" stroke={accent} strokeWidth="1.8" />
      <ellipse cx="34" cy="30" rx="5" ry="3.5" fill="none" stroke={accent} strokeWidth="1.8" />
      <path d="M27 30 h2" stroke={ring} strokeWidth="2" />
      <path d="M28 16 L30 22 L36 22 L31 26 L33 32 L28 28 L23 32 L25 26 L20 22 L26 22 Z" fill={ring} opacity="0.85" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Flash (velocidad). */
function GlyphFlash({ ring, core, accent, label, s, className }: { ring: string; core: string; accent: string; label: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M16 38 L24 18 L30 28 L38 14 L32 38 Z" fill={accent} opacity="0.92" />
      <path d="M12 22 L18 20 M40 24 L46 22" stroke={ring} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <text x="28" y="46" textAnchor="middle" fill={ring} fontSize="8" fontWeight="900">{label}+</text>
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Primer chispazo. */
function GlyphSpark({ ring, core, accent, s, className }: { ring: string; core: string; accent: string; s: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 56 56" className={className} aria-hidden>
      <circle cx="28" cy="27" r="21" fill={core} stroke={ring} strokeWidth="2.2" />
      <path d="M28 12 v8 M24 16 h8" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="24" y="22" width="8" height="14" rx="2" fill="none" stroke={ring} strokeWidth="2" />
      <path d="M26 26 h4 M26 30 h3" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M18 40 Q28 34 38 40" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <Ribbon accent={accent} />
    </svg>
  );
}

/** Medalla para medallas combinadas. */
export default function MedalGlyph({ def, size = 56, className = '' }: { def: MedalDefinition; size?: number; className?: string }) {
  const { id, ring, core, accent } = def;
  const s = size;
  const commonClass = className;

  // Obtener tipo de icono desde el mapeo
  const iconType = getMedalIcon(id);

  // Mapeo de tipos a componentes SVG
  const renderIcon = () => {
    switch (iconType) {
      case 'TireIcon': return <GlyphTire ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'ChainIcon': return <GlyphChain ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'SpeedometerIcon':
      case 'GlyphSpeedo': return <GlyphSpeedo ring={ring} core={core} accent={accent} label={`${(Number(id.match(/\d+/)?.[0]) || 0)}+`} s={s} className={commonClass} />;
      case 'HelmetBase': return <GlyphHelmet ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'CheckeredFlagIcon':
      case 'GlyphFlag': return <GlyphFlag ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'FuelIcon':
      case 'GlyphFuel': return <GlyphFuel ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'StarIcon': return <GlyphStar ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'Level':
      case 'GlyphLevel': return <GlyphLevel ring={ring} core={core} accent={accent} roman={id} s={s} className={commonClass} />;
      case 'Combo':
      case 'GlyphCombo': return <GlyphCombo ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      case 'Flash':
      case 'GlyphFlash': return <GlyphFlash ring={ring} core={core} accent={accent} label={`${(Number(id.match(/\d+/)?.[0]) || 0)}+`} s={s} className={commonClass} />;
      case 'Spark': return <GlyphSpark ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
      default: return <StarIcon ring={ring} core={core} accent={accent} s={s} className={commonClass} />;
    }
  };

  return renderIcon();
}

/**
 * Medallas / logros derivados de estadísticas en `users/{uid}`.
 * La vitrina: `profileShowcaseMedalIds` es un array de 3 strings (hueco = "").
 */

export const MEDAL_DEFINITIONS: MedalDefinition[] = [
  {
    id: 'spark_first_ride',
    title: 'Primer chispazo',
    subtitle: 'Completaste tu primera ruta registrada.',
    ring: '#f97316',
    core: '#18181b',
    accent: '#fdba74',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 1,
  },
  {
    id: 'rides_5',
    title: 'Cinco tiradas',
    subtitle: '5 rutas completadas con grabación.',
    ring: '#57534e',
    core: '#1c1917',
    accent: '#d6d3d1',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 5,
  },
  {
    id: 'rides_25',
    title: 'Calendario rodante',
    subtitle: '25 rutas completadas.',
    ring: '#0369a1',
    core: '#0c4a6e',
    accent: '#7dd3fc',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 25,
  },
  {
    id: 'rides_100',
    title: 'Cien salidas',
    subtitle: '100 rutas completadas.',
    ring: '#1d4ed8',
    core: '#172554',
    accent: '#bfdbfe',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 100,
  },
  {
    id: 'km_25',
    title: 'Rueda en marcha',
    subtitle: '25 km acumulados en perfil.',
    ring: '#92400e',
    core: '#292524',
    accent: '#fdba74',
    isUnlocked: (u) => num(u.totalDistance) >= 25,
  },
  {
    id: 'km_50',
    title: '50 km club',
    subtitle: '50 km acumulados en perfil.',
    ring: '#78716c',
    core: '#292524',
    accent: '#fcd34d',
    isUnlocked: (u) => num(u.totalDistance) >= 50,
  },
  {
    id: 'km_100',
    title: 'Centuria',
    subtitle: '100 km acumulados.',
    ring: '#b45309',
    core: '#1c1917',
    accent: '#fde68a',
    isUnlocked: (u) => num(u.totalDistance) >= 100,
  },
  {
    id: 'km_200',
    title: 'Dos centurias',
    subtitle: '200 km acumulados.',
    ring: '#0d9488',
    core: '#042f2e',
    accent: '#5eead4',
    isUnlocked: (u) => num(u.totalDistance) >= 200,
  },
  {
    id: 'km_300',
    title: 'Tramo serio',
    subtitle: '300 km acumulados.',
    ring: '#15803d',
    core: '#052e16',
    accent: '#86efac',
    isUnlocked: (u) => num(u.totalDistance) >= 300,
  },
  {
    id: 'km_500',
    title: 'Medio millar',
    subtitle: '500 km acumulados.',
    ring: '#4f46e5',
    core: '#1e1b4b',
    accent: '#a5b4fc',
    isUnlocked: (u) => num(u.totalDistance) >= 500,
  },
  {
    id: 'km_750',
    title: 'Maletero viajero',
    subtitle: '750 km acumulados.',
    ring: '#7c2d12',
    core: '#292524',
    accent: '#fca5a5',
    isUnlocked: (u) => num(u.totalDistance) >= 750,
  },
  {
    id: 'km_1000',
    title: 'Milenario',
    subtitle: '1.000 km acumulados.',
    ring: '#be123c',
    core: '#450a0a',
    accent: '#fda4af',
    isUnlocked: (u) => num(u.totalDistance) >= 1000,
  },
  {
    id: 'km_1500',
    title: 'Motor templado',
    subtitle: '1.500 km acumulados.',
    ring: '#9d174d',
    core: '#4c0519',
    accent: '#fbcfe8',
    isUnlocked: (u) => num(u.totalDistance) >= 1500,
  },
  {
    id: 'km_2500',
    title: 'Gran raid',
    subtitle: '2.500 km acumulados.',
    ring: '#a855f7',
    core: '#2e1065',
    accent: '#e9d5ff',
    isUnlocked: (u) => num(u.totalDistance) >= 2500,
  },
  {
    id: 'km_5000',
    title: 'Leyenda del asfalto',
    subtitle: '5.000 km acumulados.',
    ring: '#fbbf24',
    core: '#422006',
    accent: '#fef9c3',
    isUnlocked: (u) => num(u.totalDistance) >= 5000,
  },
  {
    id: 'combo_asphalt_mule',
    title: 'Mula de asfalto',
    subtitle: '200 km y 10 rutas: constancia.',
    ring: '#44403c',
    core: '#0c0a09',
    accent: '#a8a29e',
    isUnlocked: (u) => num(u.totalDistance) >= 200 && num(u.ridesCompletedCount) >= 10,
  },
  {
    id: 'combo_silver_road',
    title: 'Ruta plateada',
    subtitle: '800 km y 40 rutas.',
    ring: '#94a3b8',
    core: '#0f172a',
    accent: '#f1f5f9',
    isUnlocked: (u) => num(u.totalDistance) >= 800 && num(u.ridesCompletedCount) >= 40,
  },
  {
    id: 'combo_gold_odyssey',
    title: 'Odisea dorada',
    subtitle: '2.000 km y 75 rutas.',
    ring: '#ca8a04',
    core: '#422006',
    accent: '#fef08a',
    isUnlocked: (u) => num(u.totalDistance) >= 2000 && num(u.ridesCompletedCount) >= 75,
  },
  {
    id: 'combo_curve_hunter',
    title: 'Cazador de apex',
    subtitle: '150 curvas y 300 km.',
    ring: '#7c3aed',
    core: '#2e1065',
    accent: '#ddd6fe',
    isUnlocked: (u) => totalCurves(u) >= 150 && num(u.totalDistance) >= 300,
  },
  {
    id: 'lean_30',
    title: 'Tumbada clásica',
    subtitle: 'Inclinación máxima ≥ 30°.',
    ring: '#fb923c',
    core: '#431407',
    accent: '#ffedd5',
    isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 30,
  },
  {
    id: 'lean_epic_45',
    title: 'Tumbada épica',
    subtitle: 'Inclinación máxima ≥ 45° en alguna ruta.',
    ring: '#ea580c',
    core: '#431407',
    accent: '#fed7aa',
    isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 45,
  },
  {
    id: 'lean_55',
    title: 'Línea de carreras',
    subtitle: 'Inclinación máxima ≥ 55° (solo en entorno seguro).',
    ring: '#dc2626',
    core: '#450a0a',
    accent: '#fecaca',
    isUnlocked: (u) => num(u.statsMaxLeanDeg) >= 55,
  },
  {
    id: 'curves_25',
    title: 'Primeras eses',
    subtitle: '25 curvas contabilizadas.',
    ring: '#4d7c0f',
    core: '#1a2e05',
    accent: '#d9f99d',
    isUnlocked: (u) => totalCurves(u) >= 25,
  },
  {
    id: 'flash_prudente',
    title: 'Flash prudente',
    subtitle: 'Con GPS de velocidad: nunca superaste 120 km/h.',
    ring: '#22c55e',
    core: '#052e16',
    accent: '#bbf7d0',
    isUnlocked: (u) => bool(u.statsHadSpeedSample) && num(u.statsMaxSpeedKmh) > 0 && num(u.statsMaxSpeedKmh) < 120,
  },
  {
    id: 'flash_veloz',
    title: 'Flash velocidad',
    subtitle: 'Alguna vez superaste 120 km/h (circuito cerrado / vía adecuada).',
    ring: '#eab308',
    core: '#422006',
    accent: '#fef08a',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 120,
  },
  {
    id: 'flash_tortuga',
    title: 'Flash tortuga',
    subtitle: 'Con muestra GPS: tu máximo vitalicio sigue por debajo de 90 km/h.',
    ring: '#14b8a6',
    core: '#042f2e',
    accent: '#99f6e4',
    isUnlocked: (u) => bool(u.statsHadSpeedSample) && num(u.statsMaxSpeedKmh) > 0 && num(u.statsMaxSpeedKmh) < 90,
  },
  {
    id: 'speed_80',
    title: 'Club 80',
    subtitle: 'Alguna vez marcaste ≥ 80 km/h en GPS (vía adecuada).',
    ring: '#3b82f6',
    core: '#172554',
    accent: '#bfdbfe',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 80,
  },
  {
    id: 'speed_100',
    title: 'Tonelada horaria',
    subtitle: 'Máximo GPS ≥ 100 km/h.',
    ring: '#2563eb',
    core: '#1e3a8a',
    accent: '#dbeafe',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 100,
  },
  {
    id: 'speed_150',
    title: 'Huracán asfáltico',
    subtitle: 'Máximo GPS ≥ 150 km/h (autopista / circuito).',
    ring: '#f97316',
    core: '#431407',
    accent: '#ffedd5',
    isUnlocked: (u) => num(u.statsMaxSpeedKmh) >= 150,
  },
  {
    id: 'curves_100',
    title: 'Tejedora de curvas',
    subtitle: '100 curvas contabilizadas (I + D).',
    ring: '#6366f1',
    core: '#1e1b4b',
    accent: '#c7d2fe',
    isUnlocked: (u) => totalCurves(u) >= 100,
  },
  {
    id: 'curves_500',
    title: 'Leyenda de curvas',
    subtitle: '500 curvas contabilizadas.',
    ring: '#ec4899',
    core: '#500724',
    accent: '#fbcfe8',
    isUnlocked: (u) => totalCurves(u) >= 500,
  },
  {
    id: 'curves_250',
    title: 'Pasajero de curva',
    subtitle: '250 curvas contabilizadas.',
    ring: '#8b5cf6',
    core: '#2e1065',
    accent: '#ede9fe',
    isUnlocked: (u) => totalCurves(u) >= 250,
  },
  {
    id: 'curves_1000',
    title: 'Dibujante de S',
    subtitle: '1.000 curvas contabilizadas.',
    ring: '#db2777',
    core: '#500724',
    accent: '#fce7f3',
    isUnlocked: (u) => totalCurves(u) >= 1000,
  },
  {
    id: 'rides_10',
    title: 'Asfalto fiel',
    subtitle: '10 rutas completadas.',
    ring: '#64748b',
    core: '#0f172a',
    accent: '#e2e8f0',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 10,
  },
  {
    id: 'rides_50',
    title: 'Rodador nato',
    subtitle: '50 rutas completadas.',
    ring: '#0ea5e9',
    core: '#082f49',
    accent: '#bae6fd',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 50,
  },
  {
    id: 'level_5',
    title: 'Sube marchas V',
    subtitle: 'Alcanza el nivel 5.',
    ring: '#d97706',
    core: '#292524',
    accent: '#fde68a',
    isUnlocked: (u) => effectiveLevel(u) >= 5,
  },
  {
    id: 'level_10',
    title: 'Sube marchas X',
    subtitle: 'Alcanza el nivel 10.',
    ring: '#c084fc',
    core: '#2e1065',
    accent: '#f3e8ff',
    isUnlocked: (u) => effectiveLevel(u) >= 10,
  },
  {
    id: 'level_15',
    title: 'Sube marchas XV',
    subtitle: 'Alcanza el nivel 15.',
    ring: '#059669',
    core: '#022c22',
    accent: '#a7f3d0',
    isUnlocked: (u) => effectiveLevel(u) >= 15,
  },
  {
    id: 'level_20',
    title: 'Sube marchas XX',
    subtitle: 'Alcanza el nivel 20.',
    ring: '#ea580c',
    core: '#431407',
    accent: '#fed7aa',
    isUnlocked: (u) => effectiveLevel(u) >= 20,
  },
  {
    id: 'level_25',
    title: 'Sube marchas XXV',
    subtitle: 'Alcanza el nivel 25.',
    ring: '#e11d48',
    core: '#4c0519',
    accent: '#fecdd3',
    isUnlocked: (u) => effectiveLevel(u) >= 25,
  },
  {
    id: 'compass_rose',
    title: 'Rosa de los vientos',
    subtitle: '100 curvas y 15 rutas: trazas variadas.',
    ring: '#0f766e',
    core: '#042f2e',
    accent: '#5eead4',
    isUnlocked: (u) => totalCurves(u) >= 100 && num(u.ridesCompletedCount) >= 15,
  },
  {
    id: 'pilgrim_moto',
    title: 'Peregrino motorizado',
    subtitle: '1.000 km y 20 rutas.',
    ring: '#a16207',
    core: '#422006',
    accent: '#fef08a',
    isUnlocked: (u) => num(u.totalDistance) >= 1000 && num(u.ridesCompletedCount) >= 20,
  },
  {
    id: 'chain_master',
    title: 'Maestro de cadena',
    subtitle: '50 rutas y 400 km: ritual de mantenimiento.',
    ring: '#52525b',
    core: '#18181b',
    accent: '#e4e4e7',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 50 && num(u.totalDistance) >= 400,
  },
  {
    id: 'coffee_loop',
    title: 'Ruta del café',
    subtitle: '10 rutas y al menos 80 km: salidas cortas pero seguidas.',
    ring: '#78350f',
    core: '#292524',
    accent: '#fde68a',
    isUnlocked: (u) => num(u.ridesCompletedCount) >= 10 && num(u.totalDistance) >= 80,
  },
  {
    id: 'mirror_polish',
    title: 'Cromado vivo',
    subtitle: '300 curvas y 600 km: brillo en cada giro.',
    ring: '#94a3b8',
    core: '#0f172a',
    accent: '#f8fafc',
    isUnlocked: (u) => totalCurves(u) >= 300 && num(u.totalDistance) >= 600,
  },
  {
    id: 'night_style',
    title: 'Noche en ruta',
    subtitle: '500 km y 25 rutas: constancia nocturna.',
    ring: '#312e81',
    core: '#0f172a',
    accent: '#a5b4fc',
    isUnlocked: (u) => num(u.totalDistance) >= 500 && num(u.ridesCompletedCount) >= 25,
  },
];

const MEDAL_BY_ID: Record<string, MedalDefinition> = Object.fromEntries(MEDAL_DEFINITIONS.map((m) => [m.id, m]));

export function getMedalDefinition(id: string): MedalDefinition | undefined {
  return MEDAL_BY_ID[id];
}

export function listUnlockedMedalIds(user: UserMedalStats | null | undefined): string[] {
  if (!user) return [];
  return MEDAL_DEFINITIONS.filter((m) => m.isUnlocked(user)).map((m) => m.id);
}

const SHOWCASE_SLOTS = 3;

export type MedalShowcaseTriple = [string, string, string];

/** Tres ranuras fijas (cadena vacía = hueco); solo ids desbloqueados. */
export function sanitizeMedalShowcaseTriple(
  raw: unknown,
  user: UserMedalStats | null | undefined
): MedalShowcaseTriple {
  const unlocked = new Set(listUnlockedMedalIds(user));
  const t: MedalShowcaseTriple = ['', '', ''];
  if (!Array.isArray(raw)) return t;
  for (let i = 0; i < SHOWCASE_SLOTS; i++) {
    const id = typeof raw[i] === 'string' ? raw[i].trim() : '';
    t[i] = id && unlocked.has(id) ? id : '';
  }
  return t;
}
