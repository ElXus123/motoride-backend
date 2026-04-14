import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../lib/geoUtils';
import { requestJson } from '../lib/network';

export const useRoadData = (currentLocation: {lat: number, lng: number} | null) => {
  const [radars, setRadars] = useState<any[]>([]);
  const [nearbyRadar, setNearbyRadar] = useState<{distance: number} | null>(null);
  const lastFetchLoc = useRef<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    if (!currentLocation) return;

    // Fetch radars if we moved more than 5km from last fetch
    const shouldFetch = !lastFetchLoc.current || getDistance(currentLocation.lat, currentLocation.lng, lastFetchLoc.current.lat, lastFetchLoc.current.lng) > 5000;

    if (shouldFetch) {
      lastFetchLoc.current = currentLocation;
      // Overpass API query for speed cameras within 5km
      const query = `
        [out:json];
        node(around:5000,${currentLocation.lat},${currentLocation.lng})[highway=speed_camera];
        out;
      `;
      requestJson<any>(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
        timeoutMs: 12000,
        retries: 1,
        backoffMs: 800
      })
        .then(data => {
          if (data.elements) {
            setRadars(data.elements.map((e: any) => ({ lat: e.lat, lng: e.lon })));
          }
        })
        .catch((error) => {
          console.warn('Overpass API unavailable:', error);
          setRadars([]);
        });
    }

    // Check nearby radars (within 2km)
    let closest = null;
    let minDistance = Infinity;
    for (const radar of radars) {
      const dist = getDistance(currentLocation.lat, currentLocation.lng, radar.lat, radar.lng);
      if (dist < 2000 && dist < minDistance) {
        minDistance = dist;
        closest = radar;
      }
    }

    if (closest) {
      setNearbyRadar({ distance: Math.round(minDistance) });
    } else {
      setNearbyRadar(null);
    }

  }, [currentLocation, radars]);

  return { nearbyRadar, radars };
};
