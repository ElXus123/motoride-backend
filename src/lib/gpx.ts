import { gpx } from '@tmcw/togeojson';

export const parseGPX = (gpxString: string) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxString, 'text/xml');
    return gpx(doc);
  } catch (error) {
    console.error("Error parsing GPX:", error);
    return null;
  }
};

export const parseRouteData = (routeData: string | object | null) => {
  if (!routeData) return null;
  if (typeof routeData === 'object') return routeData;
  
  try {
    return JSON.parse(routeData);
  } catch (e) {
    if (typeof routeData === 'string' && routeData.trim().startsWith('<')) {
      return parseGPX(routeData);
    }
    return null;
  }
};
