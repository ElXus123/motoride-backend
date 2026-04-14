/**
 * Estilos visuales del “aro” alrededor del avatar según nivel (mapa / ranking).
 */

export type LevelRingBoxStyle = { border: string; boxShadow: string };

export function getLevelRingBoxStyle(level: number, isPremium: boolean): LevelRingBoxStyle {
  const lv = Math.max(1, Math.floor(level || 1));
  if (isPremium) {
    return {
      border: '3px solid #f59e0b',
      boxShadow:
        '0 0 14px 2px rgba(245,158,11,0.55), 0 0 28px rgba(251,191,36,0.3), inset 0 0 12px rgba(253,230,138,0.15)',
    };
  }
  if (lv >= 35) {
    return {
      border: '3px solid #c084fc',
      boxShadow:
        '0 0 18px 4px rgba(192,132,252,0.65), 0 0 36px rgba(236,72,153,0.45), 0 0 8px rgba(34,211,238,0.35)',
    };
  }
  if (lv >= 25) {
    return {
      border: '3px solid #22d3ee',
      boxShadow: '0 0 16px 3px rgba(34,211,238,0.55), 0 0 32px rgba(59,130,246,0.35)',
    };
  }
  if (lv >= 18) {
    return {
      border: '3px solid #a855f7',
      boxShadow: '0 0 14px 3px rgba(168,85,247,0.5), 0 0 24px rgba(236,72,153,0.25)',
    };
  }
  if (lv >= 12) {
    return {
      border: '3px solid #fbbf24',
      boxShadow: '0 0 12px 2px rgba(251,191,36,0.5), 0 0 22px rgba(249,115,22,0.25)',
    };
  }
  if (lv >= 8) {
    return {
      border: '3px solid #fb923c',
      boxShadow: '0 0 10px 2px rgba(249,115,22,0.45)',
    };
  }
  if (lv >= 5) {
    return {
      border: '3px solid #f97316',
      boxShadow: '0 0 8px 1px rgba(249,115,22,0.35)',
    };
  }
  return {
    border: '3px solid #f97316',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  };
}

/** Clases Tailwind para anillo en componentes React (ranking). */
export function getLevelRingWrapperClass(level: number, isPremium: boolean): string {
  const lv = Math.max(1, Math.floor(level || 1));
  if (isPremium) {
    return 'ring-2 ring-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.55)]';
  }
  if (lv >= 35) {
    return 'ring-2 ring-purple-400 shadow-[0_0_16px_rgba(192,132,252,0.6)] motion-safe:animate-pulse';
  }
  if (lv >= 25) {
    return 'ring-2 ring-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.5)]';
  }
  if (lv >= 18) {
    return 'ring-2 ring-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.45)]';
  }
  if (lv >= 12) {
    return 'ring-2 ring-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]';
  }
  if (lv >= 8) {
    return 'ring-2 ring-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.4)]';
  }
  if (lv >= 5) {
    return 'ring-2 ring-orange-500';
  }
  return 'ring-2 ring-orange-600';
}
