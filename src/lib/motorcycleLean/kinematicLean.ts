/**
 * Inclinación cinemática en curva plana (modelo coordinado): a_lat = v·ω sobre el suelo,
 * con ω ≈ componente del giroscopio alineada con la gravedad (giro alrededor del eje vertical local).
 *
 * Esto compensa que el acelerómetro mida gravedad + aceleración lateral en curva, de modo que
 * atan2(|a|, g) ya no coincide con el roll geométrico si solo se proyecta "gravedad aparente".
 */

const G = 9.80665;

/**
 * ω en °/s alrededor del eje vertical local ≈ (α,β,γ)·ĝ (W3C rotationRate en ejes dispositivo).
 */
export function yawRateAboutGravityDegPerSec(
  betaX: number,
  gammaY: number,
  alphaZ: number,
  gx: number,
  gy: number,
  gz: number
): number {
  const n = Math.hypot(gx, gy, gz);
  if (n < 1e-4) return 0;
  const ux = gx / n;
  const uy = gy / n;
  const uz = gz / n;
  return betaX * ux + gammaY * uy + alphaZ * uz;
}

/**
 * Roll teórico (rad) en giro nivelado: δ = atan(a_lat / g), con a_lat = v·ω (ω en rad/s).
 * Devuelve grados con el mismo signo que a_lat (convención MotoRide: + derecha).
 */
export function kinematicLeanDegFromSpeedAndYaw(
  speedMps: number,
  yawAboutGravityDegPerSec: number
): number {
  const omegaRad = (yawAboutGravityDegPerSec * Math.PI) / 180;
  const aLat = speedMps * omegaRad;
  return (Math.atan2(aLat, G) * 180) / Math.PI;
}

/** Peso 0–1 para mezclar cinemática: sube con |v| y |ω|, nulo si datos inválidos. */
export function kinematicBlendWeight(
  speedMps: number,
  yawAboutGravityDegPerSec: number,
  opts?: { minSpeed?: number; minYaw?: number }
): number {
  const minSpeed = opts?.minSpeed ?? 4;
  const minYaw = opts?.minYaw ?? 6;
  if (speedMps < minSpeed * 0.5) return 0;
  const sp = Math.min(1, Math.max(0, (Math.abs(speedMps) - minSpeed * 0.5) / (18 - minSpeed * 0.5)));
  const yp = Math.min(1, Math.abs(yawAboutGravityDegPerSec) / minYaw);
  return Math.min(0.62, sp * yp * 0.85);
}
