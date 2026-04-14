import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LeanConfidence,
  MotorcycleLeanOptions,
  MotorcycleLeanSample,
  PocketNoiseLevel,
} from '../lib/motorcycleLean/types';
import { complementaryAngleRad, lowPassVec3, normalizeVec3 } from '../lib/motorcycleLean/filters';
import {
  buildBikeBasisAtCalibration,
  leanDegFromGravityInBikeFrame,
  rollRateFromGyro,
  rotationFromTo,
} from '../lib/motorcycleLean/geometry';
import { PocketInstabilityTracker } from '../lib/motorcycleLean/pocketDetection';
import { evaluateCurvePlausibility, lateralAccelMagnitude } from '../lib/motorcycleLean/curveDetection';

const RAD = Math.PI / 180;
const EZ: [number, number, number] = [0, 0, 1];

/**
 * Estimación de inclinación (roll) de moto desde DeviceMotion, orientada a móvil en bolsillo
 * o MirrorLink sin soporte rígido.
 *
 * LIMITACIONES (importante para el usuario / UI):
 * - Esto NO es la inclinación geométrica real de la moto respecto al suelo: es una **estimación**
 *   coherente con cómo se mueve el vector de gravedad respecto a una **neutra calibrada** en el
 *   marco del teléfono. El pantalón, la postura y el vaivén del cuerpo introducen error sistemático.
 * - Sin referencia de rumbo absoluto del chasis (IMU fija al manillar, fusión con GPS de alta
 *   frecuencia, etc.), el “plano lateral” se infiere solo de la calibración inicial + gravedad:
 *   si el cuerpo gira en la silla o el bolsillo se desplaza, el eje de roll efectivo se desvía.
 * - Parado o muy despacio, la aceleración lateral de curva no existe: filtramos y bajamos
 *   confianza para no mostrar picos falsos.
 * - En web, frecuencia y precisión del IMU dependen del SO/navegador; iOS puede requerir permiso.
 *
 * Prioridad: valores **estables y creíbles** frente a respuesta agresiva errática.
 */
