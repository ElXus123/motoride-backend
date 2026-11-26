import { requestJson } from './network';
import { getNominatimHeaders } from './routePlannerDestination';

/**
 * Nombre corto para una chincheta (solo visual: el destino de la ruta usa las coordenadas exactas).
 * Devuelve null si Nominatim no encuentra nada cerca (p. ej. en mar o despoblado).
 */
export async function reverseGeocodeShortLabel(
  lat: number,
  lon: number,
  options?: { signal?: AbortSignal }
): Promise<string | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    zoom: '16',
    addressdetails: '1',
    'accept-language': 'es',
  });
  try {
    const data = await requestJson<{
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
      error?: string;
    }>(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      timeoutMs: 10000,
      retries: 0,
      headers: getNominatimHeaders(),
      signal: options?.signal,
    });
    if (!data || data.error) return null;
    const a = data.address || {};
    const place = (a.city || a.town || a.village || a.municipality || a.hamlet || '').trim();
    const street = [a.road || a.pedestrian || a.path || '', a.house_number || ''].filter(Boolean).join(' ').trim();
    const parts = [data.name?.trim() || street, place].filter((p, i, arr) => p && arr.indexOf(p) === i);
    if (parts.length > 0) return parts.join(', ');
    const full = (data.display_name || '').split(',').slice(0, 3).join(',').trim();
    return full || null;
  } catch {
    return null;
  }
}

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
