/**
 * Detección heurística de “modo bolsillo”: mucho movimiento aparente sin trayectoria clara.
 */

import type { PocketNoiseLevel } from './types';

const BUF = 8;

export class PocketInstabilityTracker {
  private gyroMagBuf: number[] = [];
  private accJerkBuf: number[] = [];
  private lastAcc: [number, number, number] | null = null;

  pushSample(
    rotationRateDeg: { x: number; y: number; z: number } | null,
    linearAccel: { x: number; y: number; z: number } | null
  ): void {
    if (rotationRateDeg && rotationRateDeg.x != null && rotationRateDeg.y != null && rotationRateDeg.z != null) {
      const gm = Math.abs(rotationRateDeg.x) + Math.abs(rotationRateDeg.y) + Math.abs(rotationRateDeg.z);
      this.gyroMagBuf.push(gm);
      if (this.gyroMagBuf.length > BUF) this.gyroMagBuf.shift();
    }
    if (linearAccel && linearAccel.x != null && linearAccel.y != null && linearAccel.z != null) {
      const cur: [number, number, number] = [linearAccel.x, linearAccel.y, linearAccel.z];
      if (this.lastAcc) {
        const j = Math.hypot(cur[0] - this.lastAcc[0], cur[1] - this.lastAcc[1], cur[2] - this.lastAcc[2]);
        this.accJerkBuf.push(j);
        if (this.accJerkBuf.length > BUF) this.accJerkBuf.shift();
      }
      this.lastAcc = cur;
    }
  }

  /** 0 = tranquilo, 1 = muy inestable */
  score(gyroNoiseThreshold: number): number {
    const gMean =
      this.gyroMagBuf.length > 0 ? this.gyroMagBuf.reduce((a, b) => a + b, 0) / this.gyroMagBuf.length : 0;
    const jMean =
      this.accJerkBuf.length > 0 ? this.accJerkBuf.reduce((a, b) => a + b, 0) / this.accJerkBuf.length : 0;
    const gScore = Math.min(1, Math.max(0, (gMean - gyroNoiseThreshold * 0.35) / (gyroNoiseThreshold * 2)));
    const jScore = Math.min(1, jMean / 3);
    return Math.min(1, 0.55 * gScore + 0.45 * jScore);
  }

  level(gyroNoiseThreshold: number): PocketNoiseLevel {
    const s = this.score(gyroNoiseThreshold);
    if (s < 0.28) return 'calm';
    if (s < 0.55) return 'moderate';
    return 'high';
  }

  reset(): void {
    this.gyroMagBuf.length = 0;
    this.accJerkBuf.length = 0;
    this.lastAcc = null;
  }
}
