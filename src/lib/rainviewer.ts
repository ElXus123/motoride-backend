import { requestJson } from './network';

type WeatherMapsApi = {
  host?: string;
  radar?: {
    past?: Array<{ time?: number; path?: string }>;
    nowcast?: Array<{ time?: number; path?: string }>;
  };
};

const DEFAULT_HOST = 'https://tilecache.rainviewer.com';

/**
 * Rain Viewer radar tiles: max native zoom is 7 (see API docs).
 * Path must come from weather-maps.json — IDs like `/v2/radar/0` are invalid (API returns 400).
 */
export async function fetchRainViewerTileUrl(): Promise<{ baseUrl: string; maxNativeZoom: number } | null> {
  const buildUrl = (data: WeatherMapsApi): { baseUrl: string; maxNativeZoom: number } | null => {
    const host = (data.host || DEFAULT_HOST).replace(/\/$/, '');
    const frames = data.radar?.nowcast?.length ? data.radar.nowcast : data.radar?.past;
    const last = frames && frames.length ? frames[frames.length - 1] : null;
    const path = last?.path;
    if (!path) return null;
    // Color 2 = estándar API Rain Viewer (el 6 puede fallar en algunas cuentas / teselas).
    const baseUrl = `${host}${path}/512/{z}/{x}/{y}/2/1_1.png`;
    return { baseUrl, maxNativeZoom: 7 };
  };

  try {
    const data = await requestJson<WeatherMapsApi>('https://api.rainviewer.com/public/weather-maps.json', {
      timeoutMs: 12000,
      retries: 2,
      backoffMs: 500,
    });
    const built = buildUrl(data);
    if (built) return built;
  } catch {
    // fall through
  }

  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as WeatherMapsApi;
    return buildUrl(data);
  } catch {
    return null;
  }
}
