import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../lib/geoUtils';
import { requestJson } from '../lib/network';

/** Datos de infraestructura vial: cámaras de velocidad, radares fijos y riesgo de lluvia. */
export type RoadData = {
  radars: any[];
  nearestRadarDistanceM: number | null;
  /** Puntos de la ruta + posición actual para revisar precipitaciones. */
  precipPoints: { lat: number; lng: number }[];
  /** Último timestamp de revisión de lluvia, o 0 si nunca revisado. */
  lastPrecipCheck: number;
};

/** Intervalo de revisión de precipitaciones (ms). */
const PRECIP_CHECK_INTERVAL_MS = 60000;

export const useRoadData = (
  currentLocation: { lat: number; lng: number } | null,
  routeCoords?: number[][] // polilínea de la ruta en [lon,lat]
) => {
  const [roadData, setRoadData] = useState<RoadData>({
    radars: [],
    nearestRadarDistanceM: null,
    precipPoints: [],
    lastPrecipCheck: 0,
  });

  const lastFetchLoc = useRef<{ lat: number; lng: number } | null>(null);
  const checkIntervalRef = useRef<number | null>(null);

  /** Puntos para revisión de lluvia: posición actual + puntos de la ruta espaciados. */
  const buildPrecipPoints = (): { lat: number; lng: number }[] => {
    const pts: { lat: number; lng: number }[] = [];
    if (currentLocation) {
      pts.push(currentLocation);
    }
    if (routeCoords && routeCoords.length >= 2) {
      // Espaciar puntos a lo largo de la ruta (cada 200m aprox)
      for (let i = 0; i < routeCoords.length - 1; i++) {
        const segM = getDistance(routeCoords[i][1], routeCoords[i][0], routeCoords[i + 1][1], routeCoords[i + 1][0]);
        if (segM > 300) {
          const t = Math.min(1, (pts.length * 300) / segM);
          const lng = routeCoords[i][0] + t * (routeCoords[i + 1][0] - routeCoords[i][0]);
          const lat = routeCoords[i][1] + t * (routeCoords[i + 1][1] - routeCoords[i][1]);
          pts.push({ lat, lng });
        }
      }
    }
    // Deduplicar puntos cercanos
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

  const fetchRoadData = (): void => {
    if (!currentLocation) {
      setRoadData(prev => ({ ...prev, precipPoints: [], lastPrecipCheck: Date.now() }));
      return;
    }

    // Overpass API query for speed cameras within 5km
    const query = `[out:json]; node(around:5000,${currentLocation.lat},${currentLocation.lng})[highway=speed_camera]; out;`;
    requestJson<any>(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
      timeoutMs: 12000,
      retries: 1,
      backoffMs: 800,
    })
      .then((data) => {
        const radars = (data.elements ?? []).map((e: any) => ({ lat: e.lat, lng: e.lon }));
        let minDistance = Infinity;
        for (const radar of radars) {
          const dist = getDistance(currentLocation.lat, currentLocation.lng, radar.lat, radar.lng);
          if (dist < minDistance) minDistance = dist;
        }

        const points = buildPrecipPoints();
        setRoadData(prev => ({
          ...prev,
          radars,
          nearestRadarDistanceM: minDistance < Infinity ? Math.round(minDistance) : null,
          precipPoints: points,
          lastPrecipCheck: Date.now(),
        }));
      })
      .catch((error) => {
        console.warn('Overpass API unavailable:', error);
        setRoadData(prev => ({ ...prev, radars: [], nearestRadarDistanceM: null, lastPrecipCheck: Date.now() }));
      });
  };

  useEffect(() => {
    fetchRoadData();

    // Intervalo para refrescar datos cada minuto (revisa también precipitaciones)
    checkIntervalRef.current = window.setInterval(fetchRoadData, PRECIP_CHECK_INTERVAL_MS) as unknown as number;

    return () => {
      if (checkIntervalRef.current !== null) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [currentLocation, routeCoords]);

  return roadData;
};
