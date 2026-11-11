/**
 * Foam Lava course plan (pure data, no three.js). Everything is in the COURSE frame:
 * x = sideways (+x = lane A, the outbound lane), z = forward from the start line, y = metres above
 * the course ground level. `courseToWorld` in index.ts places it on the island.
 *
 * The run is a U: lane A goes out (pool floats, upside-down bins, balance blocks, wobbly plank
 * bridge) to tower A, a rope swing crosses to tower B, a slip-and-slide chute comes back down
 * lane B, then a foam-cannon walkway and two bounce bubbles lead to the finish deck right next to
 * the start. Weak-eye-only: shortcut tiles beside the cannon walkway (skip the cannons and the
 * bubbles) and safe stepping stones where kids tend to slip.
 */

/** Top of the foam "lava", metres above course ground. Touching it = a foamy flop. */
export const FOAM_Y = 0.7;

/** Foam pit extent (the inflatable rim runs around it). */
export const PIT = { x0: -5.8, x1: 5.8, z0: 2.0, z1: 43.6 } as const;

export type SolidKind = 'deck' | 'float' | 'bin' | 'block' | 'plank' | 'chute' | 'bubble' | 'stone' | 'tile' | 'step';

export interface SolidDef {
  id: string;
  kind: SolidKind;
  shape: 'box' | 'cyl';
  x: number;
  z: number;
  /** Surface height at the centre (at rest). */
  top: number;
  /** Box half extents (axis-aligned in the course frame). */
  hx?: number;
  hz?: number;
  /** Cylinder radius. */
  r?: number;
  /** Chute: surface rise per metre of +z. */
  slopeZ?: number;
  /** Weak-eye-only (drawn on the WeakOnly layer; the collider is real for everyone). */
  hidden?: boolean;
  /** Checkpoint index granted by standing on it. */
  cp?: number;
}

const box = (id: string, kind: SolidKind, x: number, z: number, top: number, hx: number, hz: number, extra: Partial<SolidDef> = {}): SolidDef => ({
  id, kind, shape: 'box', x, z, top, hx, hz, ...extra,
});
const cyl = (id: string, kind: SolidKind, x: number, z: number, top: number, r: number, extra: Partial<SolidDef> = {}): SolidDef => ({
  id, kind, shape: 'cyl', x, z, top, r, ...extra,
});

/** Lane centres. */
export const LANE_A = 3.3;
export const LANE_B = -3.8;

export const CHUTE = { x: LANE_B, hx: 1.1, z0: 27.5, z1: 37.7, low: 1.0, high: 2.3 } as const;

