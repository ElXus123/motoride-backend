/**
 * Heurística “¿tiene sentido mostrar inclinación?”: en recta a baja velocidad o parado,
 * el vector de gravedad en bolsillo no refleja la moto; evitamos falsos picos.
 */

/** Energía de aceleración lateral (m/s²) tras quitar la componente paralela a la gravedad. */
export function lateralAccelMagnitude(
  ax: number,
  ay: number,
  az: number,
  gx: number,
  gy: number,
  gz: number
): number {
  const d = gx * ax + gy * ay + gz * az;
  const px = ax - d * gx;
  const py = ay - d * gy;
  const pz = az - d * gz;
  return Math.hypot(px, py, pz);
}

export type CurvePlausibility = {
  /** Si la inclinación IMU es interpretable en este instante */
  leanMeaningful: boolean;
  /** 0–1, mayor si parece curva o maniobra lateral */
  lateralActivity: number;
};

export function evaluateCurvePlausibility(
  speedMps: number | null | undefined,
  lateralAccelMs2: number,
  opts: {
    minSpeedMps: number;
    lateralQuietBelow: number;
    lateralActiveAbove: number;
  }
): CurvePlausibility {
  const v = speedMps ?? 0;
  let lateralActivity = 0;
  if (lateralAccelMs2 >= opts.lateralActiveAbove) lateralActivity = 1;
  else if (lateralAccelMs2 > opts.lateralQuietBelow) {
    lateralActivity =
      (lateralAccelMs2 - opts.lateralQuietBelow) / (opts.lateralActiveAbove - opts.lateralQuietBelow);
  }
  const moving = v >= opts.minSpeedMps;
  const leanMeaningful = moving || lateralActivity > 0.35;
  return { leanMeaningful, lateralActivity };
}
