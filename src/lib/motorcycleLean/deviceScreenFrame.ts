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
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
  } catch {
    /* ignore */
  }
  try {
    const o = (typeof window !== 'undefined' ? (window as Window & { orientation?: number }).orientation : undefined) as
      | number
      | undefined;
    if (typeof o === 'number' && Number.isFinite(o)) return o;
  } catch {
    /* ignore */
  }
  return 0;
}
