/**
 * Geometría para inclinación a partir del vector de gravedad medido en el móvil.
 *
 * NO usamos gamma/beta crudos del DeviceOrientationEvent: aquí todo sale de
 * accelerationIncludingGravity + eje de referencia guardado en calibración.
 *
 * Convención de signo de salida (atan2 lateral vs up en marco calibrado):
 *   leanDeg > 0  →  un lado; &lt; 0 → el otro. En la app, `useLeanAngle` aplica `LEAN_SENSOR_SIGN`
 *   para alinear con UI: positivo = derecha, negativo = izquierda (vista desde atrás).
 */

const DEG = 180 / Math.PI;

/** Producto escalar */
export function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Producto vectorial a × b */
export function cross3(
  a: [number, number, number],
  b: [number, number, number],
  out: [number, number, number]
): void {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
}

/**
 * Matriz R (row-major: out[row*3+col]) tal que R * v (como columna) rota `from` hacia `to`
 * (ambos unitarios): R * from ≈ to.
 */
export function rotationFromTo(
  from: [number, number, number],
  to: [number, number, number],
  out: number[]
): boolean {
  const c = dot3(from, to);
  if (c > 0.99999) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return true;
  }
  let ax = from[1] * to[2] - from[2] * to[1];
  let ay = from[2] * to[0] - from[0] * to[2];
  let az = from[0] * to[1] - from[1] * to[0];
  let s = Math.hypot(ax, ay, az);
  if (c < -0.99999) {
    // Rotación de 180°: R = -I + 2 k k^T con k ⟂ from
    const p: [number, number, number] = [1, 0, 0];
    const perp: [number, number, number] = [0, 0, 0];
    cross3(from, p, perp);
    let pn = Math.hypot(perp[0], perp[1], perp[2]);
    if (pn < 1e-6) {
      cross3(from, [0, 1, 0] as [number, number, number], perp);
      pn = Math.hypot(perp[0], perp[1], perp[2]);
    }
    if (pn < 1e-6) return false;
    const kx = perp[0] / pn;
    const ky = perp[1] / pn;
    const kz = perp[2] / pn;
    out[0] = -1 + 2 * kx * kx;
    out[1] = 2 * kx * ky;
    out[2] = 2 * kx * kz;
    out[3] = 2 * ky * kx;
    out[4] = -1 + 2 * ky * ky;
    out[5] = 2 * ky * kz;
    out[6] = 2 * kz * kx;
    out[7] = 2 * kz * ky;
    out[8] = -1 + 2 * kz * kz;
    return true;
  }
  if (s < 1e-10) return false;
  const kx = ax / s;
  const ky = ay / s;
  const kz = az / s;
  const cost = Math.max(-1, Math.min(1, c));
  const sint = s;
  const t = 1 - cost;
  out[0] = cost + kx * kx * t;
  out[1] = kx * ky * t - kz * sint;
  out[2] = kx * kz * t + ky * sint;
  out[3] = ky * kx * t + kz * sint;
  out[4] = cost + ky * ky * t;
  out[5] = ky * kz * t - kx * sint;
  out[6] = kz * kx * t - ky * sint;
  out[7] = kz * ky * t + kx * sint;
  out[8] = cost + kz * kz * t;
  return true;
}

/** out = R * v (R filas 3×3 en orden row-major: out[i] = sum_j R_ij v_j) */
export function mat3TimesVec3(R: number[], v: [number, number, number], out: [number, number, number]): void {
  out[0] = R[0] * v[0] + R[1] * v[1] + R[2] * v[2];
  out[1] = R[3] * v[0] + R[4] * v[1] + R[5] * v[2];
  out[2] = R[6] * v[0] + R[7] * v[1] + R[8] * v[2];
}

/**
 * Tras calibración, g_neutral apunta “arriba” en el marco moto ideal.
 * R_align lleva g_neutral → +Z. Para cualquier g actual, g_b = R * g;
 * el ángulo de inclinación en el plano lateral (X–Z) es atan2(g_b.x, g_b.z).
 */
export function leanDegFromGravityInBikeFrame(
  gNormalized: [number, number, number],
  R_align: number[],
  outGb: [number, number, number]
): number {
  mat3TimesVec3(R_align, gNormalized, outGb);
  return Math.atan2(outGb[0], outGb[2]) * DEG;
}

/**
 * Base ortonormal {forward, lateral, up} en calibración:
 *   up = -g0
 *   lateral = normalize(cross(up, aux)) con aux casi no paralelo a up
 *   forward = cross(lateral, up)
 */
export function buildBikeBasisAtCalibration(
  g0Unit: [number, number, number],
  outForward: [number, number, number],
  outLateral: [number, number, number],
  outUp: [number, number, number]
): boolean {
  outUp[0] = -g0Unit[0];
  outUp[1] = -g0Unit[1];
  outUp[2] = -g0Unit[2];
  const aux: [number, number, number] = [1, 0, 0];
  cross3(outUp, aux, outLateral);
  let n = Math.hypot(outLateral[0], outLateral[1], outLateral[2]);
  if (n < 0.2) {
    aux[0] = 0;
    aux[1] = 1;
    aux[2] = 0;
    cross3(outUp, aux, outLateral);
    n = Math.hypot(outLateral[0], outLateral[1], outLateral[2]);
  }
  if (n < 1e-6) return false;
  outLateral[0] /= n;
  outLateral[1] /= n;
  outLateral[2] /= n;
  cross3(outLateral, outUp, outForward);
  n = Math.hypot(outForward[0], outForward[1], outForward[2]);
  if (n < 1e-6) return false;
  outForward[0] /= n;
  outForward[1] /= n;
  outForward[2] /= n;
  return true;
}

/** Velocidad de cambio de inclinación (rad/s) ≈ ω · forward */
export function rollRateFromGyro(
  wx: number,
  wy: number,
  wz: number,
  forward: [number, number, number]
): number {
  return (wx * forward[0] + wy * forward[1] + wz * forward[2]) * (Math.PI / 180);
}
