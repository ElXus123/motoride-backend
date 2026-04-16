import { useEffect, useMemo, useState } from 'react';
import { requestJson } from '../lib/network';

export type OpenMeteoWeather = {
  tempC: number | null;
  dailyWeatherCode: number | null;
  /** Velocidad del viento a ~10 m (km/h). */
  windSpeedKmh: number | null;
  /**
   * Dirección hacia la que sopla el viento, grados horarios desde el norte (0–360).
   * Calculada como opuesta a la dirección de procedencia que devuelve Open-Meteo.
   */
  windBlowToDeg: number | null;
  loading: boolean;
};

/**
 * Temperatura actual + código meteorológico del día en la ubicación (rejilla Open-Meteo).
 * Sin API key; no usar para decisiones críticas de seguridad.
 */
export function useOpenMeteoWeather(
  lat: number | undefined | null,
  lng: number | undefined | null
): OpenMeteoWeather {
  const [tempC, setTempC] = useState<number | null>(null);
  const [dailyWeatherCode, setDailyWeatherCode] = useState<number | null>(null);
  const [windSpeedKmh, setWindSpeedKmh] = useState<number | null>(null);
  const [windBlowToDeg, setWindBlowToDeg] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const gridKey = useMemo(() => {
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  }, [lat, lng]);

  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!gridKey) return;
    const id = window.setInterval(() => setRefreshTick((t) => t + 1), 20 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [gridKey]);

  useEffect(() => {
    if (!gridKey) {
      setTempC(null);
      setDailyWeatherCode(null);
      setWindSpeedKmh(null);
      setWindBlowToDeg(null);
      setLoading(false);
      return;
    }
    const [la, lo] = gridKey.split(',').map(Number);
    let cancelled = false;
    setLoading(true);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
      '&current=temperature_2m,wind_speed_10m,wind_direction_10m' +
      '&daily=weather_code&timezone=auto&forecast_days=1&windspeed_unit=kmh';
    requestJson<{
      current?: {
        temperature_2m?: number;
        wind_speed_10m?: number;
        /** Dirección de procedencia del viento (°), sentido horario desde el norte. */
        wind_direction_10m?: number;
      };
      daily?: { weather_code?: number[] };
    }>(url, { timeoutMs: 8000, retries: 0 })
      .then((data) => {
        if (cancelled) return;
        const t = data?.current?.temperature_2m;
        const c = data?.daily?.weather_code?.[0];
        setTempC(typeof t === 'number' ? t : null);
        setDailyWeatherCode(typeof c === 'number' ? c : null);

        const wk = data?.current?.wind_speed_10m;
        setWindSpeedKmh(typeof wk === 'number' && Number.isFinite(wk) ? wk : null);

        const fromDeg = data?.current?.wind_direction_10m;
        if (typeof fromDeg === 'number' && Number.isFinite(fromDeg)) {
          const from = ((fromDeg % 360) + 360) % 360;
          const blowTo = (from + 180) % 360;
          setWindBlowToDeg(blowTo);
        } else {
          setWindBlowToDeg(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTempC(null);
          setDailyWeatherCode(null);
          setWindSpeedKmh(null);
          setWindBlowToDeg(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gridKey, refreshTick]);

  return { tempC, dailyWeatherCode, windSpeedKmh, windBlowToDeg, loading };
}
