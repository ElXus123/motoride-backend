/**
 * Tipos compartidos para estimación de inclinación tipo “roll” de moto
 * cuando el móvil no va fijado al manillar (bolsillo / MirrorLink).
 */

export type LeanConfidence = 'high' | 'medium' | 'low';

export type PocketNoiseLevel = 'calm' | 'moderate' | 'high';

export type MotorcycleLeanSample = {
  /** Ángulo estimado de inclinación (roll) en grados; + derecha, - izquierda (convención documentada en geometry). */
  leanDeg: number;
  confidence: LeanConfidence;
  /** Ruido / inestabilidad del dispositivo (bolsillo). */
  pocketNoise: PocketNoiseLevel;
  /** Si true, conviene dar más peso a GPS u otros sensores externos. */
  preferExternalTelemetry: boolean;
  /** Magnitud |a| de aceleración “con gravedad” (m/s²), para diagnóstico. */
  gravityMagnitude: number;
};

export type MotorcycleLeanOptions = {
  /** Hz aproximado de devicemotion (para dt). Por defecto 30. */
  assumedSampleRateHz?: number;
  /** Peso del acelerómetro en el filtro complementario (0–1). Más alto = más estable, menos agresivo. */
  complementaryAlpha?: number;
  /** Umbral de variación de giroscopio (deg/s suma) por encima del cual sube el ruido de bolsillo. */
  gyroNoiseThresholdDegPerSec?: number;
  /** Velocidad GPS (m/s) por debajo de la cual la inclinación tiene poca confianza. */
  minSpeedMpsForLean?: number;
};
