import { useState, useEffect, useRef } from 'react';
import { getDistance } from '../lib/geoUtils';

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
      fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
        .then(res => {
          if (!res.ok) {
            console.warn('Overpass API rate limited or unavailable:', res.status);
            return { elements: [] }; // Return empty data instead of throwing
          }
          return res.json();
        })
        .then(data => {
          if (data.elements) {
            setRadars(data.elements.map((e: any) => ({ lat: e.lat, lng: e.lon })));
          }
        })
        .catch(console.error);
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
