/** Half-symbol gates: layout (site-local metres; +Z = the approach) and tuning. */
import type { BoothSpec, PrizeTable, RoundRules } from '../booth/types';

export const GATES = {
  /** Arch centres along X, all on the plane z = archZ. */
  archX: [-3.1, 0, 3.1] as const,
  archZ: -2.6,
  /** Opening half width, outer half width, straight height of the inner sides, depth. */
  innerHalf: 0.95,
  outerHalf: 1.3,
  straight: 1.5,
  depth: 0.5,
  /** Posts reach this far below the arch's ground (slopes). */
  sink: 0.7,
  /** Feet must be below this height above the arch's ground for a crossing to count (jumps count). */
  passHeight: 2.2,
  /** Symbol plaque on top of each arch (edge, centre height). */
  plaque: 1.2,
  plaqueY: 4.2,
  /** Finish ribbon across each opening (bottom height above the arch's ground, height). */
  ribbonY: 1.98,
  ribbonH: 0.3,
  /** The half-symbol sign: a lectern between the pad and the arches, facing the pad; its panel
   *  sits above the hero's head in the default camera view from the pad, and below the arch
   *  plaques behind it. */
  signZ: 0.1,
  signY: 2.2,
  signTilt: 0.15,
  signPanel: 1.56,
  signFrame: 1.8,
  /** Half-symbol height on the sign at tier 1 (× the tier size). */
  halfSize: 1.3,
  /** Start pad (centre z, radius): a walk-in pad, the hero runs from here to the arches. */
  padZ: 2.0,
  padR: 0.95,
  /** Celebration lengths of an arch (s). */
  squash: 0.9,
  wobble: 0.8,
} as const;

/**
 * Prize by hits out of 3 runs (tier 1, 2, 3): nothing below 2 hits, a big jump for 3 of 3.
 * Tuned with `booth/sim.ts` (tests/activities/glasses-booth-round.test.ts): a random-guess bot
 * earns ~4 gems a minute, a child who sees both halves ~30+.
 */
export const GATE_PRIZE: PrizeTable = {
  1: [0, 0, 3, 10],
  2: [0, 0, 4, 12],
  3: [0, 0, 5, 15],
};

export const GATE_RULES: RoundRules = {
  tries: 3,
  minHits: 2,
  prize: GATE_PRIZE,
  between: 'pad',
  beat: 0.9,
};

/** The booth beside the pad: front-left of the arches, turned to face the pad's camera. */
export const GATE_BOOTH: BoothSpec = {
  marquee: { x: -5.0, z: -0.2, yaw: 0.6 },
  lamps: 3,
  pad: { x: 0, z: GATES.padZ, r: GATES.padR, walkIn: true },
  // At rest the "step on the pad" prompt floats on the (empty) sign, right behind the pad.
  prompt: { x: 0, y: GATES.signY, z: GATES.signZ + 0.45 },
  playPrompt: 'arch',
  countdown: { x: 0, y: GATES.signY, z: GATES.signZ + 0.6 },
  decals: [
    // Chevrons on the ground from the pad to each arch (the middle path goes round the sign).
    ...[-1, 1].flatMap((sx) => [0.32, 0.6].map((t) => {
      const x = sx * 3.1 * t;
      const z = GATES.padZ + (GATES.archZ + 0.6 - GATES.padZ) * t;
      return { kind: 'chevron' as const, x, z, size: 1.0, yaw: Math.atan2(-sx * 3.1, GATES.padZ - GATES.archZ - 0.6) };
    })),
    { kind: 'chevron', x: 0, z: -1.45, size: 1.0, yaw: 0 },
  ],
};
