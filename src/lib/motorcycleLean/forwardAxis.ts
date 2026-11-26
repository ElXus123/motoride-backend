/**
 * Eje de avance de la moto expresado en ejes del móvil.
 *
 * La base de calibración (rotationFromTo hacia +Z) fija la vertical, pero NO el eje lateral: el
 * lateral queda en la vertical del móvil con el que se calibró. Si el móvil va montado girado
 * aunque sea unos grados respecto al eje lateral de la moto, el cabeceo (frenazo, subida de
 * caballo) entra en el ángulo de inclinación y el frenazo también (aceleración lineal en el
 * eje equivocado).
 *
 * Solución: aprender la dirección de avance del móvil a partir de la aceleración lineal en
 * tramos rectos (aceleración/frenada con giro despreciable), con el signo que dé la variación de
 * velocidad GPS. Con esa dirección se gira la base alrededor de la vertical de la moto para que
 * el eje Y de la moto sea el avance. Sin datos suficientes la corrección es 0 (base original).
 */

export type Vec3 = [number, number, number];

/** R' = Rz(psi)·R0 (rotación alrededor de la vertical de la moto). `out` y `R0` deben ser distintos. */
export function applyBikeYawToRotation(R0: number[], psiRad: number, out: number[]): void {
  const c = Math.cos(psiRad);
  const s = Math.sin(psiRad);
  for (let col = 0; col < 3; col++) {
    const r0 = R0[col];
    const r1 = R0[3 + col];
    const r2 = R0[6 + col];
    out[col] = c * r0 - s * r1;
    out[3 + col] = s * r0 + c * r1;
    out[6 + col] = r2;
  }
}

/**
 * Corrección de guiñada ψ tal que R' = Rz(ψ)·R0 lleve el avance (ya en el plano horizontal) al eje Y de la moto.
 * `forwardDev` debe ser unitario y ⟂ gravedad en el marco del móvil.
 */
export function yawCorrectionFromForward(R0: number[], forwardDev: Vec3): number {
  const vx = R0[0] * forwardDev[0] + R0[1] * forwardDev[1] + R0[2] * forwardDev[2];
  const vy = R0[3] * forwardDev[0] + R0[4] * forwardDev[1] + R0[5] * forwardDev[2];
  return Math.PI / 2 - Math.atan2(vy, vx);
}

const MIN_WEIGHT = 6;          // m/s² acumulados antes de fiarse de la dirección
const MIN_COHERENCE = 0.6;     // |Σ s·h| / Σ|h|: 1 = todas las maniobras en la misma dirección
const MAX_WEIGHT = 2000;       // por encima se reescala (el montaje puede cambiar lentamente)
const SIGN_TTL_SEC = 1.5;      // validez del signo longitudinal derivado del GPS
const MIN_LONG_ACCEL = 0.6;    // m/s² de variación de velocidad para contar como aceleración/frenada
const MIN_HORIZ_ACCEL = 0.25;  // m/s² de aceleración horizontal mínima por muestra

export class ForwardAxisLearner {
  private sx = 0;
  private sy = 0;
  private sz = 0;
  /** Σ |h|·û: vertical media de las maniobras. La dirección de avance es fija en el móvil, no en la gravedad instantánea. */
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private w = 0;
  private lastSpeed: number | null = null;
  private lastSpeedT = 0;
  private longSign: -1 | 0 | 1 = 0;
  private longSignT = -1e9;

  reset(): void {
    this.sx = this.sy = this.sz = 0;
    this.vx = this.vy = this.vz = 0;
    this.w = 0;
    this.lastSpeed = null;
    this.lastSpeedT = 0;
    this.longSign = 0;
    this.longSignT = -1e9;
  }

  /** Signo de la aceleración longitudinal a partir de la variación de velocidad GPS (tramos ≥ 0,5 s). */
  observeSpeed(speedMps: number | null | undefined, tSec: number): void {
    if (typeof speedMps !== 'number' || !Number.isFinite(speedMps)) return;
    if (this.lastSpeed == null) {
      this.lastSpeed = speedMps;
      this.lastSpeedT = tSec;
      return;
    }
    const dt = tSec - this.lastSpeedT;
    if (dt < 0.5) return;
    const a = (speedMps - this.lastSpeed) / dt;
    this.lastSpeed = speedMps;
    this.lastSpeedT = tSec;
    this.longSign = a > MIN_LONG_ACCEL ? 1 : a < -MIN_LONG_ACCEL ? -1 : 0;
    this.longSignT = tSec;
  }

  /**
   * Acumula la aceleración horizontal (marco del móvil, convención W3C sin gravedad) en maniobras
   * rectas. `uDev`: gravedad unitaria en el mismo marco. `quiet`: sin giro apreciable.
   */
  observeLinear(aLin: Vec3, uDev: Vec3, tSec: number, quiet: boolean): void {
    if (!quiet || this.longSign === 0 || tSec - this.longSignT > SIGN_TTL_SEC) return;
    const along = aLin[0] * uDev[0] + aLin[1] * uDev[1] + aLin[2] * uDev[2];
    const hx = aLin[0] - along * uDev[0];
    const hy = aLin[1] - along * uDev[1];
    const hz = aLin[2] - along * uDev[2];
    const n = Math.hypot(hx, hy, hz);
    if (n < MIN_HORIZ_ACCEL) return;
    const s = this.longSign;
    this.sx += s * hx;
    this.sy += s * hy;
    this.sz += s * hz;
    this.vx += n * uDev[0];
    this.vy += n * uDev[1];
    this.vz += n * uDev[2];
    this.w += n;
    if (this.w > MAX_WEIGHT) {
      this.sx *= 0.5;
      this.sy *= 0.5;
      this.sz *= 0.5;
      this.vx *= 0.5;
      this.vy *= 0.5;
      this.vz *= 0.5;
      this.w *= 0.5;
    }
  }

  /**
   * Dirección de avance unitaria en el marco del móvil (fija en el montaje), o null si no hay datos fiables.
   * Se proyecta sobre la vertical media de las maniobras, no sobre la gravedad instantánea.
   */
  forwardInDevice(): Vec3 | null {
    if (this.w < MIN_WEIGHT) return null;
    const vn = Math.hypot(this.vx, this.vy, this.vz);
    if (vn < 1e-6) return null;
    const ux = this.vx / vn;
    const uy = this.vy / vn;
    const uz = this.vz / vn;
    const along = this.sx * ux + this.sy * uy + this.sz * uz;
    const fx = this.sx - along * ux;
    const fy = this.sy - along * uy;
    const fz = this.sz - along * uz;
    const n = Math.hypot(fx, fy, fz);
    if (n < 1e-6 || n / this.w < MIN_COHERENCE) return null;
    return [fx / n, fy / n, fz / n];
  }
}