export function useMotorcycleLean(
  speedMps: number | null | undefined,
  options: MotorcycleLeanOptions = {}
) {
  const {
    assumedSampleRateHz = 30,
    complementaryAlpha: complementaryAlphaOpt,
    gyroNoiseThresholdDegPerSec = 28,
    minSpeedMpsForLean = 2.5,
  } = options;

  const dtSec = 1 / Math.max(10, assumedSampleRateHz);

  const [sample, setSample] = useState<MotorcycleLeanSample>({
    leanDeg: 0,
    confidence: 'low',
    pocketNoise: 'calm',
    preferExternalTelemetry: false,
    gravityMagnitude: 9.81,
  });
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [calibrated, setCalibrated] = useState(false);
  const calibratedRef = useRef(false);
  useEffect(() => {
    calibratedRef.current = calibrated;
  }, [calibrated]);

  const speedRef = useRef(speedMps);
  useEffect(() => {
    speedRef.current = speedMps;
  }, [speedMps]);

  const gLp = useRef<[number, number, number]>([0, 0, 1]);
  const gLpInit = useRef(false);
  const gRaw = useRef<[number, number, number]>([0, 0, 1]);
  const gUnit = useRef<[number, number, number]>([0, 0, 1]);
  const RAlign = useRef<number[]>([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const forwardCal = useRef<[number, number, number]>([1, 0, 0]);
  const lateralCal = useRef<[number, number, number]>([0, 1, 0]);
  const upCal = useRef<[number, number, number]>([0, 0, 1]);
  const angleRad = useRef(0);
  const gbScratch = useRef<[number, number, number]>([0, 0, 1]);
  const pocket = useRef(new PocketInstabilityTracker());
  const straightAccumSec = useRef(0);
  const lastTs = useRef<number | null>(null);

  const requestPermission = useCallback(async () => {
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
    const DO = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };

    if (typeof DM.requestPermission !== 'function' && typeof DO.requestPermission !== 'function') {
      setPermissionGranted(true);
      return;
    }
    try {
      if (typeof DO.requestPermission === 'function') {
        const s = await DO.requestPermission();
        if (s !== 'granted') {
          setPermissionGranted(false);
          return;
        }
      }
      if (typeof DM.requestPermission === 'function') {
        try {
          await DM.requestPermission();
        } catch {
          // opcional en WebKit
        }
      }
      setPermissionGranted(true);
    } catch (e) {
      console.error('useMotorcycleLean permission', e);
      setPermissionGranted(false);
    }
  }, []);

  const applyCalibration = useCallback(() => {
    const g = gUnit.current.slice() as [number, number, number];
    if (!normalizeVec3(g)) return;
    const R = RAlign.current;
    if (!rotationFromTo(g, EZ, R)) return;
    buildBikeBasisAtCalibration(g, forwardCal.current, lateralCal.current, upCal.current);
    angleRad.current = 0;
    calibratedRef.current = true;
    setCalibrated(true);
    straightAccumSec.current = 0;
  }, []);

  const calibrate = useCallback(() => {
    const raw = gRaw.current;
    gLp.current[0] = raw[0];
    gLp.current[1] = raw[1];
    gLp.current[2] = raw[2];
    gUnit.current[0] = gLp.current[0];
    gUnit.current[1] = gLp.current[1];
    gUnit.current[2] = gLp.current[2];
    if (!normalizeVec3(gUnit.current)) return;
    applyCalibration();
  }, [applyCalibration]);

  useEffect(() => {
    if (!permissionGranted) return;

    const onMotion = (ev: DeviceMotionEvent) => {
      const accg = ev.accelerationIncludingGravity;
      const accLin = ev.acceleration;
      const rr = ev.rotationRate;
      if (!accg || accg.x == null || accg.y == null || accg.z == null) return;

      const now =
        typeof ev.timeStamp === 'number' && ev.timeStamp > 0 ? ev.timeStamp : performance.now();
      let dt = dtSec;
      if (lastTs.current != null) {
        dt = Math.min(0.1, Math.max(0.002, (now - lastTs.current) / 1000));
      }
      lastTs.current = now;

      gRaw.current[0] = accg.x!;
      gRaw.current[1] = accg.y!;
      gRaw.current[2] = accg.z!;

      pocket.current.pushSample(rr, accLin);

      const instability = pocket.current.score(gyroNoiseThresholdDegPerSec);
      const pocketLevel: PocketNoiseLevel = pocket.current.level(gyroNoiseThresholdDegPerSec);
      const lpAlpha =
        pocketLevel === 'high' ? 0.06 : pocketLevel === 'moderate' ? 0.1 : 0.14;
      if (!gLpInit.current) {
        gLp.current[0] = accg.x!;
        gLp.current[1] = accg.y!;
        gLp.current[2] = accg.z!;
        gLpInit.current = true;
      } else {
        lowPassVec3(gLp.current, gLp.current, gRaw.current, lpAlpha);
      }

      gUnit.current[0] = gLp.current[0];
      gUnit.current[1] = gLp.current[1];
      gUnit.current[2] = gLp.current[2];
      const gOk = normalizeVec3(gUnit.current);
      const gMag = Math.hypot(accg.x!, accg.y!, accg.z!);

      let leanDeg = 0;
      let confidence: LeanConfidence = 'low';
      let preferExternal = instability > 0.55 || pocketLevel === 'high';

      const speed = speedRef.current ?? 0;
      let lateralA = 0;
      if (accLin && accLin.x != null && accLin.y != null && accLin.z != null) {
        lateralA = lateralAccelMagnitude(
          accLin.x,
          accLin.y,
          accLin.z,
          gUnit.current[0],
          gUnit.current[1],
          gUnit.current[2]
        );
      }

      const curve = evaluateCurvePlausibility(speed, lateralA, {
        minSpeedMps: minSpeedMpsForLean,
        lateralQuietBelow: 0.35,
        lateralActiveAbove: 1.4,
      });

      if (gOk && calibratedRef.current) {
        const leanDegAccel = leanDegFromGravityInBikeFrame(gUnit.current, RAlign.current, gbScratch.current);
        const thetaAccRad = leanDegAccel * RAD;
        // W3C: rotationRate alpha/beta/gamma ≈ velocidades alrededor de Z/X/Y del dispositivo (deg/s).
        const wx = rr?.beta ?? 0;
        const wy = rr?.gamma ?? 0;
        const wz = rr?.alpha ?? 0;
        const omegaRoll = rollRateFromGyro(wx, wy, wz, forwardCal.current);

        let compAlpha =
          complementaryAlphaOpt ??
          (pocketLevel === 'high' ? 0.05 : pocketLevel === 'moderate' ? 0.075 : 0.1);
        if (!curve.leanMeaningful) compAlpha *= 0.45;

        angleRad.current = complementaryAngleRad(angleRad.current, thetaAccRad, omegaRoll, dt, compAlpha);
        leanDeg = angleRad.current / RAD;

        if (gMag < 8.5 || gMag > 11.2) confidence = 'low';
        else if (pocketLevel === 'high' || !curve.leanMeaningful) confidence = 'low';
        else if (pocketLevel === 'calm' && (speed >= 6 || curve.lateralActivity > 0.4) && gMag > 9)
          confidence = 'high';
        else confidence = 'medium';

        if (Math.abs(leanDeg) < 1.2 && pocketLevel !== 'high' && speed > 4) {
          straightAccumSec.current += dt;
          if (straightAccumSec.current > 4.5) {
            applyCalibration();
            straightAccumSec.current = 0;
          }
        } else {
          straightAccumSec.current = 0;
        }
      } else if (gOk && !calibratedRef.current) {
        leanDeg = 0;
        confidence = 'low';
      }

      setSample({
        leanDeg,
        confidence,
        pocketNoise: pocketLevel,
        preferExternalTelemetry: preferExternal || !curve.leanMeaningful,
        gravityMagnitude: gMag,
      });
    };

    window.addEventListener('devicemotion', onMotion, true);
    return () => window.removeEventListener('devicemotion', onMotion, true);
  }, [
    permissionGranted,
    calibrated,
    applyCalibration,
    dtSec,
    gyroNoiseThresholdDegPerSec,
    minSpeedMpsForLean,
    complementaryAlphaOpt,
    // calibrated se lee vía calibratedRef para no re-registrar el listener al calibrar
  ]);

  return {
    sample,
    permissionGranted,
    requestPermission,
    calibrate,
    calibrated,
  };
}
