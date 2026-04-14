import { useEffect, useMemo, useState } from 'react';
import { requestJson } from '../lib/network';

export type OpenMeteoWeather = {
  tempC: number | null;
  dailyWeatherCode: number | null;
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
      setLoading(false);
      return;
    }
    const [la, lo] = gridKey.split(',').map(Number);
    let cancelled = false;
    setLoading(true);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
      '&current=temperature_2m&daily=weather_code&timezone=auto&forecast_days=1';
    requestJson<{
      current?: { temperature_2m?: number };
      daily?: { weather_code?: number[] };
    }>(url, { timeoutMs: 8000, retries: 0 })
      .then((data) => {
        if (cancelled) return;
        const t = data?.current?.temperature_2m;
        const c = data?.daily?.weather_code?.[0];
        setTempC(typeof t === 'number' ? t : null);
        setDailyWeatherCode(typeof c === 'number' ? c : null);
      })
      .catch(() => {
        if (!cancelled) {
          setTempC(null);
          setDailyWeatherCode(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gridKey, refreshTick]);

  return { tempC, dailyWeatherCode, loading };
}
