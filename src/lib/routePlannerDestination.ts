/**
 * Planificador de rutas: búsqueda Nominatim y resolución de coordenadas para OSRM.
 * Centraliza URLs, cabeceras (política de uso de Nominatim) y criterios de coincidencia.
 */

import { requestJson } from './network';
import { SUPPORT_EMAIL } from './clientInfo';
import { pickBestNominatimResult, sortNominatimResults, type NominatimItem } from './nominatimPick';

export type { NominatimItem };

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

/** Cabeceras recomendadas por Nominatim (identificación del cliente). */
export function getNominatimHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Accept-Language': 'es,en;q=0.8',
    'User-Agent': `MotoRideApp/1.0 (${SUPPORT_EMAIL})`,
  };
}

export function buildNominatimSearchUrl(query: string, limit = 10): string {
  const q = query.trim();
  const params = new URLSearchParams({
    format: 'json',
    q,
    limit: String(limit),
    countrycodes: 'es',
    addressdetails: '1',
    dedupe: '1',
  });
  return `${NOMINATIM_BASE}?${params.toString()}`;
}

/** Normaliza texto para comparar destino escrito vs elegido en la lista. */
export function normalizeDestinationLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function destinationLabelsMatch(a: string, b: string): boolean {
  return normalizeDestinationLabel(a) === normalizeDestinationLabel(b);
}

export type PickedDestination = {
  /** display_name de Nominatim en el momento de elegir */
  label: string;
  lat: number;
  lon: number;
  address?: Record<string, string>;
  /** Si vienen de Nominatim, lookup fija coords exactas del lugar (evita desvíos al regenerar). */
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
};

/** ¿Sigue siendo válido el destino elegido respecto al texto actual del input? */
export function pickedStillMatchesInput(trimmedInput: string, picked: PickedDestination | null): boolean {
  if (!picked || !trimmedInput.trim()) return false;
  return destinationLabelsMatch(trimmedInput, picked.label);
}

/**
 * Intenta interpretar "lon, lat" o "lat, lon" con dos números (España peninsular / Baleares / Canarias).
 * Devuelve null si no parece un par de coordenadas.
 */
export function tryParseCoordinatePair(input: string): { lat: number; lon: number } | null {
  const t = input.trim();
  const m = t.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const spainLatLon = (lat: number, lon: number) =>
    lat >= 27 &&
    lat <= 45 &&
    lon >= -18 &&
    lon <= 5;

  if (spainLatLon(a, b)) return { lat: a, lon: b };
  if (spainLatLon(b, a)) return { lat: b, lon: a };

  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    if (Math.abs(a) > 90) return { lat: b, lon: a };
    if (Math.abs(b) > 90) return { lat: a, lon: b };
    return { lat: a, lon: b };
  }
  return null;
}

/**
 * Resuelve un lugar por id OSM (Nominatim lookup): coordenadas y nombre canónicos.
 */
export async function fetchNominatimPlaceByOsmId(
  osmType: 'node' | 'way' | 'relation',
  osmId: number,
  options?: { signal?: AbortSignal }
): Promise<NominatimItem | null> {
  if (!Number.isFinite(osmId)) return null;
  const prefix = osmType === 'node' ? 'N' : osmType === 'way' ? 'W' : 'R';
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    osm_ids: `${prefix}${Math.round(osmId)}`,
  });
  const url = `https://nominatim.openstreetmap.org/lookup?${params.toString()}`;
  try {
    const data = await requestJson<NominatimItem[]>(url, {
      timeoutMs: 10000,
      retries: 0,
      headers: getNominatimHeaders(),
      signal: options?.signal,
    });
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchNominatimSuggestions(
  query: string,
  options?: { signal?: AbortSignal }
): Promise<NominatimItem[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = buildNominatimSearchUrl(q, 10);
  const data = await requestJson<NominatimItem[]>(url, {
    timeoutMs: 10000,
    retries: 0,
    headers: getNominatimHeaders(),
    signal: options?.signal,
  });
  if (!Array.isArray(data) || data.length === 0) return [];
  return sortNominatimResults(data, q);
}

export type ResolveDestinationResult =
  | {
      ok: true;
      lat: number;
      lon: number;
      displayName: string;
      /** Primer resultado para mensajes de éxito */
      primary: NominatimItem;
    }
  | { ok: false; reason: 'not_found' | 'network' };

/**
 * Resuelve coordenadas de destino para OSRM: prioriza selección explícita, coordenadas escritas o geocodificación.
 */
export async function resolveDestinationForRouting(
  trimmedInput: string,
  picked: PickedDestination | null,
  options?: { signal?: AbortSignal }
): Promise<ResolveDestinationResult> {
  const trimmed = trimmedInput.trim();
  if (!trimmed) {
    return { ok: false, reason: 'not_found' };
  }

  if (picked && pickedStillMatchesInput(trimmed, picked)) {
    const ot = picked.osmType;
    const oid = picked.osmId;
    if (
      (ot === 'node' || ot === 'way' || ot === 'relation') &&
      typeof oid === 'number' &&
      Number.isFinite(oid)
    ) {
      try {
        const place = await fetchNominatimPlaceByOsmId(ot, oid, options);
        if (place) {
          const lat = parseFloat(String(place.lat));
          const lon = parseFloat(String(place.lon));
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            const displayName = (place.display_name || picked.label).trim();
            return {
              ok: true,
              lat,
              lon,
              displayName,
              primary: place,
            };
          }
        }
      } catch {
        /* usar coords de la selección */
      }
    }
    return {
      ok: true,
      lat: picked.lat,
      lon: picked.lon,
      displayName: picked.label,
      primary: {
        lat: String(picked.lat),
        lon: String(picked.lon),
        display_name: picked.label,
        address: picked.address,
        osm_type: picked.osmType,
        osm_id: picked.osmId,
      },
    };
  }

  const coords = tryParseCoordinatePair(trimmed);
  if (coords) {
    return {
      ok: true,
      lat: coords.lat,
      lon: coords.lon,
      displayName: trimmed,
      primary: {
        lat: String(coords.lat),
        lon: String(coords.lon),
        display_name: trimmed,
      },
    };
  }

  try {
    const url = buildNominatimSearchUrl(trimmed, 10);
    const geoData = await requestJson<NominatimItem[]>(url, {
      timeoutMs: 10000,
      retries: 0,
      headers: getNominatimHeaders(),
      signal: options?.signal,
    });
    if (!geoData || geoData.length === 0) {
      return { ok: false, reason: 'not_found' };
    }
    const best = pickBestNominatimResult(geoData, trimmed);
    const item = best || geoData[0];
    const lat = parseFloat(String(item.lat));
    const lon = parseFloat(String(item.lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { ok: false, reason: 'not_found' };
    }
    const displayName = (item.display_name || trimmed).trim();
    return {
      ok: true,
      lat,
      lon,
      displayName,
      primary: item,
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Formato `lon,lat` para URL de OSRM */
export function formatOsrmDestCoords(lon: number, lat: number): string {
  return `${lon},${lat}`;
}
