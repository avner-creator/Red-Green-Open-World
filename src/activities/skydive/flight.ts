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
  /** Canopy turn rate at full stick and the hands-off homing turn rate towards the rings, rad/s. */
  canopyTurn: 1.1,
  canopyAssistTurn: 0.9,
  /**
   * Hands-off canopy autopilot: with spare height it flies beside the rings (up to this many
   * radians off the bearing) to burn height in a spiral, then turns straight in.
   */
  assistMaxOffset: 1.45,
  /** Spare glide metres per radian of offset. */
  assistOffsetScale: 14,
  /** Hands-off freefall drift along the gem trail: at most this much of a full stick. */
  freefallAssist: 0.45,
  /** Stick below this counts as no input for the assist. */
  assistDeadZone: 0.15,
  /** Seconds without input before the assist eases back in, and how fast it does (1/s). */
  assistReturnDelay: 1,
  assistReturnRate: 2.5,
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
  /** Peak camera orbit rate during the ascent, rad/s (sine-eased: about 200° over the climb). */
  ascentOrbitRate: 0.55,
  /** Boarding hop into the basket. */
  boardSeconds: 0.7,
  /**
   * Soft leash to the rings (holding a direction can never fly you out to sea): beyond `leashStart`
   * metres the autopilot gets a growing minimum share, `leashMax` at `leashFull`; past `bowl` it
   * takes over completely and turns straight home.
   */
  leashStart: 12,
  leashFull: 38,
  leashMax: 0.95,
  bowl: 45,
  /** Freefall: the share of the stick blended towards the rings at full leash. */
  freefallLeash: 0.95,
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
  /** Hands-off assist weight 0..1 (default 1) and seconds since the last stick input. */
  assist?: number;
  idle?: number;
}

/** Hands-off assist state shared by freefall and canopy. */
export interface AssistState {
  assist?: number;
  idle?: number;
}

/**
 * Update the hands-off assist weight: any stick input blends it out at once (by its magnitude,
 * so full stick is full manual control); after `assistReturnDelay` s of no input it eases back.
 * Returns the weight 0..1.
 */
export function updateAssist(a: AssistState, stick: number, dt: number): number {
  let w = a.assist ?? 1;
  if (stick > SKY.assistDeadZone) {
    a.idle = 0;
    w = Math.min(w, 1 - Math.min(1, stick));
  } else {
    a.idle = (a.idle ?? 0) + dt;
    if (a.idle >= SKY.assistReturnDelay) w += (1 - w) * follow(SKY.assistReturnRate, dt);
  }
  a.assist = w;
  return w;
}

/**
 * Gentle hands-off freefall drift towards `target` (the next gem of the trail, or the rings):
 * just enough horizontal speed to arrive over it as the fall reaches its height, capped at
 * `freefallAssist` of a full stick.
 */
export function freefallAssistSteer(pos: V3, vel: V3, target: V3 | null): { x: number; z: number } {
  if (!target) return { x: 0, z: 0 };
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) return { x: 0, z: 0 };
  const dy = pos.y - target.y;
  const tReach = dy > 0 ? dy / Math.max(SKY.terminal * 0.5, -vel.y) : 0.5;
  const want = Math.min(SKY.freefallAssist, d / tReach / SKY.steerSpeed);
  return { x: (dx / d) * want, z: (dz / d) * want };
}

/** The next point of a trail (sorted highest first) still below a body at height `y`. */
export function nextBelow<T extends V3>(trail: readonly T[], y: number): T | null {
  for (const p of trail) if (p.y < y) return p;
  return null;
}

/** Horizontal metres the canopy can still glide from `heightAboveSurface` (incl. the flare). */
export function canopyRange(heightAboveSurface: number): number {
  const above = Math.max(0, heightAboveSurface - SKY.flareHeight);
  const flare = Math.min(heightAboveSurface, SKY.flareHeight);
  return (above / SKY.canopySink) * SKY.canopyGlide + (flare / SKY.flareSink) * SKY.flareGlide;
}

/**
 * Hands-off canopy heading: straight at `home` when the height just suffices, otherwise offset
 * to the side the canopy is already turning (a spiral that burns spare height over the rings).
 */
export function canopyAssistHeading(pos: V3, yaw: number, home: { x: number; z: number }, heightAboveSurface: number): number {
  const dx = home.x - pos.x;
  const dz = home.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return yaw;
  const bearing = Math.atan2(dx, dz);
  const spare = canopyRange(heightAboveSurface) - d;
  const offset = Math.max(0, Math.min(SKY.assistMaxOffset, spare / SKY.assistOffsetScale));
  const side = angleTo(bearing, yaw) >= 0 ? 1 : -1;
  return bearing + side * offset;
}

/**
 * One canopy step. The canopy flies forward along `yaw`; the stick (camera-relative) sets a wanted
 * heading. Hands-off (see `updateAssist`) an autopilot homes in on `home` (the landing rings),
 * spiralling down over them while it has height to spare. Vertical speed eases
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
  const own = updateAssist(st, stick, dt);
  const dist = home ? Math.hypot(home.x - pos.x, home.z - pos.z) : 0;
  // The leash: far from the rings the autopilot always keeps a share (all of it past the bowl).
  const w = home ? Math.max(own, leashWeight(dist)) : own;
  const turnTo = (want: number, rate: number): number => Math.max(-rate, Math.min(rate, angleTo(st.yaw, want) / Math.max(dt, 1e-4)));
  const manual = stick > SKY.assistDeadZone ? turnTo(Math.atan2(steer.x, steer.z), SKY.canopyTurn * stick) : 0;
  const homeHeading = home && dist >= SKY.leashFull ? Math.atan2(home.x - pos.x, home.z - pos.z) : home ? canopyAssistHeading(pos, st.yaw, home, heightAboveSurface) : 0;
  const assist = home && w > 0 ? turnTo(homeHeading, SKY.canopyAssistTurn * (dist >= SKY.leashFull ? 1.4 : 1)) : 0;
  const turn = manual * (1 - w) + assist * w;
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

/** Minimum autopilot share for a canopy (or freefall) `dist` metres from the rings. */
export function leashWeight(dist: number): number {
  if (dist >= SKY.bowl) return 1;
  const k = (dist - SKY.leashStart) / (SKY.leashFull - SKY.leashStart);
  return SKY.leashMax * clamp01(k);
}

/**
 * Freefall steering with the leash: the stick is blended towards "straight at the rings" the
 * further out the faller is (`target` = the ring centre).
 */
export function leashSteer(pos: V3, steer: { x: number; z: number }, target: { x: number; z: number }): { x: number; z: number } {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return steer;
  const w = Math.min(1, leashWeight(d)) * SKY.freefallLeash;
  return { x: steer.x * (1 - w) + (dx / d) * w, z: steer.z * (1 - w) + (dz / d) * w };
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
