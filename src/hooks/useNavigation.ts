import { useState, useEffect, useRef } from 'react';
import { getDistance, getBearing } from '../lib/geoUtils';
import { parseRouteData } from '../lib/gpx';
import { requestJson } from '../lib/network';

interface NavState {
  distanceToNext: number | null;
  bearingToNext: number | null;
  isOnRoute: boolean;
  instruction: string;
  maneuverLocation?: {lat: number, lng: number} | null;
  routeGeometry?: any;
  maneuverType?: string;
  maneuverModifier?: string;
}

export const useNavigation = (currentLocation: {lat: number, lng: number} | null, routeGeoJSON: any) => {
  const [navState, setNavState] = useState<NavState>({
    distanceToNext: null,
    bearingToNext: null,
    isOnRoute: false,
    instruction: 'Esperando ruta...',
    maneuverLocation: null,
    routeGeometry: null
  });

  const lastFetchLoc = useRef<{lat: number, lng: number} | null>(null);
  const currentTarget = useRef<{lat: number, lng: number} | null>(null);
  const lastFetchAtRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
    };
  }, []);

  const buildInstruction = (type?: string, modifier?: string, roadName?: string, isOnRouteNow?: boolean) => {
    let base = 'Sigue recto';
    if (type === 'turn') {
      if (modifier?.includes('right')) base = 'Gira a la derecha';
      else if (modifier?.includes('left')) base = 'Gira a la izquierda';
    } else if (type === 'off ramp') {
      base = modifier?.includes('left') ? 'Toma la salida izquierda' : 'Toma la salida derecha';
    } else if (type === 'roundabout') {
      base = 'En la rotonda, toma tu salida';
    } else if (type === 'merge') {
      base = 'Incorpórate a la vía';
    } else if (type === 'fork') {
      base = modifier?.includes('left') ? 'Mantente a la izquierda' : 'Mantente a la derecha';
    } else if (type === 'arrive') {
      base = isOnRouteNow ? 'Continúa por la ruta' : 'Incorpórate a la ruta';
    }

    if (roadName && roadName.trim().length > 0) {
      return `${base} hacia ${roadName}`;
    }
    return base;
  };

  useEffect(() => {
    if (!routeGeoJSON) {
      setNavState(prev => ({ ...prev, instruction: 'Sin ruta cargada', routeGeometry: null }));
      return;
    }
    if (!currentLocation) {
      setNavState(prev => ({ ...prev, instruction: 'Buscando GPS...', routeGeometry: null }));
      return;
    }

    try {
      let coords: number[][] = [];
      let parsedGeoJSON = parseRouteData(routeGeoJSON);
      
      if (!parsedGeoJSON) return;

      if (parsedGeoJSON.features && parsedGeoJSON.features.length > 0) {
        const feature = parsedGeoJSON.features.find((f: any) => f.geometry.type === 'LineString');
        if (feature) coords = feature.geometry.coordinates;
      } else if (parsedGeoJSON.type === 'LineString') {
        coords = parsedGeoJSON.coordinates;
      }

      if (coords.length === 0) return;

      // 1. Find closest point on route
      let minDistance = Infinity;
      let closestIndex = 0;

      for (let i = 0; i < coords.length; i++) {
        const dist = getDistance(currentLocation.lat, currentLocation.lng, coords[i][1], coords[i][0]);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = i;
        }
      }

      const isOnRoute = minDistance < 50; // within 50 meters

      // 2. Determine target point for routing
      let targetPoint;
      if (!isOnRoute) {
        targetPoint = { lat: coords[closestIndex][1], lng: coords[closestIndex][0] };
      } else {
        // Find a point ~500m ahead on the route to get the next instructions
        let targetIndex = closestIndex;
        let distAhead = 0;
        while (targetIndex < coords.length - 1 && distAhead < 500) {
          targetIndex++;
          distAhead += getDistance(coords[targetIndex-1][1], coords[targetIndex-1][0], coords[targetIndex][1], coords[targetIndex][0]);
        }
        targetPoint = { lat: coords[targetIndex][1], lng: coords[targetIndex][0] };
      }

      // 3. Call OSRM if we moved enough (>40m), target changed, and a small cooldown passed.
      const now = Date.now();
      const shouldFetch = !lastFetchLoc.current ||
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
          .then(data => {
            if (data.code === 'Ok' && data.routes.length > 0) {
              const route = data.routes[0];
              const steps = route.legs[0].steps;
              const geometry = route.geometry;
              
              // Find the first meaningful maneuver (skip immediate departs)
              let nextStep = steps[0];
              if (steps.length > 1 && steps[0].distance < 15) {
                nextStep = steps[1];
              }

              const maneuver = nextStep.maneuver;
              const type = maneuver.type;
              const modifier = maneuver.modifier || '';
              const name = nextStep.name || '';

              const instruction = buildInstruction(type, modifier, name, isOnRoute);

              const maneuverLoc = { lat: maneuver.location[1], lng: maneuver.location[0] };

              setNavState({
                distanceToNext: Math.round(getDistance(currentLocation.lat, currentLocation.lng, maneuverLoc.lat, maneuverLoc.lng)),
                bearingToNext: maneuver.bearing_after,
                isOnRoute,
                instruction,
                maneuverLocation: maneuverLoc,
                routeGeometry: geometry,
                maneuverType: type,
                maneuverModifier: modifier
              });
            }
          })
          .catch(err => {
            if (err?.name === 'AbortError') return;
            console.error("OSRM error", err);
            // Fallback
            setNavState(prev => ({
              ...prev,
              distanceToNext: Math.round(minDistance),
              isOnRoute,
              instruction: isOnRoute ? 'Sigue la ruta' : 'Dirígete a la ruta',
              routeGeometry: null,
              maneuverType: undefined,
              maneuverModifier: undefined
            }));
          });
      } else {
         // Continuous distance update without fetching
         setNavState(prev => {
           if (prev.maneuverLocation) {
             return {
               ...prev,
               distanceToNext: Math.round(getDistance(currentLocation.lat, currentLocation.lng, prev.maneuverLocation.lat, prev.maneuverLocation.lng)),
               isOnRoute
             };
           }
           return { ...prev, isOnRoute };
         });
      }

    } catch (e) {
      console.error("Navigation error", e);
    }
  }, [currentLocation, routeGeoJSON]);

  return navState;
};
