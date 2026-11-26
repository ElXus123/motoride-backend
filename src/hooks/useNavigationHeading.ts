import { useState, useEffect, useRef } from 'react';
import { getLineCoordinates, routeDrivingBearing, lerpAngleDegrees } from '../lib/navigationPose';

type NavLike = {
  isOnRoute?: boolean;
  snapped?: { lat: number; lng: number } | null;
  segmentIndex?: number;
  alongT?: number;
};

/** Velocidad (m/s) a partir de la que el GPS/COG se considera fiable para el rumbo. */
const MIN_GPS_HEADING_MPS = 2.5;
const MIN_COG_MPS = 0.8;

/**
 * Rumbo estable para la flecha del mapa.
 * - En ruta: tangente del trazado ORIGINAL (no de la guía OSRM), así la flecha sigue la curva real.
 * - Fuera de ruta: GPS o COG suavizado, solo si hay velocidad suficiente.
 * - Parado: se mantiene el último rumbo (no salta a 0° ni al rumbo ruidoso del GPS).
 */
export function useNavigationHeading(
  gpsHeading: number | null,
  speedMps: number | null,
  courseOverGround: number | null,
  _currentLocation: { lat: number; lng: number } | null,
  parsedRouteGeo: any | null,
  navState: NavLike
): number {
  const [displayHeading, setDisplayHeading] = useState(0);
  const hasLockRef = useRef(false);

  const onRoute = !!navState.isOnRoute && !!navState.snapped;
  const segIdx = navState.segmentIndex ?? 0;
  const alongT = navState.alongT ?? 0;

  useEffect(() => {
    const speed = speedMps ?? 0;
    const coords = parsedRouteGeo ? getLineCoordinates(parsedRouteGeo) : [];
    const gpsOk = gpsHeading != null && Number.isFinite(gpsHeading);
    const cogOk = courseOverGround != null && Number.isFinite(courseOverGround);

    let target: number | null = null;
    if (onRoute && coords.length >= 2) {
      target = routeDrivingBearing(coords, segIdx, alongT);
    } else if (gpsOk && speed >= MIN_GPS_HEADING_MPS) {
      target = gpsHeading as number;
    } else if (cogOk && speed >= MIN_COG_MPS) {
      target = courseOverGround as number;
    } else if (gpsOk && !hasLockRef.current) {
      // Primer rumbo disponible aunque estés parado: mejor que 0°.
      target = gpsHeading as number;
    }

    // Sin dato fiable (parado / sin GPS): conservar el último rumbo mostrado.
    if (target == null || !Number.isFinite(target)) return;

    setDisplayHeading((prev) => {
      if (!hasLockRef.current) {
        hasLockRef.current = true;
        return target as number;
      }
      const alpha = onRoute
        ? speed > 10
          ? 0.5
          : speed > 5
            ? 0.38
            : 0.28
        : speed > 8
          ? 0.45
          : speed > 3
            ? 0.32
            : 0.22;
      return lerpAngleDegrees(prev, target as number, alpha);
    });
  }, [gpsHeading, speedMps, courseOverGround, onRoute, segIdx, alongT, parsedRouteGeo]);

  return displayHeading;
}
