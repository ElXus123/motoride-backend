import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Inclinación desde IMU. Usa velocidad GPS y, sobre todo, datos de `devicemotion`
 * (giro + aceleración lineal + estabilidad de gravedad) para detectar móvil quieto en mesa
 * y no seguir el ruido de orientación/magnetómetro.
 */
export const useLeanAngle = (speedMps?: number | null) => {
  const CALIBRATION_STORAGE_KEY = 'motoride_lean_calibration_offset_v1';
  const [leanAngle, setLeanAngle] = useState(0);
  const [maxLeanLeft, setMaxLeanLeft] = useState(0);
  const [maxLeanRight, setMaxLeanRight] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const smoothedAngleRef = useRef(0);
  const angleHistoryRef = useRef<number[]>([]);
  const speedRef = useRef<number | null | undefined>(speedMps);
  const rollMedianWindowRef = useRef<number[]>([]);
  const motionStationaryScoreRef = useRef(0);
  const motionStationaryRef = useRef(false);
  const prevGravUnitRef = useRef<{ x: number; y: number; z: number } | null>(null);

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
            // WebKit: opcional si el permiso ya quedó cubierto por orientación.
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

  const [rawAngle, setRawAngle] = useState(0);
  const lastOrientationUpdateRef = useRef(0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (saved !== null) {
        const parsed = Number(saved);
        if (!Number.isNaN(parsed)) {
          setCalibrationOffset(Math.max(-30, Math.min(30, parsed)));
        }
      }
    } catch {
      // Ignore storage issues (private mode, blocked storage, etc.).
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CALIBRATION_STORAGE_KEY, String(calibrationOffset));
    } catch {
      // Ignore storage issues.
    }
  }, [calibrationOffset]);

  useEffect(() => {
    if (!permissionGranted) return;

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

    const processRollSample = (rollRaw: number) => {
      let roll = rollRaw;
      if (roll > 60) roll = 60;
      if (roll < -60) roll = -60;

      setRawAngle(roll);

      const win = rollMedianWindowRef.current;
      win.push(roll);
      if (win.length > 9) win.shift();
      const sorted = [...win].sort((a, b) => a - b);
      const rollStable = sorted[Math.floor(sorted.length / 2)];

      let jitteryOrientation = false;
      if (win.length >= 6) {
        const mean = win.reduce((a, b) => a + b, 0) / win.length;
        let sq = 0;
        for (const x of win) sq += (x - mean) * (x - mean);
        const variance = sq / win.length;
        jitteryOrientation = variance > 70 && Math.abs(mean) < 18;
      }

      const v = speedRef.current;
      const gpsSaysStopped = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1.35;
      const speedUnknown = v == null;
      const imuSaysStill = motionStationaryRef.current;
      /** En marcha el GPS suele marcar >2,5 m/s: no tratar el ruido de orientación como “mesa”. */
      const gpsLikelyMoving = typeof v === 'number' && Number.isFinite(v) && Math.abs(v) >= 2.5;
      const physicallyStill =
        gpsSaysStopped || imuSaysStill || (!gpsLikelyMoving && jitteryOrientation);

      const alpha = physicallyStill ? 0.02 : speedUnknown ? 0.075 : 0.12;
      smoothedAngleRef.current =
        smoothedAngleRef.current + alpha * (rollStable - smoothedAngleRef.current);

      if (physicallyStill && Math.abs(smoothedAngleRef.current) < 14) {
        smoothedAngleRef.current *= 0.88;
      }

      angleHistoryRef.current.push(smoothedAngleRef.current);
      if (angleHistoryRef.current.length > 30) angleHistoryRef.current.shift();

      let finalAngle = smoothedAngleRef.current - calibrationOffset;
      const deadDeg = physicallyStill ? 6.5 : speedUnknown ? 2.5 : 1.2;
      if (Math.abs(finalAngle) < deadDeg) finalAngle = 0;

      const roundedAngle = Math.round(finalAngle);
      setLeanAngle(roundedAngle);

      const minMaxThreshold = physicallyStill ? 12 : 0;
      if (roundedAngle < 0 && Math.abs(roundedAngle) >= minMaxThreshold) {
        setMaxLeanLeft((prev) => Math.max(prev, Math.abs(roundedAngle)));
      } else if (roundedAngle > 0 && roundedAngle >= minMaxThreshold) {
        setMaxLeanRight((prev) => Math.max(prev, roundedAngle));
      }
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      lastOrientationUpdateRef.current = Date.now();
      const isLandscape = window.innerWidth > window.innerHeight;
      const orientationAngle =
        typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number'
          ? screen.orientation.angle
          : typeof window !== 'undefined' && typeof window.orientation === 'number'
            ? window.orientation
            : 0;

      let roll = 0;
      if (isLandscape) {
        const beta = event.beta ?? 0;
        const gamma = event.gamma ?? 0;
        if (Math.abs(gamma) > Math.abs(beta) * 1.15) {
          roll = orientationAngle === 90 || orientationAngle === -270 ? gamma : -gamma;
        } else {
          roll = beta;
          if (orientationAngle === 270 || orientationAngle === -90) {
            roll = -roll;
          }
        }
      } else {
        roll = event.gamma || 0;
      }

      processRollSample(roll);
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      updateMotionStationary(event);
      if (Date.now() - lastOrientationUpdateRef.current < 1500) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const norm = Math.sqrt(x * x + y * y + z * z);
      if (!norm) return;
      const roll = Math.max(-60, Math.min(60, (Math.asin(x / norm) * 180) / Math.PI));
      processRollSample(roll);
    };

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [permissionGranted, calibrationOffset]);

  const resetMaxLean = () => {
    setMaxLeanLeft(0);
    setMaxLeanRight(0);
  };

  const calibrate = useCallback(() => {
    const samples = angleHistoryRef.current.slice(-15);
    if (!samples.length) {
      setCalibrationOffset(smoothedAngleRef.current);
      return;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    setCalibrationOffset(median);
  }, []);

  const applyCalibrationStep = useCallback((error: number, strength: number = 0.005) => {
    setCalibrationOffset((prev) => {
      const next = prev + error * strength;
      return Math.max(-30, Math.min(30, next));
    });
  }, []);

  return { leanAngle, maxLeanLeft, maxLeanRight, permissionGranted, requestPermission, resetMaxLean, calibrate, applyCalibrationStep };
};
