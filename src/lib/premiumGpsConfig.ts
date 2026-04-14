/**
 * Políticas opcionales: si un flag es `true`, la función indicada queda reservada a usuarios Premium.
 * Si es `false`, todos los usuarios la tienen (comportamiento por defecto / compatibilidad).
 */
export type PremiumGpsPolicy = {
  highAccuracyPremiumOnly: boolean;
  rainRadarPremiumOnly: boolean;
  precipAlertsPremiumOnly: boolean;
  weatherHudPremiumOnly: boolean;
};

export const DEFAULT_PREMIUM_GPS_POLICY: PremiumGpsPolicy = {
  highAccuracyPremiumOnly: false,
  rainRadarPremiumOnly: false,
  precipAlertsPremiumOnly: false,
  weatherHudPremiumOnly: false,
};

export function normalizePremiumGpsPolicy(data: Record<string, unknown> | undefined | null): PremiumGpsPolicy {
  const t = (k: keyof PremiumGpsPolicy) => data?.[k] === true;
  return {
    highAccuracyPremiumOnly: t('highAccuracyPremiumOnly'),
    rainRadarPremiumOnly: t('rainRadarPremiumOnly'),
    precipAlertsPremiumOnly: t('precipAlertsPremiumOnly'),
    weatherHudPremiumOnly: t('weatherHudPremiumOnly'),
  };
}
