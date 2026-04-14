/**
 * Filtros ligeros para móvil: pocos objetos nuevos en el bucle caliente.
 */

/** Low-pass exponencial escalar: y += alpha * (x - y) */
export function lowPassScalar(prev: number, sample: number, alpha: number): number {
  return prev + alpha * (sample - prev);
}

/** Low-pass vector 3D in-place sobre salida */
export function lowPassVec3(
  out: [number, number, number],
  prev: [number, number, number],
  sample: [number, number, number],
  alpha: number
): void {
  out[0] = prev[0] + alpha * (sample[0] - prev[0]);
  out[1] = prev[1] + alpha * (sample[1] - prev[1]);
  out[2] = prev[2] + alpha * (sample[2] - prev[2]);
}

/** Normaliza v in-place; devuelve false si norma ~ 0 */
export function normalizeVec3(v: [number, number, number]): boolean {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n < 1e-6) return false;
  const inv = 1 / n;
  v[0] *= inv;
  v[1] *= inv;
  v[2] *= inv;
  return true;
}

/**
 * Filtro complementario sobre ángulo (rad): predicción por giro + corrección por acelerómetro.
 * alpha bajo → más confianza en giro integrado (corto plazo), alpha alto → más gravedad.
 */
export function complementaryAngleRad(
  anglePrevRad: number,
  angleAccelRad: number,
  gyroRateRadPerSec: number,
  dtSec: number,
  alpha: number
): number {
  const predicted = anglePrevRad + gyroRateRadPerSec * dtSec;
  let diff = angleAccelRad - predicted;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return predicted + alpha * diff;
}
