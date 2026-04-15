/**
 * Kalman escalar para ángulo de roll (rad): predicción con ω_roll, corrección con IMU/cinemática.
 * Equivalente a complementario con ganancia adaptativa cuando solo hay una medición por paso.
 */

export class KalmanRoll1D {
  private angleRad = 0;
  private p = 0.08;

  reset(angleRad = 0): void {
    this.angleRad = angleRad;
    this.p = 0.08;
  }

  getAngleRad(): number {
    return this.angleRad;
  }

  /** Predicción: θ += ω·dt ; aumento de covarianza del proceso */
  predict(omegaRollRadPerSec: number, dtSec: number, processNoise = 2.5e-5): void {
    this.angleRad += omegaRollRadPerSec * dtSec;
    this.p += processNoise + Math.abs(omegaRollRadPerSec) * 1e-6;
    if (this.p > 2) this.p = 2;
  }

  /** Corrección tipo Kalman: z en rad, R = varianza de medición */
  update(zRad: number, measurementVariance: number): void {
    const R = Math.max(1e-8, measurementVariance);
    const k = this.p / (this.p + R);
    let innov = zRad - this.angleRad;
    while (innov > Math.PI) innov -= 2 * Math.PI;
    while (innov < -Math.PI) innov += 2 * Math.PI;
    this.angleRad += k * innov;
    this.p *= 1 - k;
    if (this.p < 1e-6) this.p = 1e-6;
  }
}