export const SOLIDS: readonly SolidDef[] = [
  // Start (lane A) and finish (lane B) decks, side by side at the entrance, with steps up.
  box('start', 'deck', LANE_A, -0.5, 1.0, 2.1, 2.5, { cp: 0 }),
  box('startStep', 'step', LANE_A, -3.75, 0.5, 1.4, 0.75),
  box('finish', 'deck', -3.3, -0.5, 1.0, 2.1, 2.5),
  // 1. Pool floats that tip when you stand off-centre.
  cyl('float0', 'float', 3.4, 3.9, 1.05, 1.2),
  cyl('float1', 'float', 4.2, 6.3, 1.05, 1.2),
  cyl('float2', 'float', 2.6, 8.4, 1.05, 1.2),
  cyl('float3', 'float', 4.1, 10.6, 1.05, 1.2),
  // 2. Upside-down bins, a little staircase.
  cyl('bin0', 'bin', 3.5, 13.3, 1.25, 0.75),
  cyl('bin1', 'bin', 2.6, 14.9, 1.5, 0.75),
  cyl('bin2', 'bin', 3.6, 16.5, 1.75, 0.75),
  cyl('bin3', 'bin', 2.8, 18.0, 2.0, 0.75),
  // Checkpoint 1.
  box('cp1', 'deck', LANE_A, 20.8, 2.0, 2.0, 1.6, { cp: 1 }),
  // 3. Balance blocks (they wobble like the floats, only stiffer).
  box('block0', 'block', 2.7, 23.4, 2.0, 0.5, 0.5),
  box('block1', 'block', 3.9, 24.5, 2.15, 0.5, 0.5),
  box('block2', 'block', 2.7, 25.6, 2.0, 0.5, 0.5),
  box('block3', 'block', 3.9, 26.7, 2.15, 0.5, 0.5),
  // 4. Wobbly plank bridge between two pads.
  box('bridgeA', 'deck', LANE_A, 27.9, 2.0, 1.2, 0.55),
  ...[0, 1, 2, 3, 4, 5].map((i) => box(`plank${i}`, 'plank', LANE_A, 29.0 + i * 0.95, 2.0, 1.0, 0.4)),
  box('bridgeB', 'deck', LANE_A, 35.95, 2.0, 1.2, 1.25),
  // 5. Tower A (checkpoint 2) → rope swing → tower B, with a climb-out step in the gap.
  box('towerA', 'deck', LANE_A, 40.3, 2.3, 2.1, 2.6, { cp: 2 }),
  box('towerB', 'deck', LANE_B, 40.3, 2.3, 1.6, 2.6),
  box('gapStep', 'step', -1.75, 38.6, 1.6, 0.45, 0.6),
  // 6. Slip-and-slide chute down lane B.
  box('chute', 'chute', CHUTE.x, (CHUTE.z0 + CHUTE.z1) / 2, (CHUTE.low + CHUTE.high) / 2, CHUTE.hx, (CHUTE.z1 - CHUTE.z0) / 2, {
    slopeZ: (CHUTE.high - CHUTE.low) / (CHUTE.z1 - CHUTE.z0),
  }),
  // Checkpoint 3 at the bottom of the chute, then the foam-cannon walkway.
  box('cp3', 'deck', LANE_B, 25.1, 1.0, 1.6, 2.4, { cp: 3 }),
  box('walk', 'deck', LANE_B, 15.0, 1.0, 0.6, 7.7),
  // 7. Bounce bubbles before the finish.
  cyl('bubble0', 'bubble', LANE_B, 5.9, 0.95, 0.85),
  cyl('bubble1', 'bubble', -4.4, 3.8, 0.95, 0.7),
  // Weak-eye-only: safe stepping stones in the foam…
  cyl('stone0', 'stone', 1.6, 5.6, 0.98, 0.5, { hidden: true }),
  cyl('stone1', 'stone', 5.2, 8.7, 0.98, 0.5, { hidden: true }),
  cyl('stone2', 'stone', 5.0, 33.0, 0.98, 0.5, { hidden: true }),
  cyl('stone3', 'stone', 0.6, 40.6, 0.98, 0.5, { hidden: true }),
  cyl('stone4', 'stone', -0.7, 39.4, 0.98, 0.5, { hidden: true }),
  // …and the secret shortcut: a tile path beside the cannon walkway straight to the finish.
  ...Array.from({ length: 14 }, (_, i) => box(`tile${i}`, 'tile', -1.7, 22.0 - i * 1.45, 0.95, 0.42, 0.42, { hidden: true })),
];

export const SOLID_INDEX: Readonly<Record<string, number>> = Object.fromEntries(SOLIDS.map((s, i) => [s.id, i]));

/** Respawn points (feet), facing `yaw` (course frame, 0 = +z). */
export const CHECKPOINTS: readonly { x: number; y: number; z: number; yaw: number }[] = [
  { x: LANE_A, y: 1.0, z: 0.4, yaw: 0 },
  { x: LANE_A, y: 2.0, z: 20.8, yaw: 0 },
  { x: LANE_A, y: 2.3, z: 40.3, yaw: -Math.PI / 2 },
  { x: LANE_B, y: 1.0, z: 25.4, yaw: Math.PI },
];

