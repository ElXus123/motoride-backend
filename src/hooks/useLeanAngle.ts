import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  lowPassVec3,
  normalizeVec3,
  lowPassScalar,
  complementaryAngleRad,
} from '../lib/motorcycleLean/filters';
import {
  buildBikeBasisAtCalibration,
  leanDegFromGravityInBikeFrame,
  rollRateFromGyro,
  rotationFromTo,
} from '../lib/motorcycleLean/geometry';
import {
  DEFAULT_KINEMATIC_MIN_SPEED_MPS,
  kinematicBlendWeight,
  kinematicLeanDegFromSpeedAndYaw,
  yawRateAboutGravityDegPerSec,
} from '../lib/motorcycleLean/kinematicLean';
import { PocketInstabilityTracker } from '../lib/motorcycleLean/pocketDetection';
import { evaluateCurvePlausibility, lateralAccelMagnitude } from '../lib/motorcycleLean/curveDetection';
import {
  getRemappedRotationRateDeg,
  getScreenOrientationAngleDeg,
  orientationBucket,
  remapDeviceVectorToNaturalPortrait,
} from '../lib/motorcycleLean/deviceScreenFrame';

/** Manillar/soporte: móvil fijo. Bolsillo/MirrorLink: móvil en el cuerpo; el cero debe ser independiente. */
export type LeanCalibrationProfile = 'handlebar' | 'pocket';

const STORAGE_HANDLEBAR = 'motoride_lean_calibration_offset_handlebar_v1';
const STORAGE_POCKET = 'motoride_lean_calibration_offset_pocket_v1';
const LEGACY_CALIBRATION_KEY = 'motoride_lean_calibration_offset_v1';

const EZ: [number, number, number] = [0, 0, 1];
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Alinea el signo del IMU con la UI: leanAngle &gt; 0 = inclinación a la derecha, &lt; 0 = izquierda.
 * En algunos dispositivos el eje lateral del marco moto queda invertido respecto a esa convención.
 */
