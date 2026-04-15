import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { lowPassVec3, normalizeVec3, lowPassScalar } from '../lib/motorcycleLean/filters';
import {
  buildBikeBasisAtCalibration,
  leanDegFromGravityInBikeFrame,
  rollRateFromGyro,
  rotationFromTo,
} from '../lib/motorcycleLean/geometry';
import { KalmanRoll1D } from '../lib/motorcycleLean/kalmanRoll1D';
import {
  kinematicBlendWeight,
  kinematicLeanDegFromSpeedAndYaw,
  yawRateAboutGravityDegPerSec,
} from '../lib/motorcycleLean/kinematicLean';
import { PocketInstabilityTracker } from '../lib/motorcycleLean/pocketDetection';
import { evaluateCurvePlausibility, lateralAccelMagnitude } from '../lib/motorcycleLean/curveDetection';

/** Manillar/soporte: móvil fijo. Bolsillo/MirrorLink: móvil en el cuerpo; el cero debe ser independiente. */
export type LeanCalibrationProfile = 'handlebar' | 'pocket';

const STORAGE_HANDLEBAR = 'motoride_lean_calibration_offset_handlebar_v1';
const STORAGE_POCKET = 'motoride_lean_calibration_offset_pocket_v1';
const LEGACY_CALIBRATION_KEY = 'motoride_lean_calibration_offset_v1';

const EZ: [number, number, number] = [0, 0, 1];
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function clampOffset(v: number): number {
  return Math.max(-30, Math.min(30, v));
}

/**
 * Inclinación roll (°) por fusión Kalman: giroscopio predice, acelerómetro (marco moto) y
 * término cinemático v·ω corrigen curva; orientación inicial agnóstica vía vector gravedad.
 */
