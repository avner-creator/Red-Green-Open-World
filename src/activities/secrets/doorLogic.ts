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
  /** Button centres along the door, metres from the door centre (left → right, door-local x). */
  buttonX: [-1.35, -0.45, 0.45, 1.35] as readonly number[],
  /** Standing zone in front of the door (door-local z) where a press counts. */
  zoneNear: 0.2,
  zoneFar: 3.4,
  zoneHalfWidth: 2.1,
  /**
   * Floor pads: on an arc of this radius round the door centre, at these angles (radians, 0 = straight
   * out of the door, left → right). Walking from one pad to any other never crosses a third.
   */
  padArc: 3.5,
  padAngles: [-0.98, -0.33, 0.33, 0.98] as readonly number[],
  /** Pad cap radius; a step counts within `padStep` of the centre. */
  padR: 0.62,
  padStep: 0.68,
} as const;

/** Door-local x,z of floor pad `i`. */
export function padLocal(i: number): { x: number; z: number } {
  const a = DOOR_RULES.padAngles[i];
  return { x: Math.sin(a) * DOOR_RULES.padArc, z: Math.cos(a) * DOOR_RULES.padArc };
}

/** Which floor pad the player stands on (door-local x,z), or -1. */
export function padAt(localX: number, localZ: number): number {
  for (let i = 0; i < DOOR_RULES.buttons; i++) {
    const p = padLocal(i);
    if (Math.hypot(localX - p.x, localZ - p.z) <= DOOR_RULES.padStep) return i;
  }
  return -1;
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

/** Which button the player is lined up with (door-local x), or -1 outside the standing zone. */
export function buttonAt(localX: number, localZ: number): number {
  if (localZ < DOOR_RULES.zoneNear || localZ > DOOR_RULES.zoneFar || Math.abs(localX) > DOOR_RULES.zoneHalfWidth) return -1;
  let best = 0;
  let bestD = Infinity;
  DOOR_RULES.buttonX.forEach((bx, i) => {
    const d = Math.abs(localX - bx);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
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
