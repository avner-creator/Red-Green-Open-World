/**
 * Pure skydive flight model (no three, no DOM): balloon ascent easing, freefall with drag and
 * camera-relative steering, parachute auto-open, canopy glide, scoring. Unit-tested.
 */
import { BALLOON, PLAYER } from '../../config';

/** Skydive tuning. Shared values (top height, ascent time, auto-open) come from BALLOON. */
export const SKY = {
  /** Gravity in freefall (the game's gravity, so the hop out of the basket feels familiar). */
  gravity: PLAYER.gravity,
  /** Terminal fall speed, belly-down, no steering. */
  terminal: 38,
  /** Terminal speed while "tracking" at full stick (body flattens, glides further). */
  trackingTerminal: 31,
  /** Horizontal steering speed at full stick, m/s (camera-relative). */
  steerSpeed: 14,
  /** How fast horizontal velocity follows the stick, 1/s. */
  steerResponse: 3,
  /** Hop out of the basket: up and forward speed. */
  hopUp: 6,
  hopForward: 1.6,
  /** Space can't open the chute in the first moment of the fall (the jump press itself). */
  chuteLockout: 0.6,
  /** Canopy descent and glide speeds. */
  canopySink: 5,
  canopyGlide: 9,
  /** Canopy turn rate at full stick and the gentle hands-off homing towards the rings, rad/s. */
  canopyTurn: 1.1,
  canopyAssistTurn: 0.35,
  /** How fast the jolt brakes the fall towards the canopy sink speed, 1/s. */
  canopyBrake: 5,
  /** Flare: below this height above the surface sink and glide are cut. */
  flareHeight: 3,
  flareSink: 2.2,
  flareGlide: 4.5,
  /** Seconds the player waits at the top before the robot jumps by itself. */
  autoJumpSeconds: 4,
  /** Celebration on the ground before control returns. */
  landedSeconds: 1.1,
  /** The balloon floats back down to its pad after the jump. */
  returnSeconds: 16,
  /** Boarding hop into the basket. */
  boardSeconds: 0.7,
  /** Landing ring radii (bullseye, middle, outer), metres. */
  rings: [3, 7, 12] as readonly number[],
  /** Long-glide star thresholds (horizontal metres under canopy). */
  glideStars: [40, 80, 140] as readonly number[],
} as const;

export interface V3 {
  x: number;
  y: number;
  z: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smooth ease-in-out (cubic smootherstep style, zero speed at both ends). */
export function easeInOut(t: number): number {
  const k = clamp01(t);
  return k * k * k * (k * (k * 6 - 15) + 10);
}

/** Balloon height above its pad `t` seconds into the ascent. */
export function ascentHeight(t: number, top: number = BALLOON.topHeight, seconds: number = BALLOON.ascentSeconds): number {
  return top * easeInOut(t / seconds);
}

/** Exponential approach factor for rate `k` over `dt` (frame-rate independent). */
export function follow(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

/** Camera-relative stick → world direction (same convention as the walk controller). */
export function stickToWorld(moveX: number, moveY: number, camYaw: number): { x: number; z: number } {
  const s = Math.sin(camYaw);
  const c = Math.cos(camYaw);
  return { x: s * moveY - c * moveX, z: c * moveY + s * moveX };
}

/** Terminal speed for a given stick amount (0..1): tracking flattens the body and falls slower. */
export function terminalFor(stick: number): number {
  return SKY.terminal + (SKY.trackingTerminal - SKY.terminal) * clamp01(stick);
}

/**
 * One freefall step. Quadratic drag: dv/dt = −g − g·v|v|/vt², so the fall speed tends to `vt`.
 * Horizontal velocity eases towards the camera-relative stick target.
 */
export function stepFreefall(pos: V3, vel: V3, steer: { x: number; z: number }, dt: number): void {
  const stick = Math.min(1, Math.hypot(steer.x, steer.z));
  const vt = terminalFor(stick);
  const g = SKY.gravity;
  // Semi-implicit drag keeps it stable at large dt.
  const vy = vel.y - g * dt;
  const drag = (g / (vt * vt)) * Math.abs(vy) * dt;
  vel.y = vy / (1 + drag);
  const k = follow(SKY.steerResponse, dt);
  vel.x += (steer.x * SKY.steerSpeed - vel.x) * k;
  vel.z += (steer.z * SKY.steerSpeed - vel.z) * k;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

/** Should the parachute open now? Space after the lock-out, or automatically at the safe height. */
export function shouldOpenChute(heightAboveGround: number, fallTime: number, spacePressed: boolean): boolean {
  if (heightAboveGround <= BALLOON.autoChuteHeight) return true;
  return spacePressed && fallTime >= SKY.chuteLockout;
}

/** Shortest signed angle a → b. */
export function angleTo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface CanopyState {
  yaw: number;
  /** Turn rate actually applied last step (for banking), rad/s. */
  turn: number;
}

/**
 * One canopy step. The canopy flies forward along `yaw`; the stick (camera-relative) sets a wanted
 * heading, with no input it gently homes towards `home` (the landing rings). Vertical speed eases
 * to the sink rate (the opening jolt brakes a fast fall); `heightAboveSurface` triggers the flare.
 */
export function stepCanopy(
  pos: V3,
  vel: V3,
  st: CanopyState,
  steer: { x: number; z: number },
  home: { x: number; z: number } | null,
  heightAboveSurface: number,
  dt: number,
): void {
  const stick = Math.min(1, Math.hypot(steer.x, steer.z));
  let want = st.yaw;
  let rate = 0;
  if (stick > 0.15) {
    want = Math.atan2(steer.x, steer.z);
    rate = SKY.canopyTurn * stick;
  } else if (home) {
    const dx = home.x - pos.x;
    const dz = home.z - pos.z;
    if (Math.hypot(dx, dz) > 1.5) {
      want = Math.atan2(dx, dz);
      rate = SKY.canopyAssistTurn;
    }
  }
  const d = angleTo(st.yaw, want);
  const turn = Math.max(-rate, Math.min(rate, d / Math.max(dt, 1e-4)));
  st.turn = turn;
  st.yaw += turn * dt;
  const flare = heightAboveSurface < SKY.flareHeight;
  const glide = flare ? SKY.flareGlide : SKY.canopyGlide;
  const sink = flare ? SKY.flareSink : SKY.canopySink;
  const kh = follow(2.2, dt);
  vel.x += (Math.sin(st.yaw) * glide - vel.x) * kh;
  vel.z += (Math.cos(st.yaw) * glide - vel.z) * kh;
  vel.y += (-sink - vel.y) * follow(SKY.canopyBrake, dt);
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

/** Steady-state glide ratio under canopy (horizontal metres per metre of height). */
export function glideRatio(): number {
  return SKY.canopyGlide / SKY.canopySink;
}

/** Stars for a touchdown `distance` metres from the ring centre: 3 bullseye, 2, 1, else 0. */
export function ringStars(distance: number): number {
  const [a, b, c] = SKY.rings;
  if (distance <= a) return 3;
  if (distance <= b) return 2;
  if (distance <= c) return 1;
  return 0;
}

/** Stars for a long glide of `metres` under canopy. */
export function glideStars(metres: number): number {
  let s = 0;
  for (const t of SKY.glideStars) if (metres >= t) s++;
  return s;
}
