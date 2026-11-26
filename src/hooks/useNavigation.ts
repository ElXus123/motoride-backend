import { useState, useEffect, useRef, useMemo } from 'react';
import { getBearing, getDistance } from '../lib/geoUtils';
import { parseRouteData } from '../lib/gpx';
import { getLineCoordinates } from '../lib/navigationPose';
import { requestJson } from '../lib/network';
import { formatNavDistanceMeters } from '../lib/navFormat';
import {
  buildRouteIndex,
  detectRouteCurves,
  evaluateRouteStatus,
  fallbackAverageSpeedKmh,
  nextCurveAhead,
  type CurveAhead,
  type RouteIndex,
  type RouteManeuver,
} from '../lib/routeProgress';

/** Aviso de curva: se muestra desde esta distancia (m) antes de la entrada. */
export const CURVE_WARN_DISTANCE_M = 250;

export interface NavState {
  /** Metros: por el trazado hasta la siguiente maniobra, o hasta la ruta si estás desviado. */
  distanceToNext: number | null;
  bearingToNext: number | null;
  isOnRoute: boolean;
  instruction: string;
  /** Segunda línea: detalle de la maniobra o qué hacer si te has desviado. */
  instructionDetail?: string | null;
  maneuverLocation?: { lat: number; lng: number } | null;
  /** Solo cuando estás fuera del trazado: guía OSRM de vuelta hasta el punto más cercano del trazado. Nunca sustituye al trazado. */
  routeGeometry?: any;
  maneuverType?: string;
  maneuverModifier?: string;
  /** Reservado: el trazado GPX no trae número de salida de rotonda. */
  roundaboutExit?: number | null;
  /** Proyección de la posición sobre el trazado original (para la flecha y el marcador). */
  snapped?: { lat: number; lng: number } | null;
  segmentIndex?: number;
  alongT?: number;
  /** Metros desde el inicio del trazado. */
  alongM?: number | null;
  /** Metros que faltan para el final del trazado. */
  remainingM?: number | null;
  /** Próxima curva revirada del trazado (solo en ruta): entrada a menos de CURVE_WARN_DISTANCE_M. */
  curveAhead?: CurveAhead | null;
  /** Distancia desde la posición real hasta el trazado. */
  offRouteM?: number | null;
  /** Velocidad media usada para el tiempo restante (km/h): la del viaje si hay datos, si no una de referencia. */
  avgSpeedKmh?: number | null;
  /** true si la media sale de este viaje (ya hay >= 3 min y >= 2 km); false si es la de referencia. */
  avgSpeedObserved?: boolean;
  /** Tiempo restante estimado (s) por el trazado a la velocidad media. */
  remainingTimeS?: number | null;
  /** Hora estimada de llegada (epoch ms). */
  etaMs?: number | null;
}

/** Datos mínimos del viaje para usar la velocidad media real: tiempo y distancia recorridos. */
const TRIP_MIN_S = 180;
const TRIP_MIN_M = 2000;

const IDLE: NavState = {
  distanceToNext: null,
  bearingToNext: null,
  isOnRoute: false,
  instruction: 'Esperando ruta...',
  instructionDetail: null,
  maneuverLocation: null,
  routeGeometry: null,
  roundaboutExit: null,
  snapped: null,
};

function turnLabel(modifier: string): string {
  switch (modifier) {
    case 'uturn':
      return 'Da la vuelta';
    case 'sharp left':
      return 'Gira fuerte a la izquierda';
    case 'sharp right':
      return 'Gira fuerte a la derecha';
    case 'slight left':
      return 'Gira ligeramente a la izquierda';
    case 'slight right':
      return 'Gira ligeramente a la derecha';
    case 'left':
      return 'Gira a la izquierda';
    case 'right':
      return 'Gira a la derecha';
    default:
      return 'Sigue el trazado';
  }
}

function maneuverLabel(m: RouteManeuver): string {
  return m.kind === 'roundabout' ? 'Rotonda' : turnLabel(m.modifier);
}

