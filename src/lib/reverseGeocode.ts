import { requestJson } from './network';

export type ReverseAddressParts = {
  province: string;
  municipality: string;
};

/**
 * Provincia y municipio a partir de coordenadas (Nominatim reverse, España).
 */
export async function reverseGeocodeProvinceMunicipality(
  lat: number,
  lon: number
): Promise<ReverseAddressParts | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&format=json&addressdetails=1&accept-language=es`;
  try {
    const data = await requestJson<{
      address?: Record<string, string>;
    }>(url, {
      timeoutMs: 10000,
      retries: 0,
      headers: { 'User-Agent': 'MoteroApp/1.0 (contact: motorideapp1@gmail.com)' },
    });
    const a = data?.address;
    if (!a) return null;
    const municipality = (
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.hamlet ||
      a.suburb ||
      ''
    ).trim();
    const province = (
      a.province ||
      a.state ||
      a.region ||
      a.county ||
      ''
    ).trim();
    if (!municipality && !province) return null;
    return {
      province: province.toLowerCase(),
      municipality: municipality.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function requestUserLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 120_000, timeout: 12_000 }
    );
  });
}
