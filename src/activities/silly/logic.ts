/**
 * Silly Zone maths (pure, no three.js): bumper-mushroom impulses, the wobbly tube-character
 * springs, the see-saw launch and the beach-ball bounce. Everything is soft and comic: speeds are
 * bounded so nobody is flung far, and impulses always push away from the thing you touched.
 */

export const SILLY = {
  /** Bumper mushrooms: cap radius, cap top height above the ground, sideways and up speeds. */
  bumper: { capRadius: 1.3, top: 1.75, out: 6.5, spin: 6, up: 6, topBounce: 12.5, cooldown: 0.35 },
  /** See-saw launch: horizontal distance and apex height of the flight. */
  seesaw: { distance: 7, apex: 4.2, armDelay: 0.5 },
  /** Beach ball: radius, bounce speed when you land on it. */
  ball: { radius: 1.5, bounce: 12, mass: 9 },
  /** Flop button radius. */
  flop: { radius: 1.35, rearmAfter: 2.5 },
  /** Tube characters: segment count, segment length, push radius. */
  tube: { segments: 6, segLen: 0.55, pushRadius: 2.4 },
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Velocity for a player who touches a spinning bumper mushroom.
 * `rx, rz`: player position minus the mushroom centre (horizontal). `spin`: +1 counter-clockwise
 * (seen from above), −1 clockwise. `vIn`: the player's horizontal velocity before the hit.
 * The result always points away from the mushroom and is swept sideways by the spin.
 */
export function bumperImpulse(rx: number, rz: number, spin: number, vIn: { x: number; z: number } = { x: 0, z: 0 }): Vec3 {
  const b = SILLY.bumper;
  let d = Math.hypot(rx, rz);
  let nx = rx;
  let nz = rz;
  if (d < 1e-4) {
    // Dead centre: pick a direction from the incoming motion (or +X).
    const vl = Math.hypot(vIn.x, vIn.z);
    nx = vl > 1e-4 ? -vIn.x / vl : 1;
    nz = vl > 1e-4 ? -vIn.z / vl : 0;
    d = 1;
  }
  nx /= d;
  nz /= d;
  // Tangent of a counter-clockwise spin (seen from above, +Y up): (−n.z, n.x) rotated… in a
  // right-handed frame looking down −Y, CCW around +Y moves +X towards −Z.
  const s = spin >= 0 ? 1 : -1;
  const tx = nz * s;
  const tz = -nx * s;
  // Keep a little of the incoming tangential speed, never the part going into the cap.
  const vt = (vIn.x * tx + vIn.z * tz) * 0.3;
  return {
    x: nx * b.out + tx * (b.spin + vt),
    y: b.up,
    z: nz * b.out + tz * (b.spin + vt),
  };
}

/** Bounce off the top of a mushroom cap: mostly up, nudged along the spin. */
export function bumperTopBounce(rx: number, rz: number, spin: number): Vec3 {
  const b = SILLY.bumper;
  const d = Math.hypot(rx, rz);
  const s = spin >= 0 ? 1 : -1;
  if (d < 1e-4) return { x: 0, y: b.topBounce, z: 0 };
  const nx = rx / d;
  const nz = rz / d;
  return { x: nz * s * 2 + nx * 1.5, y: b.topBounce, z: -nx * s * 2 + nz * 1.5 };
}

/** Is a point (feet) touching a bumper's side? `dh` = horizontal distance, `y` = feet height above ground. */
export function touchesBumper(dh: number, y: number, playerRadius: number): boolean {
  return dh < SILLY.bumper.capRadius + playerRadius && y < SILLY.bumper.top - 0.3 && y > -0.5;
}

/** Is a point (feet) on top of a bumper cap (and coming down)? */
export function onBumperTop(dh: number, y: number, vy: number): boolean {
  const b = SILLY.bumper;
  return dh < b.capRadius * 0.95 && y >= b.top - 0.45 && y <= b.top + 0.45 && vy <= 0.5;
}

/** Launch velocity that flies `distance` metres horizontally along (dx, dz) with an apex of `apex` metres. */
export function arcLaunch(dx: number, dz: number, distance: number, apex: number, g: number): Vec3 {
  const vy = Math.sqrt(2 * g * apex);
  const t = (2 * vy) / g;
  const vh = distance / t;
  const l = Math.hypot(dx, dz) || 1;
  return { x: (dx / l) * vh, y: vy, z: (dz / l) * vh };
}

/** Air time of a launch that lands at the take-off height. */
export function airTime(vy: number, g: number): number {
  return (2 * Math.max(0, vy)) / g;
}

// ───────────────────────────── Wobbly tube characters ─────────────────────────────

export interface TubeState {
  /** Bend about X (tilts towards +Z) and about Z (tilts towards −X) per segment, radians. */
  ax: number[];
  az: number[];
  vx: number[];
  vz: number[];
  /** Arm flail angles (left, right): swing and its speed. */
  arm: number[];
  armV: number[];
  /** Random-ish phase so the tubes don't flail in sync. */
  phase: number;
}

export function createTube(phase: number, segments: number = SILLY.tube.segments): TubeState {
  const z = (): number[] => new Array<number>(segments).fill(0);
  return { ax: z(), az: z(), vx: z(), vz: z(), arm: [0, 0], armV: [0, 0], phase };
}

export const TUBE_SPRING = { stiff: 38, damp: 4.5, flail: 0.16, pushMax: 0.6, armStiff: 30, armDamp: 3 } as const;

/**
 * One step of a tube character. Each segment's bend is a damped spring towards a flailing target;
 * `push` (0..1) bends the whole tube away from the direction (`px`, `pz`) (unit vector from the
 * player towards the tube), more at the top. Returns the tip bend (sum of angles) for tests.
 */
export function stepTube(s: TubeState, t: number, dt: number, push = 0, px = 0, pz = 0): { ax: number; az: number } {
  const n = s.ax.length;
  const k = TUBE_SPRING;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  let tipX = 0;
  let tipZ = 0;
  for (let st = 0; st < steps; st++) {
    tipX = 0;
    tipZ = 0;
    for (let i = 0; i < n; i++) {
      const w = (i + 1) / n;
      const ph = s.phase + i * 0.9;
      // Flailing target: a lazy wave travelling up the tube plus a quicker shimmy at the top.
      const fx = k.flail * w * (Math.sin(t * 2.3 + ph) + 0.6 * Math.sin(t * 5.1 + ph * 1.7));
      const fz = k.flail * w * (Math.cos(t * 1.9 + ph * 1.3) + 0.6 * Math.sin(t * 4.3 + ph * 0.6));
      // Bend away: towards +(pz) about X, and −(px) about Z (see the state doc).
      const bend = k.pushMax * Math.max(0, Math.min(1, push)) * (0.4 + 0.6 * w) * (1 / n) * 2.2;
      const tx = fx + pz * bend;
      const tz = fz - px * bend;
      const stiff = k.stiff * (1.2 - 0.5 * w);
      s.vx[i] += (stiff * (tx - s.ax[i]) - k.damp * s.vx[i]) * h;
      s.vz[i] += (stiff * (tz - s.az[i]) - k.damp * s.vz[i]) * h;
      s.ax[i] += s.vx[i] * h;
      s.az[i] += s.vz[i] * h;
      // Never fold over (keeps it a friendly wobble).
      s.ax[i] = Math.max(-0.6, Math.min(0.6, s.ax[i]));
      s.az[i] = Math.max(-0.6, Math.min(0.6, s.az[i]));
      tipX += s.ax[i];
      tipZ += s.az[i];
    }
    for (let a = 0; a < 2; a++) {
      const target = 0.9 + 0.8 * Math.sin(t * (6 + a * 1.3) + s.phase * (a + 1)) + push * 0.8;
      s.armV[a] += (k.armStiff * (target - s.arm[a]) - k.armDamp * s.armV[a]) * h;
      s.arm[a] += s.armV[a] * h;
    }
  }
  return { ax: tipX, az: tipZ };
}

/** Kick the tube (a run-through whack): adds bend velocity away from the player. */
export function whackTube(s: TubeState, px: number, pz: number, strength: number): void {
  const n = s.ax.length;
  for (let i = 0; i < n; i++) {
    const w = (i + 1) / n;
    s.vx[i] += pz * strength * w;
    s.vz[i] -= px * strength * w;
  }
}
