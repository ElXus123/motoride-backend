import { useState, useEffect, useRef } from 'react';
import {
  getLineCoordinates,
  snapPointToRouteDetailed,
  routeDrivingBearing,
  lerpAngleDegrees,
} from '../lib/navigationPose';
import { getBearing } from '../lib/geoUtils';

type NavLike = {
  routeGeometry?: any;
  maneuverLocation?: { lat: number; lng: number } | null;
  bearingToNext?: number | null;
  distanceToNext?: number | null;
};

/**
 * Rumbo estable para la flecha del mapa (tipo Waze/Maps embebido):
 * en ruta → tangente a la polilínea; fuera → GPS + COG suavizado.
 */
export function useNavigationHeading(
  gpsHeading: number | null,
  speedMps: number | null,
  courseOverGround: number | null,
  currentLocation: { lat: number; lng: number } | null,
  parsedRouteGeo: any | null,
  navState: NavLike
): number {
  const [displayHeading, setDisplayHeading] = useState(0);
  const hasLockRef = useRef(false);

  const routeGeo = navState.routeGeometry || parsedRouteGeo;
  const distM = navState.distanceToNext;

  useEffect(() => {
    const speed = speedMps ?? 0;
    const snap =
      currentLocation && routeGeo ? snapPointToRouteDetailed(currentLocation.lat, currentLocation.lng, routeGeo) : null;
    const coords = routeGeo ? getLineCoordinates(routeGeo) : [];

    const ON_ROUTE_M = 45;
    let target: number | null = null;

    if (snap && snap.distanceMeters <= ON_ROUTE_M && coords.length >= 2) {
      target = routeDrivingBearing(coords, snap.segmentIndex, snap.alongT);
      const man = navState.maneuverLocation;
      if (distM != null && distM < 140 && man && currentLocation) {
        const towardManeuver = getBearing(currentLocation.lat, currentLocation.lng, man.lat, man.lng);
        const w = Math.max(0, Math.min(0.22, ((140 - distM) / 140) * 0.35));
        target = lerpAngleDegrees(target, towardManeuver, w);
      }
      const osrmBearing = navState.bearingToNext;
      if (osrmBearing != null && typeof osrmBearing === 'number' && distM != null && distM < 90) {
        target = lerpAngleDegrees(target, osrmBearing, 0.12);
      }
    } else if (gpsHeading != null && Number.isFinite(gpsHeading) && speed >= 2.5) {
      target = gpsHeading;
    } else if (courseOverGround != null && Number.isFinite(courseOverGround) && speed >= 0.8) {
      target = courseOverGround;
    } else if (gpsHeading != null && Number.isFinite(gpsHeading)) {
      target = gpsHeading;
    }

    if (target == null) {
      return;
    }

    setDisplayHeading((prev) => {
      if (!hasLockRef.current) {
        hasLockRef.current = true;
        return target as number;
      }
      const onRoute = snap != null && snap.distanceMeters <= ON_ROUTE_M;
      const alpha = onRoute
        ? speed > 10
          ? 0.52
          : speed > 5
            ? 0.4
            : 0.3
        : speed > 8
          ? 0.45
          : speed > 3
            ? 0.32
            : 0.22;
      return lerpAngleDegrees(prev, target as number, alpha);
    });
  }, [
    gpsHeading,
    speedMps,
    courseOverGround,
    currentLocation?.lat,
    currentLocation?.lng,
    parsedRouteGeo,
    navState.routeGeometry,
    navState.maneuverLocation?.lat,
    navState.maneuverLocation?.lng,
    navState.bearingToNext,
    distM,
    routeGeo,
  ]);

  return displayHeading;
}
