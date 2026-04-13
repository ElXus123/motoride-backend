import { useState, useEffect, useRef } from 'react';
import { getDistance, getBearing } from '../lib/geoUtils';
import { parseRouteData } from '../lib/gpx';

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

      // 3. Call OSRM if we moved enough (>30m) or target changed significantly
      const shouldFetch = !lastFetchLoc.current ||
        getDistance(currentLocation.lat, currentLocation.lng, lastFetchLoc.current.lat, lastFetchLoc.current.lng) > 30 ||
        !currentTarget.current ||
        getDistance(targetPoint.lat, targetPoint.lng, currentTarget.current.lat, currentTarget.current.lng) > 100;

      if (shouldFetch) {
        lastFetchLoc.current = currentLocation;
        currentTarget.current = targetPoint;

        fetch(`https://router.project-osrm.org/route/v1/driving/${currentLocation.lng},${currentLocation.lat};${targetPoint.lng},${targetPoint.lat}?steps=true&overview=full&geometries=geojson`)
          .then(res => {
            if (!res.ok) throw new Error('Routing failed');
            return res.json();
          })
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

              let action = "Sigue recto";
              if (type === 'turn') {
                if (modifier.includes('right')) action = "Gira a la derecha";
                else if (modifier.includes('left')) action = "Gira a la izquierda";
              } else if (type === 'off ramp') {
                action = "Toma la salida";
                if (modifier.includes('right')) action += " a la derecha";
                else if (modifier.includes('left')) action += " a la izquierda";
              } else if (type === 'roundabout') {
                action = "En la rotonda, toma la salida";
              } else if (type === 'arrive') {
                action = isOnRoute ? "Sigue la ruta" : "Llegando a la ruta";
              } else if (type === 'merge') {
                action = "Incorpórate";
              } else if (type === 'fork') {
                action = "En la bifurcación, mantente a la " + (modifier.includes('right') ? 'derecha' : 'izquierda');
              } else if (type === 'end of road') {
                action = "Al final de la calle, gira a la " + (modifier.includes('right') ? 'derecha' : 'izquierda');
              }

              let instruction = name ? `${action} hacia ${name}` : action;
              if (!isOnRoute && type === 'arrive') {
                 instruction = "Incorpórate a la ruta trazada";
              }

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
