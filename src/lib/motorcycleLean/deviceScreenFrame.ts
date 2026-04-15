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
  // 0° natural; 90° típico landscape (home button izquierda o derecha según dispositivo)
  if (a === 90) return [y, -x, z];
  if (a === 270) return [-y, x, z];
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
