/**
 * Two-eye vault doors (pure logic). The weak eye sees a sequence of three shapes in the door's three
 * round windows; the strong eye sees which shape belongs to each of the four big floor pads in front
 * of the door (both eyes see the pads). Stepping on the pads in the shown order opens it. A wrong
 * step is a friendly "nope": the door wobbles and the sequence starts over. No penalty, no limit.
 */

export type ShapeKind = 'star' | 'moon' | 'ring' | 'triangle';
/** Button shapes, left to right on every door (index = button id). */
export const SHAPES: readonly ShapeKind[] = ['star', 'moon', 'ring', 'triangle'];

export const DOOR_RULES = {
  buttons: SHAPES.length,
  sequenceLength: 3,
  /**
   * Floor pads, door-local x,z (left → right): two near the door, two further out and wider, a
   * trapezoid. Every pad is a corner of the shape, so a straight walk from any pad to any other
   * passes at least ~1.1 m from the centre of every other pad (QA5 M5: the old arc let a walk from
   * pad 2 to pad 0 clip pad 1).
   */
  padSpots: [
    [-2.7, 4.1],
    [-1.2, 2.0],
    [1.2, 2.0],
    [2.7, 4.1],
  ] as readonly (readonly [number, number])[],
  /** Pad cap radius; the player is on a pad within `padStep` of its centre. */
  padR: 0.62,
  padStep: 0.68,
  /**
   * A pad counts only on a deliberate step: after standing on it this long (its dwell disc fills),
   * or at once when the player is right in the middle (`padCentre` of the cap radius).
   * Crossing a pad on the way somewhere else never counts.
   */
  padDwell: 0.35,
  padCentre: 0.6,
  /** Door-local x of the rule board (left of the pads). */
  boardX: -4.4,
} as const;

/** Door-local x,z of floor pad `i`. */
export function padLocal(i: number): { x: number; z: number } {
  const p = DOOR_RULES.padSpots[i];
  return { x: p[0], z: p[1] };
}

/** Direction of pad `i` seen from the door centre (radians, 0 = straight out, + = right). */
export function padAngle(i: number): number {
  const p = padLocal(i);
  return Math.atan2(p.x, p.z);
}

/** Which floor pad the player stands on (door-local x,z), or -1. */
export function padAt(localX: number, localZ: number): number {
  for (let i = 0; i < DOOR_RULES.buttons; i++) {
    const p = padLocal(i);
    if (Math.hypot(localX - p.x, localZ - p.z) <= DOOR_RULES.padStep) return i;
  }
  return -1;
}

/**
 * Turns "where the player is" into deliberate pad steps: a pad is pressed once per visit, after
 * `padDwell` s on it or at once in its middle. Leaving the pad (or `reset`) starts over.
 */
export class PadStepper {
  /** The pad stood on (-1 none). */
  pad = -1;
  /** Seconds on `pad` this visit. */
  time = 0;
  /** True once this visit has pressed the pad. */
  done = false;

  /** Feed the player's door-local position (or `on = false` when pads cannot be pressed); returns the pad pressed this frame or -1. */
  update(localX: number, localZ: number, dt: number, on = true): number {
    const at = on ? padAt(localX, localZ) : -1;
    if (at !== this.pad) {
      this.pad = at;
      this.time = 0;
      this.done = false;
    }
    if (at < 0 || this.done) return -1;
    this.time += dt;
    const c = padLocal(at);
    const centred = Math.hypot(localX - c.x, localZ - c.z) < DOOR_RULES.padR * DOOR_RULES.padCentre;
    if (this.time >= DOOR_RULES.padDwell || centred) {
      this.done = true;
      return at;
    }
    return -1;
  }

  /** Dwell disc fill 0..1 for the pad being stood on (0 once pressed or off the pads). */
  get fill(): number {
    return this.pad < 0 || this.done ? 0 : Math.min(1, this.time / DOOR_RULES.padDwell);
  }

  reset(): void {
    this.pad = -1;
    this.time = 0;
    this.done = false;
  }
}

/** Mulberry32: tiny seeded PRNG so each session's sequence is fresh but tests are deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `len` distinct button ids out of `buttons`, never in plain left-to-right order. */
export function makeSequence(seed: number, buttons: number = DOOR_RULES.buttons, len: number = DOOR_RULES.sequenceLength): number[] {
  const r = rng(seed);
  for (let attempt = 0; attempt < 16; attempt++) {
    const pool = Array.from({ length: buttons }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const seq = pool.slice(0, Math.min(len, buttons));
    const sorted = seq.every((v, i) => i === 0 || v > seq[i - 1]);
    if (!sorted || seq.length < 2) return seq;
  }
  return Array.from({ length: Math.min(len, buttons) }, (_, i) => (i * 2 + 1) % buttons);
}

/** World → door-local (x along the door, z out of the door) for a door at (dx, dz) facing `yaw`. */
export function toDoorLocal(dx: number, dz: number, yaw: number, px: number, pz: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const wx = px - dx;
  const wz = pz - dz;
  // Inverse of three's rotation.y: local = R(-yaw)·world.
  return { x: c * wx - s * wz, z: s * wx + c * wz };
}

/** Door-local → world offset (inverse of `toDoorLocal`). */
export function fromDoorLocal(yaw: number, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: c * lx + s * lz, z: -s * lx + c * lz };
}

export type PressResult = 'correct' | 'wrong' | 'opened' | 'ignored';

export class DoorLock {
  sequence: number[];
  progress = 0;
  opened = false;
  /** Number of wrong presses (for tests / feel tuning only). */
  misses = 0;

  constructor(sequence: number[]) {
    this.sequence = sequence.slice();
  }

  press(button: number): PressResult {
    if (this.opened || button < 0) return 'ignored';
    // Pressing the pad that was just pressed right again (a second E, a hop on the spot) is never a
    // new step: the sequence has no repeats.
    if (this.progress > 0 && this.sequence[this.progress - 1] === button) return 'ignored';
    if (this.sequence[this.progress] === button) {
      this.progress++;
      if (this.progress >= this.sequence.length) {
        this.opened = true;
        return 'opened';
      }
      return 'correct';
    }
    this.progress = 0;
    this.misses++;
    return 'wrong';
  }

  reset(sequence?: number[]): void {
    if (sequence) this.sequence = sequence.slice();
    this.progress = 0;
    this.opened = false;
    this.misses = 0;
  }
}
