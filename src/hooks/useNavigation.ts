import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../lib/geoUtils';
import { parseRouteData } from '../lib/gpx';
import { requestJson } from '../lib/network';

export interface NavState {
  distanceToNext: number | null;
  bearingToNext: number | null;
  isOnRoute: boolean;
  instruction: string;
  /** Segunda línea: carteles de autovía, ref. de vía, etc. */
  instructionDetail?: string | null;
  maneuverLocation?: { lat: number; lng: number } | null;
  routeGeometry?: any;
  maneuverType?: string;
  maneuverModifier?: string;
  /** OSRM: número de salida en rotonda (1-based), para el icono. */
  roundaboutExit?: number | null;
}

/** Normaliza texto tipo cartel OSRM "A-1; Madrid" → más legible */
function formatDestinations(raw: string): string {
  if (!raw?.trim()) return '';
  return raw
    .split(/[;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}

function roadLabel(name?: string, ref?: string): string {
  const r = ref?.trim();
  const n = name?.trim();
  if (r && n) return `${r} (${n})`;
  return r || n || '';
}

/** OSRM usa salida 1-based en rotondas (sentido horario desde la entrada). */
function spanishRoundaboutExit(exit: number): string {
  const words: Record<number, string> = {
    1: 'la 1.ª salida',
    2: 'la 2.ª salida',
    3: 'la 3.ª salida',
    4: 'la 4.ª salida',
    5: 'la 5.ª salida',
    6: 'la 6.ª salida',
    7: 'la 7.ª salida',
    8: 'la 8.ª salida',
    9: 'la 9.ª salida',
    10: 'la 10.ª salida',
  };
  if (words[exit]) return words[exit];
  return `la salida ${exit}`;
}

/** Número de salida en rotonda (OSRM, 1-based en `maneuver.exit`). */
function getRoundaboutExitNumber(maneuver: Record<string, unknown>): number | null {
  const raw = maneuver?.exit;
  if (typeof raw === 'number' && raw > 0 && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === 'string') {
    const n = parseInt(String(raw).replace(/\D/g, ''), 10);
    if (n > 0) return n;
  }
  return null;
}

/**
 * El primer paso útil: sin "depart" ni "arrive" final (punto ficticio a 500 m).
 */
function pickNextManeuverStep(steps: any[]): any | null {
  if (!steps?.length) return null;
  const meaningful = steps.filter((s, i) => {
    const t = s.maneuver?.type;
    if (t === 'depart') return false;
    if (t === 'arrive' && i === steps.length - 1) return false;
    return true;
  });
  if (meaningful.length) return meaningful[0];
  const noDepart = steps.filter((s) => s.maneuver?.type !== 'depart');
  if (noDepart.length >= 2 && noDepart[noDepart.length - 1].maneuver?.type === 'arrive') {
    return noDepart[noDepart.length - 2];
  }
  return noDepart[0] || steps[0];
}

function buildStepInstruction(step: any, isOnRouteNow: boolean): { instruction: string; detail: string | null } {
  const maneuver = step.maneuver || {};
  const type = maneuver.type as string | undefined;
  const mod = ((maneuver.modifier || '') as string).toLowerCase();
  const name = step.name as string | undefined;
  const ref = step.ref as string | undefined;
  const destinations = formatDestinations((step.destinations as string) || '');

  let instruction = 'Sigue la ruta';
  let detail: string | null = null;

  const appendRoad = (base: string) => {
    const lbl = roadLabel(name, ref);
    if (lbl) return `${base} por ${lbl}`;
    return base;
  };

  switch (type) {
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn': {
      const exit = getRoundaboutExitNumber(maneuver as Record<string, unknown>);
      if (exit != null && exit > 0) {
        instruction = `Rotonda: toma ${spanishRoundaboutExit(exit)}`;
        detail =
          'Cuenta las salidas en el sentido de las agujas del reloj desde donde entras. Si hay duda, sigue la línea azul en el mapa.';
      } else {
        instruction = 'Entra en la rotonda y sigue el trazado';
        detail =
          'En cuanto el mapa muestre el número de salida, úsalo; si no, sigue la curva de la ruta.';
      }
      const road = roadLabel(name, ref);
      if (road) detail = `${road}. ${detail}`;
      break;
    }

    case 'exit roundabout':
    case 'exit rotary':
      if (mod.includes('right')) instruction = 'Sal de la rotonda por la derecha';
      else if (mod.includes('left')) instruction = 'Sal de la rotonda por la izquierda';
      else if (mod.includes('straight') || mod.includes('slight')) instruction = 'Sal de la rotonda (sigue de frente)';
      else instruction = 'Sal de la rotonda';
      if (name || ref) detail = roadLabel(name, ref) || null;
      break;

    case 'off ramp':
      if (destinations) {
        instruction = `Toma la salida hacia ${destinations}`;
      } else if (mod.includes('left')) {
        instruction = 'Toma la salida a tu izquierda';
      } else if (mod.includes('right')) {
        instruction = 'Toma la salida a tu derecha';
      } else {
        instruction = 'Toma la salida de la autovía';
      }
      if (ref || (name && !destinations)) detail = roadLabel(name, ref) || null;
      break;

    case 'on ramp':
    case 'ramp':
      if (destinations) {
        instruction = `Incorpórate hacia ${destinations}`;
      } else {
        instruction = 'Por el carril de aceleración, incorpórate a la vía principal';
      }
      if (name || ref) detail = roadLabel(name, ref) || null;
      break;

    case 'merge':
      if (mod.includes('left')) instruction = 'Incorpórate por la izquierda';
      else if (mod.includes('right') || mod.includes('slight right')) instruction = 'Incorpórate por la derecha';
      else instruction = 'Incorpórate en el tráfico';
      if (name || ref) detail = roadLabel(name, ref) || null;
      break;

    case 'fork':
      if (mod.includes('left')) instruction = 'En la bifurcación, mantente a la izquierda';
      else if (mod.includes('right')) instruction = 'En la bifurcación, mantente a la derecha';
      else instruction = 'En la bifurcación, sigue la vía principal';
      if (destinations) detail = destinations;
      else if (name || ref) detail = roadLabel(name, ref) || null;
      break;

    case 'end of road':
      if (mod.includes('right')) instruction = 'Al final de la vía, gira a la derecha';
      else if (mod.includes('left')) instruction = 'Al final de la vía, gira a la izquierda';
      else instruction = 'Al final de la vía, continúa';
      if (name || ref) detail = roadLabel(name, ref) || null;
      break;

    case 'turn': {
      if (mod.includes('uturn') || mod === 'u-turn') instruction = 'Gira en sentido contrario (giro de 180°)';
      else if (mod.includes('sharp right')) instruction = 'Gira fuerte a la derecha';
      else if (mod.includes('sharp left')) instruction = 'Gira fuerte a la izquierda';
      else if (mod.includes('slight right')) instruction = 'Gira ligeramente a la derecha';
      else if (mod.includes('slight left')) instruction = 'Gira ligeramente a la izquierda';
      else if (mod.includes('right')) instruction = 'Gira a la derecha';
      else if (mod.includes('left')) instruction = 'Gira a la izquierda';
      else if (mod.includes('straight')) instruction = 'Sigue recto';
      else instruction = 'Gira según la vía';
      instruction = appendRoad(instruction);
      break;
    }

    case 'continue':
      instruction = appendRoad('Sigue recto');
      break;

    case 'new name':
      if (ref || name) instruction = `Continúa por ${roadLabel(name, ref)}`;
      else instruction = 'Continúa por la misma vía';
      break;

    case 'notification':
      instruction = (maneuver as any).instruction || 'Atención al trazado';
      break;

    case 'arrive':
      instruction = isOnRouteNow ? 'Continúa hacia el destino' : 'Incorpórate a la ruta';
      break;

    default:
      if (type === 'depart') {
        instruction = appendRoad('Inicia el recorrido');
      } else if (destinations) {
        instruction = `Hacia ${destinations}`;
        detail = roadLabel(name, ref) || null;
      } else {
        instruction = appendRoad('Sigue la ruta');
      }
  }

  return { instruction, detail };
}

export const useNavigation = (currentLocation: { lat: number; lng: number } | null, routeGeoJSON: any) => {
  const [navState, setNavState] = useState<NavState>({
    distanceToNext: null,
    bearingToNext: null,
    isOnRoute: false,
    instruction: 'Esperando ruta...',
    instructionDetail: null,
    maneuverLocation: null,
    routeGeometry: null,
    roundaboutExit: null,
  });

  const lastFetchLoc = useRef<{ lat: number; lng: number } | null>(null);
  const currentTarget = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchAtRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!routeGeoJSON) {
      setNavState((prev) => ({
        ...prev,
        instruction: 'Sin ruta cargada',
        instructionDetail: null,
        routeGeometry: null,
        roundaboutExit: null,
      }));
      return;
    }
    if (!currentLocation) {
      setNavState((prev) => ({
        ...prev,
        instruction: 'Buscando GPS...',
        instructionDetail: null,
        routeGeometry: null,
        roundaboutExit: null,
      }));
      return;
    }

    try {
      let coords: number[][] = [];
      const parsedGeoJSON = parseRouteData(routeGeoJSON);

      if (!parsedGeoJSON) return;

      if (parsedGeoJSON.features && parsedGeoJSON.features.length > 0) {
        const feature = parsedGeoJSON.features.find((f: any) => f.geometry.type === 'LineString');
        if (feature) coords = feature.geometry.coordinates;
      } else if (parsedGeoJSON.type === 'LineString') {
        coords = parsedGeoJSON.coordinates;
      }

      if (coords.length === 0) return;

      let minDistance = Infinity;
      let closestIndex = 0;

      for (let i = 0; i < coords.length; i++) {
        const dist = getDistance(currentLocation.lat, currentLocation.lng, coords[i][1], coords[i][0]);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = i;
        }
      }

      const isOnRoute = minDistance < 50;

      let targetPoint: { lat: number; lng: number };
      if (!isOnRoute) {
        targetPoint = { lat: coords[closestIndex][1], lng: coords[closestIndex][0] };
      } else {
        let targetIndex = closestIndex;
        let distAhead = 0;
        // Más horizonte que 500 m para anticipar salidas de autovía y rotondas enlazadas
        while (targetIndex < coords.length - 1 && distAhead < 900) {
          targetIndex++;
          distAhead += getDistance(
            coords[targetIndex - 1][1],
            coords[targetIndex - 1][0],
            coords[targetIndex][1],
            coords[targetIndex][0]
          );
        }
        targetPoint = { lat: coords[targetIndex][1], lng: coords[targetIndex][0] };
      }

      const now = Date.now();
      const shouldFetch =
        !lastFetchLoc.current ||
        getDistance(currentLocation.lat, currentLocation.lng, lastFetchLoc.current.lat, lastFetchLoc.current.lng) > 40 ||
        !currentTarget.current ||
        getDistance(targetPoint.lat, targetPoint.lng, currentTarget.current.lat, currentTarget.current.lng) > 100;
      const fetchCooldownPassed = now - lastFetchAtRef.current > 3500;

      if (shouldFetch && fetchCooldownPassed) {
        lastFetchLoc.current = currentLocation;
        currentTarget.current = targetPoint;
        lastFetchAtRef.current = now;

        if (activeRequestRef.current) {
          activeRequestRef.current.abort();
        }
        const controller = new AbortController();
        activeRequestRef.current = controller;

        requestJson<any>(
          `https://router.project-osrm.org/route/v1/driving/${currentLocation.lng},${currentLocation.lat};${targetPoint.lng},${targetPoint.lat}?steps=true&overview=full&geometries=geojson`,
          { signal: controller.signal, timeoutMs: 9000, retries: 1, backoffMs: 400 }
        )
          .then((data) => {
            if (data.code === 'Ok' && data.routes.length > 0) {
              const route = data.routes[0];
              const steps = route.legs[0].steps;
              const geometry = route.geometry;

              const nextStep = pickNextManeuverStep(steps);
              if (!nextStep?.maneuver) return;

              const maneuver = nextStep.maneuver;
              const { instruction, detail } = buildStepInstruction(nextStep, isOnRoute);

              const maneuverLoc = { lat: maneuver.location[1], lng: maneuver.location[0] };
              const rbExit = getRoundaboutExitNumber(maneuver as Record<string, unknown>);

              setNavState({
                distanceToNext: Math.round(getDistance(currentLocation.lat, currentLocation.lng, maneuverLoc.lat, maneuverLoc.lng)),
                bearingToNext: maneuver.bearing_after,
                isOnRoute,
                instruction,
                instructionDetail: detail,
                maneuverLocation: maneuverLoc,
                routeGeometry: geometry,
                maneuverType: maneuver.type,
                maneuverModifier: maneuver.modifier || '',
                roundaboutExit:
                  maneuver.type === 'roundabout' ||
                  maneuver.type === 'rotary' ||
                  maneuver.type === 'roundabout turn'
                    ? rbExit
                    : null,
              });
            }
          })
          .catch((err) => {
            if (err?.name === 'AbortError') return;
            console.error('OSRM error', err);
            setNavState((prev) => ({
              ...prev,
              distanceToNext: Math.round(minDistance),
              isOnRoute,
              instruction: isOnRoute ? 'Sigue la ruta' : 'Dirígete a la ruta',
              instructionDetail: null,
              routeGeometry: null,
              maneuverType: undefined,
              maneuverModifier: undefined,
              roundaboutExit: null,
            }));
          });
      } else {
        setNavState((prev) => {
          if (prev.maneuverLocation) {
            return {
              ...prev,
              distanceToNext: Math.round(
                getDistance(currentLocation.lat, currentLocation.lng, prev.maneuverLocation.lat, prev.maneuverLocation.lng)
              ),
              isOnRoute,
            };
          }
          return { ...prev, isOnRoute };
        });
      }
    } catch (e) {
      console.error('Navigation error', e);
    }
  }, [currentLocation, routeGeoJSON]);

  return navState;
};