/** Start line: where the hero (and the friend) wait during the countdown. */
export const START = { hero: { x: 3.9, z: 0.6 }, friend: { x: 2.4, z: 0.2 }, yaw: 0 } as const;

/** The finish counts once checkpoint 3 is reached and you stand on the finish deck. */
export const FINISH_ID = 'finish';

/** Rope swing: pivot, length and the parked angle (rope end resting at tower A's edge). */
export const ROPE = { x: -0.6, y: 8.4, z: 40.3, length: 5.0, parked: Math.asin(2.2 / 5.0), hang: 1.45, grab: 1.05 } as const;

/** Foam cannons on the outer wall of lane B, blowing across the walkway (+x). */
export const CANNONS: readonly { x: number; z: number; offset: number }[] = [
  { x: -6.4, z: 19.6, offset: 0 },
  { x: -6.4, z: 15.4, offset: 0.9 },
  { x: -6.4, z: 11.2, offset: 1.8 },
];
export const CANNON = {
  period: 2.8,
  /** A puff passes under feet at least this high above the walkway (a jump dodges it). */
  dodge: 0.55,
  /** Knock-back of a hit: back along the walkway (+z), up, and pulled to the walkway centre. */
  knockZ: 5.2,
  knockY: 5.5,
  /** Seconds of swelling before a puff. */
  warn: 0.7,
  /** Seconds a puff pushes. */
  blast: 0.45,
  /** Blast zone: x from the cannon to here, ±halfZ around its z, below maxY. */
  reachX: -2.6,
  halfZ: 1.25,
  maxY: 3.4,
  pushX: 8,
  pushY: 4,
} as const;

/** Main-route polyline (no shortcut) for the progress bar; `cp` = the checkpoint already reached. */
export const ROUTE: readonly { x: number; y: number; z: number; cp: number }[] = [
  { x: LANE_A, y: 1.0, z: 0.4, cp: 0 },
  { x: 3.4, y: 1.05, z: 3.9, cp: 0 },
  { x: 4.2, y: 1.05, z: 6.3, cp: 0 },
  { x: 2.6, y: 1.05, z: 8.4, cp: 0 },
  { x: 4.1, y: 1.05, z: 10.6, cp: 0 },
  { x: 3.5, y: 1.25, z: 13.3, cp: 0 },
  { x: 2.6, y: 1.5, z: 14.9, cp: 0 },
  { x: 3.6, y: 1.75, z: 16.5, cp: 0 },
  { x: 2.8, y: 2.0, z: 18.0, cp: 0 },
  { x: LANE_A, y: 2.0, z: 20.8, cp: 1 },
  { x: 2.7, y: 2.0, z: 23.4, cp: 1 },
  { x: 3.9, y: 2.15, z: 24.5, cp: 1 },
  { x: 2.7, y: 2.0, z: 25.6, cp: 1 },
  { x: 3.9, y: 2.15, z: 26.7, cp: 1 },
  { x: LANE_A, y: 2.0, z: 27.9, cp: 1 },
  { x: LANE_A, y: 2.0, z: 35.95, cp: 1 },
  { x: LANE_A, y: 2.3, z: 40.3, cp: 2 },
  { x: 1.6, y: 2.3, z: 40.3, cp: 2 },
  { x: -2.8, y: 2.3, z: 40.3, cp: 2 },
  { x: LANE_B, y: 2.3, z: 38.2, cp: 2 },
  { x: LANE_B, y: 1.0, z: 27.0, cp: 2 },
  { x: LANE_B, y: 1.0, z: 25.1, cp: 3 },
  { x: LANE_B, y: 1.0, z: 7.6, cp: 3 },
  { x: LANE_B, y: 0.95, z: 5.9, cp: 3 },
  { x: -3.3, y: 1.0, z: 0.4, cp: 3 },
];

/** The booth with the E prompt, between the two decks. */
export const BOOTH = { x: 0, z: -2.2, use: { x: 0, z: -4.6 } } as const;

