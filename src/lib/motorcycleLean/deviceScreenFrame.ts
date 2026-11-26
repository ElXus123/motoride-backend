/**
 * DeviceMotion (acelerómetro / giro) viene en **coordenadas del hardware** del teléfono.
 * Al pasar de vertical a horizontal, los ejes X/Y/Z rotan respecto a la pantalla; sin
 * compensación, la base «moto» y el roll quedan mal alineados en apaisado.
 *
 * Reexpresamos vectores 3D como si el dispositivo siguiera en orientación natural (retrato),
 * usando el ángulo de `screen.orientation` / `window.orientation`.
 */

/** Rota (x,y) en el plano pantalla según el ángulo de orientación respecto a la natural (grados). */
export function remapDeviceVectorToNaturalPortrait(
  x: number,
  y: number,
  z: number,
  screenAngleDeg: number
): [number, number, number] {
  const a = ((Math.round(screenAngleDeg) % 360) + 360) % 360;
  // Ángulo según screen.orientation / window.orientation: rotación ANTIHORARIA de la pantalla.
  // 90 = parte superior del móvil a la izquierda; 270 = parte superior a la derecha.
  // Verificado con datos sintéticos (scratchpad/lean-test): con la asignación contraria el signo
  // de la inclinación se invertía en horizontal (a derecha salía negativo).
  if (a === 90) return [-y, x, z];
  if (a === 270) return [y, -x, z];
  if (a === 180) return [-x, -y, z];
  return [x, y, z];
}

/** Cubo de orientación estable (evita ruido por ±1°). */
export function orientationBucket(deg: number): 0 | 90 | 180 | 270 {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  if (d < 45 || d > 315) return 0;
  if (d < 135) return 90;
  if (d < 225) return 180;
  return 270;
}

export function getScreenOrientationAngleDeg(): number {
  try {
    if (typeof screen !== 'undefined' && screen.orientation) {
      const so = screen.orientation;
      if (typeof so.angle === 'number' && Number.isFinite(so.angle) && so.angle !== 0) {
        return so.angle;
      }
      const t = so.type;
      if (t === 'landscape-primary' || t === 'landscape-secondary') {
        return 90;
      }
      if (t === 'portrait-primary' || t === 'portrait-secondary') {
        return 0;
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && window.innerWidth > window.innerHeight + 24) {
      const o = (window as Window & { orientation?: number }).orientation;
      if (typeof o === 'number' && Number.isFinite(o) && o !== 0) return o;
      return 90;
    }
    const o = (typeof window !== 'undefined' ? (window as Window & { orientation?: number }).orientation : undefined) as
      | number
      | undefined;
    if (typeof o === 'number' && Number.isFinite(o)) return o;
  } catch {
    /* ignore */
  }
  return 0;
}

/** iPhone / iPad (todos los navegadores de iOS usan WebKit). */
export function isAppleMobileWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS se presenta como Mac de escritorio pero con pantalla táctil.
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Signo de `accelerationIncludingGravity` / `acceleration` respecto a la norma W3C
 * (norma: móvil boca arriba en la mesa → z ≈ +9,8). Safari en iOS lo entrega **invertido**
 * (z ≈ −9,8), lo que en iPhone cambiaba izquierda/derecha y desincronizaba el término cinemático.
 *
 * Arranca con el valor típico de la plataforma y se confirma en vivo comparando con
 * `deviceorientation` (β, γ), que sí sigue la norma en todos los navegadores.
 */
export class AccelSignDetector {
  private score = 0;
  sign: 1 | -1 = isAppleMobileWebKit() ? -1 : 1;
  private beta: number | null = null;
  private gamma: number | null = null;

  onOrientation(beta: number | null, gamma: number | null): void {
    this.beta = typeof beta === 'number' && Number.isFinite(beta) ? beta : null;
    this.gamma = typeof gamma === 'number' && Number.isFinite(gamma) ? gamma : null;
  }

  /** Recibe la aceleración cruda (ejes hardware). Devuelve true si el signo cambió. */
  vote(ax: number, ay: number, az: number): boolean {
    if (this.beta == null || this.gamma == null) return false;
    const n = Math.hypot(ax, ay, az);
    // Solo con el móvil casi quieto: la aceleración medida ≈ gravedad.
    if (n < 8.3 || n > 11.3) return false;
    const b = this.beta * (Math.PI / 180);
    const g = this.gamma * (Math.PI / 180);
    // «Arriba» terrestre expresado en ejes del dispositivo (W3C: R = Rz(α)·Rx(β)·Ry(γ)).
    const ux = -Math.sin(g) * Math.cos(b);
    const uy = Math.sin(b);
    const uz = Math.cos(g) * Math.cos(b);
    const d = (ax * ux + ay * uy + az * uz) / n;
    if (d > 0.7) this.score = Math.min(40, this.score + 1);
    else if (d < -0.7) this.score = Math.max(-40, this.score - 1);
    else return false;
    const prev = this.sign;
    if (this.score >= 15) this.sign = 1;
    else if (this.score <= -15) this.sign = -1;
    return this.sign !== prev;
  }
}

/**
 * `rotationRate`: en WebKit (iOS/Safari) son **Euler** β,γ,α (°/s), no un vector cartesiano x,y,z.
 * Solo remapear esos tres; si el dispositivo expone solo x,y,z cartesianos, remapear ese vector.
 */
export function getRemappedRotationRateDeg(
  rr: { x?: number; y?: number; z?: number; alpha?: number; beta?: number; gamma?: number } | null | undefined,
  screenAngleDeg: number
): [number, number, number] {
  if (!rr) return [0, 0, 0];
  const hasEuler =
    typeof rr.beta === 'number' ||
    typeof rr.gamma === 'number' ||
    typeof rr.alpha === 'number';
  if (hasEuler) {
    return remapDeviceVectorToNaturalPortrait(rr.beta ?? 0, rr.gamma ?? 0, rr.alpha ?? 0, screenAngleDeg);
  }
  return remapDeviceVectorToNaturalPortrait(rr.x ?? 0, rr.y ?? 0, rr.z ?? 0, screenAngleDeg);
}