export const useLeanAngle = (
  speedMps?: number | null,
  calibrationProfile: LeanCalibrationProfile = 'handlebar'
) => {
  const [leanAngle, setLeanAngle] = useState(0);
  const [maxLeanLeft, setMaxLeanLeft] = useState(0);
  const [maxLeanRight, setMaxLeanRight] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [offsetHandlebar, setOffsetHandlebar] = useState(0);
  const [offsetPocket, setOffsetPocket] = useState(0);

  const speedRef = useRef<number | null | undefined>(speedMps);
  const angleHistoryRef = useRef<number[]>([]);
  const motionStationaryScoreRef = useRef(0);
  const motionStationaryRef = useRef(false);
  const prevGravUnitRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const dynamicBiasRef = useRef(0);

  const gLp = useRef<[number, number, number]>([0, 0, 1]);
  const gLpInit = useRef(false);
  const gRaw = useRef<[number, number, number]>([0, 0, 1]);
  const gUnit = useRef<[number, number, number]>([0, 0, 1]);
  const RAlign = useRef<number[]>([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const forwardCal = useRef<[number, number, number]>([1, 0, 0]);
  const lateralCal = useRef<[number, number, number]>([0, 1, 0]);
  const upCal = useRef<[number, number, number]>([0, 0, 1]);
  const gbScratch = useRef<[number, number, number]>([0, 0, 1]);
  const pocket = useRef(new PocketInstabilityTracker());
  const lastTs = useRef<number | null>(null);
  const kf = useRef(new KalmanRoll1D());
  const calibratedRef = useRef(false);
  const displayLpRef = useRef(0);
  const straightAccumSecRef = useRef(0);

  useEffect(() => {
    speedRef.current = speedMps;
  }, [speedMps]);

  const requestPermission = useCallback(async () => {
    const DO = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };

    if (typeof DO.requestPermission !== 'function' && typeof DM.requestPermission !== 'function') {
      setPermissionGranted(true);
      return;
    }

    try {
      if (typeof DO.requestPermission === 'function') {
        const state = await DO.requestPermission();
        if (state !== 'granted') {
          setPermissionGranted(false);
          return;
        }
        if (typeof DM.requestPermission === 'function') {
          try {
            await DM.requestPermission();
          } catch {
            /* WebKit */
          }
        }
        setPermissionGranted(true);
        return;
      }
      if (typeof DM.requestPermission === 'function') {
        const ms = await DM.requestPermission();
        setPermissionGranted(ms === 'granted');
        return;
      }
      setPermissionGranted(true);
    } catch (error) {
      console.error('Error requesting device motion/orientation permission:', error);
      setPermissionGranted(false);
    }
  }, []);

  useEffect(() => {
    try {
      let hb: number | null = null;
      let pk: number | null = null;
      const rawHb = window.localStorage.getItem(STORAGE_HANDLEBAR);
      const rawPk = window.localStorage.getItem(STORAGE_POCKET);
      if (rawHb !== null) {
        const n = Number(rawHb);
        if (!Number.isNaN(n)) hb = clampOffset(n);
      }
      if (rawPk !== null) {
        const n = Number(rawPk);
        if (!Number.isNaN(n)) pk = clampOffset(n);
      }
      if (hb === null || pk === null) {
        const legacy = window.localStorage.getItem(LEGACY_CALIBRATION_KEY);
        if (legacy !== null) {
          const n = Number(legacy);
          if (!Number.isNaN(n)) {
            const c = clampOffset(n);
            if (hb === null) hb = c;
            if (pk === null) pk = c;
          }
        }
      }
      if (hb !== null) setOffsetHandlebar(hb);
      if (pk !== null) setOffsetPocket(pk);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_HANDLEBAR, String(offsetHandlebar));
    } catch {
      /* ignore */
    }
  }, [offsetHandlebar]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_POCKET, String(offsetPocket));
    } catch {
      /* ignore */
    }
  }, [offsetPocket]);

  const calibrationOffset = useMemo(
    () => (calibrationProfile === 'pocket' ? offsetPocket : offsetHandlebar),
    [calibrationProfile, offsetHandlebar, offsetPocket]
  );

  useEffect(() => {
    dynamicBiasRef.current = 0;
    kf.current.reset(0);
    calibratedRef.current = false;
    gLpInit.current = false;
    displayLpRef.current = 0;
    straightAccumSecRef.current = 0;
  }, [calibrationProfile]);

  const applyBikeCalibrationFromGravity = useCallback(() => {
    const g = gUnit.current.slice() as [number, number, number];
    if (!normalizeVec3(g)) return;
    const R = RAlign.current;
    if (!rotationFromTo(g, EZ, R)) return;
    buildBikeBasisAtCalibration(g, forwardCal.current, lateralCal.current, upCal.current);
    kf.current.reset(0);
    calibratedRef.current = true;
    straightAccumSecRef.current = 0;
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const assumedHz = 30;
    const dtDefault = 1 / assumedHz;

    const updateMotionStationary = (event: DeviceMotionEvent) => {
      const rr = event.rotationRate;
      const accLin = event.acceleration;
      const accg = event.accelerationIncludingGravity;

      let still = true;
      let hasHint = false;

      if (rr && (rr.alpha != null || rr.beta != null || rr.gamma != null)) {
        hasHint = true;
        const spin =
          Math.abs(rr.alpha ?? 0) + Math.abs(rr.beta ?? 0) + Math.abs(rr.gamma ?? 0);
        still = still && spin < 7;
      }

      if (accLin && accLin.x != null && accLin.y != null && accLin.z != null) {
        hasHint = true;
        const m = Math.sqrt(accLin.x * accLin.x + accLin.y * accLin.y + accLin.z * accLin.z);
        still = still && m < 0.5;
      }

      if (accg && accg.x != null && accg.y != null && accg.z != null) {
        const norm = Math.sqrt(accg.x * accg.x + accg.y * accg.y + accg.z * accg.z);
        if (norm > 2) {
          hasHint = true;
          const nx = accg.x / norm;
          const ny = accg.y / norm;
          const nz = accg.z / norm;
          const prev = prevGravUnitRef.current;
          if (prev) {
            const dot = Math.max(-1, Math.min(1, nx * prev.x + ny * prev.y + nz * prev.z));
            const degCh = (Math.acos(dot) * 180) / Math.PI;
            still = still && degCh < 4;
          }
          prevGravUnitRef.current = { x: nx, y: ny, z: nz };
        }
      }

      if (!hasHint) return;

      if (still) {
        motionStationaryScoreRef.current = Math.min(35, motionStationaryScoreRef.current + 2);
      } else {
        motionStationaryScoreRef.current = Math.max(0, motionStationaryScoreRef.current - 5);
      }
      motionStationaryRef.current = motionStationaryScoreRef.current >= 14;
    };

    const onMotion = (ev: DeviceMotionEvent) => {
      try {
        const accg = ev.accelerationIncludingGravity;
        const accLin = ev.acceleration;
        const rr = ev.rotationRate;
        if (!accg || accg.x == null || accg.y == null || accg.z == null) return;

        updateMotionStationary(ev);

        const now =
          typeof ev.timeStamp === 'number' && ev.timeStamp > 0 ? ev.timeStamp : performance.now();
        let dt = dtDefault;
        if (lastTs.current != null) {
          dt = Math.min(0.12, Math.max(0.002, (now - lastTs.current) / 1000));
        }
        lastTs.current = now;

        gRaw.current[0] = accg.x!;
        gRaw.current[1] = accg.y!;
        gRaw.current[2] = accg.z!;

        pocket.current.pushSample(rr, accLin);

        const gyroNoiseThresholdDegPerSec = 28;
        const instability = pocket.current.score(gyroNoiseThresholdDegPerSec);
        const pocketLevel = pocket.current.level(gyroNoiseThresholdDegPerSec);

        const isPocketProfile = calibrationProfile === 'pocket';
        let lpAlpha =
          pocketLevel === 'high' ? 0.045 : pocketLevel === 'moderate' ? 0.075 : 0.11;
        if (isPocketProfile) {
          lpAlpha *= 0.55;
        }
        if (instability > 0.55) {
          lpAlpha *= 0.72;
        }

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

        if (!gOk) return;

        if (!calibratedRef.current) {
          applyBikeCalibrationFromGravity();
        }

        const wx = rr?.beta ?? 0;
        const wy = rr?.gamma ?? 0;
        const wz = rr?.alpha ?? 0;

        const leanDegAccel = leanDegFromGravityInBikeFrame(gUnit.current, RAlign.current, gbScratch.current);
        const thetaAccRad = leanDegAccel * RAD;

        const omegaRoll = rollRateFromGyro(wx, wy, wz, forwardCal.current);

        const yawAboutG = yawRateAboutGravityDegPerSec(
          wx,
          wy,
          wz,
          gUnit.current[0],
          gUnit.current[1],
          gUnit.current[2]
        );

        const speed = speedRef.current ?? 0;
        let kinDeg = kinematicLeanDegFromSpeedAndYaw(Math.abs(speed), yawAboutG);
        if (Math.abs(leanDegAccel) > 4 && Math.abs(kinDeg) > 4 && Math.sign(leanDegAccel) !== Math.sign(kinDeg)) {
          kinDeg = -kinDeg;
        }

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
          minSpeedMps: 2.5,
          lateralQuietBelow: 0.35,
          lateralActiveAbove: 1.4,
        });

        const wKin =
          kinematicBlendWeight(Math.abs(speed), yawAboutG) * (curve.leanMeaningful ? 1 : 0.35);

        const processNoise =
          pocketLevel === 'high' ? 8e-5 : pocketLevel === 'moderate' ? 5e-5 : 3e-5;
        kf.current.predict(omegaRoll, dt, processNoise);

        let rAccel = 0.035 + instability * 0.12;
        if (gMag < 8.5 || gMag > 11.2) rAccel += 0.08;
        if (!curve.leanMeaningful) rAccel += 0.05;
        if (isPocketProfile) rAccel += 0.06;

        kf.current.update(thetaAccRad, rAccel);

        if (wKin > 0.04 && Math.abs(speed) >= 3) {
          const rKin = 0.14 + (1 - wKin) * 0.22 + (isPocketProfile ? 0.06 : 0);
          kf.current.update(kinDeg * RAD, rKin);
        }

        let internalDeg = kf.current.getAngleRad() * DEG;
        if (internalDeg > 60) internalDeg = 60;
        if (internalDeg < -60) internalDeg = -60;

        angleHistoryRef.current.push(internalDeg);
        if (angleHistoryRef.current.length > 30) angleHistoryRef.current.shift();

        const v = speedRef.current;
        const gpsSaysStopped = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1.35;
        const speedUnknown = v == null;
        const imuSaysStill = motionStationaryRef.current;
        const gpsLikelyMoving = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) >= 2.5;
        const physicallyStill = gpsSaysStopped || imuSaysStill;

        const stationaryButLeaning = gpsSaysStopped && Math.abs(internalDeg) >= 7;
        const tableFlatRest = physicallyStill && !stationaryButLeaning;

        const shouldAutoZero =
          calibrationProfile === 'handlebar' &&
          tableFlatRest &&
          (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) < 1.6) &&
          Math.abs(internalDeg) < 18;

        if (calibrationProfile === 'pocket') {
          dynamicBiasRef.current = 0;
        } else if (shouldAutoZero) {
          dynamicBiasRef.current = Math.max(
            -12,
            Math.min(12, dynamicBiasRef.current * 0.96 + internalDeg * 0.04)
          );
        } else {
          dynamicBiasRef.current *= 0.995;
          if (Math.abs(dynamicBiasRef.current) < 0.05) dynamicBiasRef.current = 0;
        }

        let outDeg = internalDeg - calibrationOffset - dynamicBiasRef.current;
        const speedNow = typeof v === 'number' && Number.isFinite(v) ? Math.abs(v) : 0;
        if (!physicallyStill && !speedUnknown && gpsLikelyMoving) {
          outDeg *= speedNow >= 11.2 ? 1.08 : 1.04;
        }

        const outLpAlpha = isPocketProfile ? 0.12 : pocketLevel === 'high' ? 0.22 : 0.35;
        displayLpRef.current = lowPassScalar(displayLpRef.current, outDeg, outLpAlpha);
        outDeg = displayLpRef.current;

        if (outDeg > 60) outDeg = 60;
        if (outDeg < -60) outDeg = -60;

        const deadDeg = tableFlatRest ? 4.8 : stationaryButLeaning ? 1.0 : speedUnknown ? 2.2 : 1.0;
        if (Math.abs(outDeg) < deadDeg) outDeg = 0;

        setLeanAngle(outDeg);

        const roundedAngle = Math.round(outDeg);
        const minMaxThreshold = tableFlatRest ? 10 : 0;
        if (roundedAngle < 0 && Math.abs(roundedAngle) >= minMaxThreshold) {
          setMaxLeanLeft((prev) => Math.max(prev, Math.abs(roundedAngle)));
        } else if (roundedAngle > 0 && roundedAngle >= minMaxThreshold) {
          setMaxLeanRight((prev) => Math.max(prev, roundedAngle));
        }

        if (
          calibrationProfile === 'handlebar' &&
          Math.abs(internalDeg) < 1.2 &&
          pocketLevel !== 'high' &&
          typeof speed === 'number' &&
          speed > 4
        ) {
          straightAccumSecRef.current += dt;
          if (straightAccumSecRef.current > 5) {
            applyBikeCalibrationFromGravity();
            straightAccumSecRef.current = 0;
          }
        } else {
          straightAccumSecRef.current = 0;
        }
      } catch (err) {
        console.error('useLeanAngle fusion step', err);
      }
    };

    window.addEventListener('devicemotion', onMotion, true);
    return () => window.removeEventListener('devicemotion', onMotion, true);
  }, [permissionGranted, calibrationOffset, calibrationProfile, applyBikeCalibrationFromGravity]);

  const resetMaxLean = () => {
    setMaxLeanLeft(0);
    setMaxLeanRight(0);
  };

  const calibrate = useCallback(() => {
    try {
      dynamicBiasRef.current = 0;
      const samples = angleHistoryRef.current.slice(-15);
      const median = samples.length
        ? [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]
        : kf.current.getAngleRad() * DEG;
      const v = clampOffset(median);
      if (calibrationProfile === 'pocket') {
        setOffsetPocket(v);
      } else {
        setOffsetHandlebar(v);
      }
    } catch (e) {
      console.error('useLeanAngle calibrate', e);
    }
  }, [calibrationProfile]);

  const applyCalibrationStep = useCallback((error: number, strength: number = 0.005) => {
    setOffsetHandlebar((prev) => clampOffset(prev + error * strength));
  }, []);

  return { leanAngle, maxLeanLeft, maxLeanRight, permissionGranted, requestPermission, resetMaxLean, calibrate, applyCalibrationStep };
};