const LEAN_SENSOR_SIGN = -1;

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
  /** Ángulo de roll fusionado (rad), filtro complementario giro + acelerómetro. */
  const compAngleRadRef = useRef(0);
  const calibratedRef = useRef(false);
  const displayLpRef = useRef(0);
  const straightAccumSecRef = useRef(0);
  /** Último bucket de orientación (0/90/180/270): al cambiar, el marco IMU respecto a la app cambia → recalibrar. */
  const lastOrientationBucketRef = useRef<0 | 90 | 180 | 270>(0);

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
    compAngleRadRef.current = 0;
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
    const ld = leanDegFromGravityInBikeFrame(g, RAlign.current, gbScratch.current);
    compAngleRadRef.current = ld * RAD * LEAN_SENSOR_SIGN;
    calibratedRef.current = true;
    straightAccumSecRef.current = 0;
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    const assumedHz = 30;
    const dtDefault = 1 / assumedHz;

    const updateMotionStationary = (event: DeviceMotionEvent, screenDeg: number) => {
      const rr = event.rotationRate;
      const accLin = event.acceleration;
      const accg = event.accelerationIncludingGravity;

      const wRemapStationary = getRemappedRotationRateDeg(
        rr as { x?: number; y?: number; z?: number; alpha?: number; beta?: number; gamma?: number } | null,
        screenDeg
      );

      let still = true;
      let hasHint = false;

      if (rr && (rr.alpha != null || rr.beta != null || rr.gamma != null || (rr as { x?: number }).x != null)) {
        hasHint = true;
        const spin =
          Math.abs(wRemapStationary[0]) + Math.abs(wRemapStationary[1]) + Math.abs(wRemapStationary[2]);
        still = still && spin < 7;
      }

      if (accLin && accLin.x != null && accLin.y != null && accLin.z != null) {
        hasHint = true;
        const aLin = remapDeviceVectorToNaturalPortrait(accLin.x, accLin.y, accLin.z, screenDeg);
        const m = Math.hypot(aLin[0], aLin[1], aLin[2]);
        still = still && m < 0.5;
      }

      if (accg && accg.x != null && accg.y != null && accg.z != null) {
        const gLoc = remapDeviceVectorToNaturalPortrait(accg.x, accg.y, accg.z, screenDeg);
        const norm = Math.hypot(gLoc[0], gLoc[1], gLoc[2]);
        if (norm > 2) {
          hasHint = true;
          const nx = gLoc[0] / norm;
          const ny = gLoc[1] / norm;
          const nz = gLoc[2] / norm;
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

        const screenDeg = getScreenOrientationAngleDeg();
        const ob = orientationBucket(screenDeg);
        if (ob !== lastOrientationBucketRef.current) {
          lastOrientationBucketRef.current = ob;
          calibratedRef.current = false;
          gLpInit.current = false;
          pocket.current.reset();
          compAngleRadRef.current = 0;
          displayLpRef.current = 0;
          prevGravUnitRef.current = null;
        }

        updateMotionStationary(ev, screenDeg);

        const now =
          typeof ev.timeStamp === 'number' && ev.timeStamp > 0 ? ev.timeStamp : performance.now();
        let dt = dtDefault;
        if (lastTs.current != null) {
          dt = Math.min(0.12, Math.max(0.002, (now - lastTs.current) / 1000));
        }
        lastTs.current = now;

        const gLoc = remapDeviceVectorToNaturalPortrait(accg.x!, accg.y!, accg.z!, screenDeg);
        gRaw.current[0] = gLoc[0];
        gRaw.current[1] = gLoc[1];
        gRaw.current[2] = gLoc[2];

        const wRemap = getRemappedRotationRateDeg(
          rr as { x?: number; y?: number; z?: number; alpha?: number; beta?: number; gamma?: number } | null,
          screenDeg
        );
        const rrForPocket = { x: wRemap[0], y: wRemap[1], z: wRemap[2] };
        const accLinForPocket =
          accLin && accLin.x != null && accLin.y != null && accLin.z != null
            ? (() => {
                const a = remapDeviceVectorToNaturalPortrait(accLin.x, accLin.y, accLin.z, screenDeg);
                return { x: a[0], y: a[1], z: a[2] };
              })()
            : null;
        pocket.current.pushSample(rrForPocket, accLinForPocket);

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
          gLp.current[0] = gLoc[0];
          gLp.current[1] = gLoc[1];
          gLp.current[2] = gLoc[2];
          gLpInit.current = true;
        } else {
          lowPassVec3(gLp.current, gLp.current, gRaw.current, lpAlpha);
        }

        gUnit.current[0] = gLp.current[0];
        gUnit.current[1] = gLp.current[1];
        gUnit.current[2] = gLp.current[2];
        const gOk = normalizeVec3(gUnit.current);
        const gMag = Math.hypot(gLoc[0], gLoc[1], gLoc[2]);

        if (!gOk) return;

        if (!calibratedRef.current) {
          applyBikeCalibrationFromGravity();
        }

        const wx = wRemap[0];
        const wy = wRemap[1];
        const wz = wRemap[2];

        const leanDegAccel =
          leanDegFromGravityInBikeFrame(gUnit.current, RAlign.current, gbScratch.current) * LEAN_SENSOR_SIGN;
        const thetaAccRad = leanDegAccel * RAD;

        const omegaRoll =
          rollRateFromGyro(wx, wy, wz, forwardCal.current) * LEAN_SENSOR_SIGN;

        const yawAboutG = yawRateAboutGravityDegPerSec(
          wx,
          wy,
          wz,
          gUnit.current[0],
          gUnit.current[1],
          gUnit.current[2]
        );

        const speed = speedRef.current ?? 0;
        const speedAbs = Math.abs(speed);
        let kinDeg = kinematicLeanDegFromSpeedAndYaw(speedAbs, yawAboutG) * LEAN_SENSOR_SIGN;
        if (Math.abs(leanDegAccel) > 4 && Math.abs(kinDeg) > 4 && Math.sign(leanDegAccel) !== Math.sign(kinDeg)) {
          kinDeg = -kinDeg;
        }
        const thetaKinRad = kinDeg * RAD;

        let lateralA = 0;
        if (accLin && accLin.x != null && accLin.y != null && accLin.z != null) {
          const aL = remapDeviceVectorToNaturalPortrait(accLin.x, accLin.y, accLin.z, screenDeg);
          lateralA = lateralAccelMagnitude(
            aL[0],
            aL[1],
            aL[2],
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

        const wKinBase = kinematicBlendWeight(speedAbs, yawAboutG) * (curve.leanMeaningful ? 1 : 0.35);
        const useKinematic =
          speedAbs >= DEFAULT_KINEMATIC_MIN_SPEED_MPS * 0.92 && wKinBase > 0.02;
        const zMeasRad = useKinematic
          ? thetaAccRad * (1 - wKinBase) + thetaKinRad * wKinBase
          : thetaAccRad;

        let compAlpha = 0.065;
        if (speedAbs < DEFAULT_KINEMATIC_MIN_SPEED_MPS) {
          compAlpha = isPocketProfile ? 0.11 : 0.14 + instability * 0.06;
        } else {
          compAlpha = isPocketProfile ? 0.042 : 0.055 + instability * 0.05;
          compAlpha *= 0.88 + Math.min(0.12, wKinBase * 0.2);
        }
        if (gMag < 8.5 || gMag > 11.2) compAlpha += 0.035;
        if (!curve.leanMeaningful && speedAbs >= DEFAULT_KINEMATIC_MIN_SPEED_MPS) compAlpha += 0.02;
        compAlpha = Math.max(0.018, Math.min(0.22, compAlpha));

        compAngleRadRef.current = complementaryAngleRad(
          compAngleRadRef.current,
          zMeasRad,
          omegaRoll,
          dt,
          compAlpha
        );

        let internalDeg = compAngleRadRef.current * DEG;
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
        // Tras remapear IMU a «retrato virtual», en apaisado (90°/270°) suele invertirse el eje lateral
        // respecto a la convención UI (derecha/izquierda); un -1 corrige el signo en horizontal.
        if (ob === 90 || ob === 270) {
          outDeg = -outDeg;
        }

        if (outDeg > 60) outDeg = 60;
        if (outDeg < -60) outDeg = -60;

        const lowSpeedLean = speedAbs < DEFAULT_KINEMATIC_MIN_SPEED_MPS;
        const deadDeg = lowSpeedLean
          ? isPocketProfile
            ? 0.85
            : 0.55
          : tableFlatRest
            ? 4.8
            : stationaryButLeaning
              ? 1.0
              : speedUnknown
                ? 2.2
                : 1.0;
        if (Math.abs(outDeg) < deadDeg) outDeg = 0;

        setLeanAngle(outDeg);

        const roundedAngle = Math.round(outDeg);
        const minMaxThreshold = lowSpeedLean ? 0 : tableFlatRest ? 10 : 0;
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
        : compAngleRadRef.current * DEG;
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