const CARDINALS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
function cardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Fija el rumbo OSRM de vuelta al trazado; se pide poco, con límite de frecuencia. */
const RETURN_FETCH_COOLDOWN_MS = 8000;
const RETURN_FETCH_MIN_MOVE_M = 25;

export const useNavigation = (currentLocation: { lat: number; lng: number } | null, routeGeoJSON: any) => {
  const [navState, setNavState] = useState<NavState>(IDLE);

  /** Índice del trazado original: distancias acumuladas y maniobras, sin recalcular nada. */
  const index: RouteIndex | null = useMemo(() => {
    if (!routeGeoJSON) return null;
    const parsed = parseRouteData(routeGeoJSON);
    if (!parsed) return null;
    return buildRouteIndex(getLineCoordinates(parsed));
  }, [routeGeoJSON]);

  /** Curvas revirados del trazado (radio <= CURVE_ALERT_MAX_RADIUS_M), calculadas una vez por ruta. */
  const curves = useMemo(() => (index ? detectRouteCurves(index) : []), [index]);

  const prevRef = useRef<{ onRoute: boolean; alongM: number | null }>({ onRoute: false, alongM: null });
  const returnGeomRef = useRef<any>(null);
  const returnFetchRef = useRef({ at: 0, lat: Number.NaN, lng: Number.NaN });
  const returnCtrlRef = useRef<AbortController | null>(null);
  /** Inicio del viaje sobre esta ruta: instante y distancia por el trazado (para la velocidad media real). */
  const tripRef = useRef<{ t0: number; m0: number } | null>(null);

  useEffect(() => {
    prevRef.current = { onRoute: false, alongM: null };
    returnGeomRef.current = null;
    tripRef.current = null;
  }, [index]);

  useEffect(() => {
    return () => {
      returnCtrlRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!routeGeoJSON) {
      setNavState({ ...IDLE, instruction: 'Sin ruta cargada' });
      return;
    }
    if (!index) {
      setNavState({ ...IDLE, instruction: 'Ruta no válida' });
      return;
    }
    if (!currentLocation) {
      setNavState({ ...IDLE, instruction: 'Buscando GPS...' });
      return;
    }

    const st = evaluateRouteStatus(index, currentLocation.lat, currentLocation.lng, prevRef.current);
    prevRef.current = { onRoute: st.onRoute, alongM: st.alongM };
    const { proj } = st;
    const snapped = { lat: proj.lat, lng: proj.lng };

    // Tiempo restante y hora de llegada. Velocidad media: la del viaje (incluye paradas y semáforos) cuando hay
    // >= 3 min y >= 2 km recorridos por el trazado; antes, la de referencia por densidad de curvas (ver routeProgress.ts).
    const nowMs = Date.now();
    if (st.onRoute && !tripRef.current) tripRef.current = { t0: nowMs, m0: st.alongM };
    const trip = tripRef.current;
    const tripS = trip ? (nowMs - trip.t0) / 1000 : 0;
    const tripM = trip ? st.alongM - trip.m0 : 0;
    const tripObserved = tripS >= TRIP_MIN_S && tripM >= TRIP_MIN_M;
    const avgSpeedKmh = tripObserved
      ? (tripM / tripS) * 3.6
      : fallbackAverageSpeedKmh(index.totalM, curves.length);
    const remainingTimeS = st.remainingM / (avgSpeedKmh / 3.6);

    const common = {
      isOnRoute: st.onRoute,
      snapped,
      segmentIndex: proj.segmentIndex,
      alongT: proj.alongT,
      alongM: st.alongM,
      remainingM: Math.round(st.remainingM),
      offRouteM: proj.offRouteM,
      roundaboutExit: null as number | null,
      curveAhead: st.onRoute ? nextCurveAhead(curves, st.alongM, CURVE_WARN_DISTANCE_M) : null,
      avgSpeedKmh: Math.round(avgSpeedKmh),
      avgSpeedObserved: tripObserved,
      remainingTimeS: Math.round(remainingTimeS),
      etaMs: nowMs + remainingTimeS * 1000,
    };

    if (!st.onRoute) {
      const bearing = getBearing(currentLocation.lat, currentLocation.lng, proj.lat, proj.lng);
      const offM = Math.round(proj.offRouteM);
      const now = Date.now();
      const rf = returnFetchRef.current;
      const movedM = Number.isFinite(rf.lat)
        ? getDistance(currentLocation.lat, currentLocation.lng, rf.lat, rf.lng)
        : Number.POSITIVE_INFINITY;
      if (now - rf.at > RETURN_FETCH_COOLDOWN_MS && movedM > RETURN_FETCH_MIN_MOVE_M) {
        rf.at = now;
        rf.lat = currentLocation.lat;
        rf.lng = currentLocation.lng;
        returnCtrlRef.current?.abort();
        const controller = new AbortController();
        returnCtrlRef.current = controller;
        requestJson<any>(
          `https://router.project-osrm.org/route/v1/driving/${currentLocation.lng},${currentLocation.lat};${proj.lng},${proj.lat}?overview=full&geometries=geojson`,
          { signal: controller.signal, timeoutMs: 9000, retries: 0 }
        )
          .then((data) => {
            const geom = data?.code === 'Ok' ? data.routes?.[0]?.geometry : null;
            if (!geom) return;
            returnGeomRef.current = geom;
            setNavState((prev) => (prev.isOnRoute ? prev : { ...prev, routeGeometry: geom }));
          })
          .catch((err) => {
            if (err?.name !== 'AbortError') console.warn('OSRM return path unavailable', err);
          });
      }
      setNavState({
        ...common,
        distanceToNext: offM,
        bearingToNext: bearing,
        instruction: 'Te has salido del trazado',
        instructionDetail: `Vuelve al trazado azul, hacia el ${cardinal(bearing)}. Tu ruta no ha cambiado.`,
        maneuverLocation: snapped,
        routeGeometry: returnGeomRef.current,
        maneuverType: undefined,
        maneuverModifier: undefined,
      });
      return;
    }

    // En ruta: se cancela cualquier guía de vuelta pendiente.
    returnCtrlRef.current?.abort();
    returnGeomRef.current = null;

    const { next, afterNext } = st;
    if (!next) {
      setNavState({
        ...common,
        distanceToNext: Math.round(st.remainingM),
        bearingToNext: null,
        instruction: 'Llegada al final del trazado',
        instructionDetail: st.remainingM > 20 ? 'Sigue el trazado azul hasta el final.' : null,
        maneuverLocation: null,
        routeGeometry: null,
        maneuverType: undefined,
        maneuverModifier: undefined,
      });
      return;
    }

    const distanceToNext = Math.round(st.nextDistM ?? 0);
    const afterGap = afterNext
      ? afterNext.alongM - (next.kind === 'roundabout' ? next.exitAlongM ?? next.alongM : next.alongM)
      : null;
    const luego =
      afterNext && afterGap != null
        ? `Luego: ${maneuverLabel(afterNext)} en ${formatNavDistanceMeters(Math.max(0, afterGap))}.`
        : null;

    let instruction: string;
    let detail: string | null;
    if (next.kind === 'roundabout') {
      if (st.inRoundabout) {
        instruction = 'Estás en la rotonda';
        detail = 'Sal por la salida que marca el trazado azul.';
      } else {
        instruction = 'Entra en la rotonda';
        detail = 'Sal por la salida que marca el trazado azul.';
      }
    } else {
      instruction = turnLabel(next.modifier);
      detail = null;
    }
    if (luego) detail = detail ? `${detail} ${luego}` : luego;

    setNavState({
      ...common,
      distanceToNext,
      bearingToNext: next.bearingAfter,
      instruction,
      instructionDetail: detail,
      maneuverLocation: { lat: next.lat, lng: next.lng },
      routeGeometry: null,
      maneuverType: next.kind === 'roundabout' ? 'roundabout' : 'turn',
      maneuverModifier: next.modifier,
    });
  }, [currentLocation, index, routeGeoJSON, curves]);

  return navState;
};
