import { useState, useEffect, useRef, useMemo } from 'react';
import { getDistance } from '../lib/geoUtils';
import { getLineCoordinates } from '../lib/navigationPose';
import { requestJson } from '../lib/network';

export type RadarPoint = { lat: number; lng: number };

/** Radar fijo cercano, con distancia en línea recta desde la posición actual. */
export type NearbyRadar = RadarPoint & { distanceM: number };

/** Datos de infraestructura vial: cámaras de velocidad, radares fijos y riesgo de lluvia. */
export type RoadData = {
  radars: RadarPoint[];
  nearestRadarDistanceM: number | null;
  /** Puntos de la ruta + posición actual para revisar precipitaciones. */
  precipPoints: { lat: number; lng: number }[];
  /** Último timestamp de revisión de lluvia, o 0 si nunca revisado. */
  lastPrecipCheck: number;
  /** Radares a ≤ NEARBY_RADAR_RADIUS_M, ordenados por distancia y limitados a NEARBY_RADAR_MAX (para no saturar el mapa). */
  radarsNearby: NearbyRadar[];
};

/** Intervalo de revisión de precipitaciones y radares (ms). */
const PRECIP_CHECK_INTERVAL_MS = 60000;
/** Solo se vuelve a consultar Overpass si te has movido este tramo (m) o ha pasado el intervalo. */
const REFETCH_MOVE_M = 400;
/** Radio de consulta a Overpass (m). */
const QUERY_RADIUS_M = 5000;
/** Radares que se dibujan como cercanos. */
const NEARBY_RADAR_RADIUS_M = 2000;
const NEARBY_RADAR_MAX = 8;

/**
 * @param routeGeo ruta del grupo ya parseada (GeoJSON); se usa para espaciar puntos de lluvia a lo largo del trazado.
 */
export const useRoadData = (
  currentLocation: { lat: number; lng: number } | null,
  routeGeo?: any
) => {
  const [roadData, setRoadData] = useState<Omit<RoadData, 'radarsNearby'>>({
    radars: [],
    nearestRadarDistanceM: null,
    precipPoints: [],
    lastPrecipCheck: 0,
  });

  const routeCoords = useMemo(() => getLineCoordinates(routeGeo), [routeGeo]);

  const lastFetchLoc = useRef<{ lat: number; lng: number } | null>(null);
  const locRef = useRef(currentLocation);
  locRef.current = currentLocation;
  const routeRef = useRef(routeCoords);
  routeRef.current = routeCoords;

  /** Puntos para revisión de lluvia: posición actual + puntos de la ruta espaciados (~300 m). */
  const buildPrecipPoints = (loc: { lat: number; lng: number } | null): { lat: number; lng: number }[] => {
    const pts: { lat: number; lng: number }[] = [];
    if (loc) pts.push(loc);
    const coords = routeRef.current;
    if (coords.length >= 2) {
      for (let i = 0; i < coords.length - 1; i++) {
        const segM = getDistance(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
        if (segM > 300) {
          const t = Math.min(1, (pts.length * 300) / segM);
          const lng = coords[i][0] + t * (coords[i + 1][0] - coords[i][0]);
          const lat = coords[i][1] + t * (coords[i + 1][1] - coords[i][1]);
          pts.push({ lat, lng });
        }
      }
    }
    const seen = new Set<string>();
    const unique: { lat: number; lng: number }[] = [];
    for (const p of pts) {
      const k = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(p);
      }
    }
    return unique;
  };

  const fetchRoadData = (loc: { lat: number; lng: number } | null): void => {
    lastFetchLoc.current = loc;
    if (!loc) {
      setRoadData((prev) => ({ ...prev, precipPoints: [], lastPrecipCheck: Date.now() }));
      return;
    }

    // Overpass: cámaras de velocidad / radares fijos en 5 km.
    const query = `[out:json]; node(around:${QUERY_RADIUS_M},${loc.lat},${loc.lng})[highway=speed_camera]; out;`;
    requestJson<any>(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      timeoutMs: 12000,
      retries: 1,
      backoffMs: 800,
    })
      .then((data) => {
        const radars: RadarPoint[] = (data.elements ?? []).map((e: any) => ({ lat: e.lat, lng: e.lon }));
        let minDistance = Infinity;
        for (const radar of radars) {
          const dist = getDistance(loc.lat, loc.lng, radar.lat, radar.lng);
          if (dist < minDistance) minDistance = dist;
        }
        const points = buildPrecipPoints(loc);
        setRoadData((prev) => ({
          ...prev,
          radars,
          nearestRadarDistanceM: minDistance < Infinity ? Math.round(minDistance) : null,
          precipPoints: points,
          lastPrecipCheck: Date.now(),
        }));
      })
      .catch((error) => {
        console.warn('Overpass API unavailable:', error);
        setRoadData((prev) => ({ ...prev, radars: [], nearestRadarDistanceM: null, lastPrecipCheck: Date.now() }));
      });
  };

  // Consulta al moverse un tramo significativo (antes se consultaba en cada fijo GPS).
  useEffect(() => {
    const loc = currentLocation;
    if (!loc) return;
    const last = lastFetchLoc.current;
    const moved = !last || getDistance(loc.lat, loc.lng, last.lat, last.lng) > REFETCH_MOVE_M;
    if (moved) fetchRoadData(loc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation?.lat, currentLocation?.lng]);

  // Revisión periódica (también refresca precipitaciones a lo largo de la ruta).
  useEffect(() => {
    const id = window.setInterval(() => fetchRoadData(locRef.current), PRECIP_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de ruta: recalcular puntos de lluvia con la nueva geometría.
  useEffect(() => {
    if (!routeCoords.length) return;
    setRoadData((prev) => ({ ...prev, precipPoints: buildPrecipPoints(locRef.current) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCoords]);

  const radarsNearby = useMemo<NearbyRadar[]>(() => {
    if (!currentLocation || roadData.radars.length === 0) return [];
    return roadData.radars
      .map((r) => ({ ...r, distanceM: getDistance(currentLocation.lat, currentLocation.lng, r.lat, r.lng) }))
      .filter((r) => r.distanceM <= NEARBY_RADAR_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, NEARBY_RADAR_MAX);
  }, [currentLocation?.lat, currentLocation?.lng, roadData.radars]);

  return { ...roadData, radarsNearby };
};
