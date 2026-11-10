/**
 * Air-trick maths (no three, no DOM): the move keys spin the character while it is airborne.
 * Forward/back = front/back flips (rotation about the body's right axis), left/right = spins.
 */
import { TRICK } from './constants';

const TAU = Math.PI * 2;

export interface TrickEvent {
  kind: 'flip' | 'spin';
  /** How many full rotations of this kind so far in this flight. */
  count: number;
  /** Flips + spins so far in this flight. */
  total: number;
}

/** Distance (radians) from the nearest whole turn. */
export function turnError(angle: number): number {
  return Math.abs(angle - TAU * Math.round(angle / TAU));
}

export class TrickState {
  /** Visual angles (radians): pitch = flip about the body's X axis, yaw = spin about its Y axis. */
  pitch = 0;
  yaw = 0;
  pitchVel = 0;
  yawVel = 0;
  flips = 0;
  spins = 0;
  private maxPitch = 0;
  private maxYaw = 0;

  reset(): void {
    this.pitch = this.yaw = this.pitchVel = this.yawVel = 0;
    this.flips = this.spins = 0;
    this.maxPitch = this.maxYaw = 0;
  }

  get rotations(): number {
    return this.flips + this.spins;
  }

  /** True while a move key is spinning us. */
  spinning(x: number, y: number): boolean {
    return Math.hypot(x, y) > TRICK.idleInput;
  }

  /** How far from standing upright (radians, both axes summed). */
  uprightError(): number {
    return turnError(this.pitch) + turnError(this.yaw);
  }

  get upright(): boolean {
    return this.uprightError() <= TRICK.uprightTolerance;
  }

  /**
   * Advance by `dt`. `x`/`y` are the raw move keys (x right+, y forward+), `airTime` the seconds
   * since the arc began and `toLand` the seconds until it ends. Returns newly completed rotations.
   */
  update(dt: number, x: number, y: number, airTime: number, toLand: number): TrickEvent[] {
    const keys = this.spinning(x, y);
    const active = airTime >= TRICK.minAir && toLand > 0.05;
    const k = 1 - Math.exp(-TRICK.response * dt);
    if (active && keys) {
      this.pitchVel += (y * TRICK.flipRate - this.pitchVel) * k;
      this.yawVel += (-x * TRICK.spinRate - this.yawVel) * k;
    } else {
      this.pitchVel *= Math.exp(-6 * dt);
      this.yawVel *= Math.exp(-6 * dt);
    }
    this.pitch += this.pitchVel * dt;
    this.yaw += this.yawVel * dt;

    // Idle keys near the ground: level out smoothly to the nearest whole turn.
    if (!keys && toLand < TRICK.restoreWindow) {
      const r = 1 - Math.exp(-14 * dt);
      this.pitch += (TAU * Math.round(this.pitch / TAU) - this.pitch) * r;
      this.yaw += (TAU * Math.round(this.yaw / TAU) - this.yaw) * r;
      this.pitchVel *= 0.5;
      this.yawVel *= 0.5;
    }

    const out: TrickEvent[] = [];
    this.maxPitch = Math.max(this.maxPitch, Math.abs(this.pitch));
    this.maxYaw = Math.max(this.maxYaw, Math.abs(this.yaw));
    const flips = Math.floor((this.maxPitch + TRICK.countSlop) / TAU);
    const spins = Math.floor((this.maxYaw + TRICK.countSlop) / TAU);
    while (this.flips < flips) {
      this.flips++;
      out.push({ kind: 'flip', count: this.flips, total: this.rotations });
    }
    while (this.spins < spins) {
      this.spins++;
      out.push({ kind: 'spin', count: this.spins, total: this.rotations });
    }
    return out;
  }
}
