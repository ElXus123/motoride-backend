/**
 * Aro alrededor del avatar según nivel (mapa / ranking).
 * Hitos cada 5 niveles: estética ligera inspirada en ruta / neumático / casco / curva (sin glow agresivo ni animaciones que molesten al GPS).
 */

export type LevelRingBoxStyle = { border: string; boxShadow: string };

/** 0 = niveles 1–4, 1 = 5–9, 2 = 10–14, … */
function levelVisualTier(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  return Math.min(12, Math.floor(lv / 5));
}

export function getLevelRingBoxStyle(level: number, isPremium: boolean): LevelRingBoxStyle {
  const lv = Math.max(1, Math.floor(level || 1));
  if (isPremium) {
    return {
      border: '3px solid #f59e0b',
      boxShadow:
        '0 0 10px 1px rgba(245,158,11,0.45), 0 2px 5px rgba(0,0,0,0.25), inset 0 0 8px rgba(253,230,138,0.12)',
    };
  }
  const t = levelVisualTier(lv);
  // Tieres: carretera → rodadura → visera/casco → curva → autopista de montaña → noche en ruta → leyenda
  switch (t) {
    case 0:
      return { border: '3px solid #ea580c', boxShadow: '0 1px 4px rgba(0,0,0,0.22)' };
    case 1:
      return {
        border: '3px solid #c2410c',
        boxShadow: 'inset 0 0 0 1px rgba(254,215,170,0.25), 0 1px 4px rgba(0,0,0,0.25)',
      };
    case 2:
      return {
        border: '3px solid #57534e',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)',
      };
    case 3:
      return {
        border: '3px solid #f97316',
        boxShadow: '0 0 0 1px rgba(251,191,36,0.35), 0 1px 4px rgba(0,0,0,0.22)',
      };
    case 4:
      return {
        border: '3px solid #7c3aed',
        boxShadow: '0 0 8px 1px rgba(139,92,246,0.28), 0 1px 4px rgba(0,0,0,0.2)',
      };
    case 5:
      return {
        border: '3px solid #0e7490',
        boxShadow: '0 0 8px 1px rgba(34,211,238,0.22), 0 1px 4px rgba(0,0,0,0.2)',
      };
    case 6:
      return {
        border: '3px solid #64748b',
        boxShadow: 'inset 0 0 0 1px rgba(226,232,240,0.2), 0 1px 4px rgba(0,0,0,0.22)',
      };
    default:
      return {
        border: '3px solid #b45309',
        boxShadow: '0 0 10px 1px rgba(245,158,11,0.32), 0 1px 4px rgba(0,0,0,0.22)',
      };
  }
}

/** Clases Tailwind para anillo en componentes React (ranking / cabecera). Sin pulse en mapa. */
export function getLevelRingWrapperClass(level: number, isPremium: boolean): string {
  const lv = Math.max(1, Math.floor(level || 1));
  if (isPremium) {
    return 'ring-2 ring-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]';
  }
  const t = levelVisualTier(lv);
  switch (t) {
    case 0:
      return 'ring-2 ring-orange-600';
    case 1:
      return 'ring-2 ring-orange-700 shadow-[inset_0_0_0_1px_rgba(254,215,170,0.2)]';
    case 2:
      return 'ring-2 ring-stone-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]';
    case 3:
      return 'ring-2 ring-orange-500 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]';
    case 4:
      return 'ring-2 ring-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.28)]';
    case 5:
      return 'ring-2 ring-cyan-600 shadow-[0_0_8px_rgba(34,211,238,0.22)]';
    case 6:
      return 'ring-2 ring-slate-500 shadow-[inset_0_0_0_1px_rgba(226,232,240,0.18)]';
    default:
      return 'ring-2 ring-amber-700 shadow-[0_0_10px_rgba(245,158,11,0.3)]';
  }
}