/** Rough clear radius of the whole course around the course-frame point (0, 20). */
export const COURSE_RADIUS = 27;
export const COURSE_CENTRE = { x: 0, z: 20.5 } as const;

/**
 * Props that are solid but not stood on (both in a run and, as Rapier colliders, when walking
 * around): booth, arch pillars, blower stands with their barrels, bubble machine, rope-swing posts,
 * checkpoint flag poles and the pit rim. `bottom`/`top` are heights above the course ground.
 */
export interface PropDef {
  id: string;
  shape: 'box' | 'cyl';
  x: number;
  z: number;
  hx?: number;
  hz?: number;
  r?: number;
  bottom: number;
  top: number;
}

const RIM_T = 0.18;
/** Rim tube height (top of the inflatable): you can hop over it from outside, never walk through. */
export const RIM_TOP = FOAM_Y + 0.35;

export const PROPS: readonly PropDef[] = [
  { id: 'booth', shape: 'box', x: BOOTH.x, z: BOOTH.z, hx: 1.05, hz: 0.7, bottom: -1, top: 2.9 },
  { id: 'machine', shape: 'box', x: -6.7, z: -0.6, hx: 0.53, hz: 0.53, bottom: -1, top: 2.1 },
  { id: 'archA', shape: 'cyl', x: 5.75, z: 1.7, r: 0.45, bottom: -1, top: 4.7 },
  { id: 'archB', shape: 'cyl', x: -5.75, z: 1.7, r: 0.45, bottom: -1, top: 4.7 },
  ...CANNONS.map((c, i): PropDef => ({ id: `blower${i}`, shape: 'box', x: c.x - 0.1, z: c.z, hx: 0.55, hz: 0.6, bottom: -1, top: 1.6 })),
  { id: 'ropePostS', shape: 'cyl', x: ROPE.x, z: ROPE.z - 2.5, r: 0.22, bottom: -1, top: ROPE.y + 0.5 },
  { id: 'ropePostN', shape: 'cyl', x: ROPE.x, z: ROPE.z + 2.5, r: 0.22, bottom: -1, top: ROPE.y + 0.5 },
  { id: 'flag1', shape: 'cyl', x: 5.2, z: 20.8, r: 0.1, bottom: 2.0, top: 4.4 },
  { id: 'flag2', shape: 'cyl', x: 5.25, z: 42.7, r: 0.1, bottom: 2.3, top: 4.7 },
  { id: 'flag3', shape: 'cyl', x: -5.25, z: 26.9, r: 0.1, bottom: 1.0, top: 3.4 },
];

/** The pit rim as four walls (front piece between the decks only). Rapier colliders when walking. */
export const RIM_WALLS: readonly PropDef[] = [
  { id: 'rimA', shape: 'box', x: PIT.x1, z: (PIT.z0 + PIT.z1) / 2, hx: RIM_T, hz: (PIT.z1 - PIT.z0) / 2, bottom: -1, top: RIM_TOP },
  { id: 'rimB', shape: 'box', x: PIT.x0, z: (PIT.z0 + PIT.z1) / 2, hx: RIM_T, hz: (PIT.z1 - PIT.z0) / 2, bottom: -1, top: RIM_TOP },
  { id: 'rimN', shape: 'box', x: 0, z: PIT.z1, hx: (PIT.x1 - PIT.x0) / 2 + RIM_T, hz: RIM_T, bottom: -1, top: RIM_TOP },
  { id: 'rimF', shape: 'box', x: 0, z: PIT.z0, hx: 1.2, hz: RIM_T, bottom: -1, top: RIM_TOP },
];

/**
 * Where a run may take the hero (course frame): between the rim lines (x), from the entrance strip
 * in front of the booth (z0) to the far rim. Nobody wanders off onto the hill mid-run.
 */
export const RUN_BOUNDS = { z0: -5.4 } as const;
