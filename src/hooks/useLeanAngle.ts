import { useState, useEffect, useRef, useCallback } from 'react';

export const useLeanAngle = () => {
  const CALIBRATION_STORAGE_KEY = 'motoride_lean_calibration_offset_v1';
  const [leanAngle, setLeanAngle] = useState(0);
  const [maxLeanLeft, setMaxLeanLeft] = useState(0);
  const [maxLeanRight, setMaxLeanRight] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const smoothedAngleRef = useRef(0);
  const angleHistoryRef = useRef<number[]>([]);

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

    const handleOrientation = (event: DeviceOrientationEvent) => {
      lastOrientationUpdateRef.current = Date.now();
      let angle = 0;
      const isLandscape = window.innerWidth > window.innerHeight;
      const orientationAngle =
        typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number'
          ? screen.orientation.angle
          : typeof window !== 'undefined' && typeof window.orientation === 'number'
            ? window.orientation
            : 0;

      // Roll lateral: en retrato gamma; en apaisado suele mezclarse beta/gamma según el dispositivo.
      let roll = 0;
      if (isLandscape) {
        const beta = event.beta ?? 0;
        const gamma = event.gamma ?? 0;
        // Si un eje domina claramente, usarlo (mejor en bolsillo/montajes raros).
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

      // To make it "real" and ignore pitch (acceleration/braking), 
      // we can use a small threshold and ensure we are only detecting lateral movement.
      // We also cap it at 60 degrees as that's a realistic max for most riders.
      if (roll > 60) roll = 60;
      if (roll < -60) roll = -60;

      setRawAngle(roll);
      
      // Low-pass filter for smoother, more realistic lean angle
      // We use a slightly more aggressive filter for "real" feel
      const alpha = 0.1; // Smoothing factor (lower = smoother but slower)
      smoothedAngleRef.current = smoothedAngleRef.current + alpha * (roll - smoothedAngleRef.current);
      angleHistoryRef.current.push(smoothedAngleRef.current);
      if (angleHistoryRef.current.length > 30) {
        angleHistoryRef.current.shift();
      }
      
      // Dead zone to prevent jitter when upright
      let finalAngle = smoothedAngleRef.current - calibrationOffset;
      if (Math.abs(finalAngle) < 1) finalAngle = 0;
      
      const roundedAngle = Math.round(finalAngle);
      setLeanAngle(roundedAngle);

      if (roundedAngle < 0) {
        setMaxLeanLeft((prev) => Math.max(prev, Math.abs(roundedAngle)));
      } else if (roundedAngle > 0) {
        setMaxLeanRight((prev) => Math.max(prev, roundedAngle));
      }
    };

    const handleMotion = (event: DeviceMotionEvent) => {
      // iOS fallback: some devices return poor/empty orientation values.
      if (Date.now() - lastOrientationUpdateRef.current < 1500) return;
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const norm = Math.sqrt(x * x + y * y + z * z);
      if (!norm) return;
      const roll = Math.max(-60, Math.min(60, (Math.asin(x / norm) * 180) / Math.PI));

      setRawAngle(roll);
      const alpha = 0.1;
      smoothedAngleRef.current = smoothedAngleRef.current + alpha * (roll - smoothedAngleRef.current);
      let finalAngle = smoothedAngleRef.current - calibrationOffset;
      if (Math.abs(finalAngle) < 1) finalAngle = 0;
      const roundedAngle = Math.round(finalAngle);
      setLeanAngle(roundedAngle);

      if (roundedAngle < 0) {
        setMaxLeanLeft((prev) => Math.max(prev, Math.abs(roundedAngle)));
      } else if (roundedAngle > 0) {
        setMaxLeanRight((prev) => Math.max(prev, roundedAngle));
      }
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
