import { gpx } from '@tmcw/togeojson';

/** GeoJSON FeatureCollection con una LineString (convención lon,lat). */
function featureCollectionFromLine(coords: number[][]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  };
}

/**
 * Extrae puntos de track/ruta desde el DOM GPX (trkpt / rtept).
 * Cubre archivos donde @tmcw/togeojson no produce LineString (p. ej. algunos exportadores).
 */
function lineCoordsFromGpxDocument(doc: Document): number[][] | null {
  try {
    const coords: number[][] = [];
    const trkpts = doc.getElementsByTagName('trkpt');
    for (let i = 0; i < trkpts.length; i++) {
      const el = trkpts[i];
      const lat = parseFloat(el.getAttribute('lat') || '');
      const lon = parseFloat(el.getAttribute('lon') || '');
      if (Number.isFinite(lat) && Number.isFinite(lon)) coords.push([lon, lat]);
    }
    if (coords.length >= 2) return coords;

    const rtepts = doc.getElementsByTagName('rtept');
    const rte: number[][] = [];
    for (let i = 0; i < rtepts.length; i++) {
      const el = rtepts[i];
      const lat = parseFloat(el.getAttribute('lat') || '');
      const lon = parseFloat(el.getAttribute('lon') || '');
      if (Number.isFinite(lat) && Number.isFinite(lon)) rte.push([lon, lat]);
    }
    if (rte.length >= 2) return rte;
  } catch (e) {
    console.error('lineCoordsFromGpxDocument:', e);
  }
  return null;
}

/** Une segmentos de línea en una sola LineString (varios <trkseg> o MultiLineString). */
function mergeLineCoordinates(geo: GeoJSON.FeatureCollection | null): number[][] | null {
  if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) return null;
  const merged: number[][] = [];
  for (const f of geo.features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
      for (const c of g.coordinates) merged.push(c);
    } else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
      for (const line of g.coordinates) {
        if (Array.isArray(line)) for (const c of line) merged.push(c);
      }
    }
  }
  return merged.length >= 2 ? merged : null;
}

export const parseGPX = (gpxString: string): GeoJSON.FeatureCollection | null => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxString, 'application/xml');
    const errs = doc.getElementsByTagName('parsererror');
    if (errs && errs.length > 0) {
      console.error('GPX XML parse error');
      return null;
    }

    const direct = lineCoordsFromGpxDocument(doc);
    if (direct) return featureCollectionFromLine(direct);

    const fromLib = gpx(doc) as GeoJSON.FeatureCollection;
    const merged = mergeLineCoordinates(fromLib);
    if (merged) return featureCollectionFromLine(merged);

    return fromLib;
  } catch (error) {
    console.error('Error parsing GPX:', error);
    return null;
  }
};

export const parseRouteData = (routeData: string | object | null) => {
  if (!routeData) return null;
  if (typeof routeData === 'object') return routeData;

  try {
    return JSON.parse(routeData as string);
  } catch {
    if (typeof routeData === 'string' && routeData.trim().startsWith('<')) {
      return parseGPX(routeData);
    }
    return null;
  }
};
