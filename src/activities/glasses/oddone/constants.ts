/** Odd one out booth: layout (layout-local metres; +Z = the approach) and tuning (seconds). */
import type { BoothSpec, PrizeTable, RoundRules } from '../booth/types';

export const ODD = {
  /**
   * Pedestal centres (x right, z towards the approach): a gentle arc right of centre, so the booth
   * fits on the left inside the site circle and stays in the default camera's view from the pad.
   */
  pedestals: [
    [-1.5, -3.2],
    [0.9, -3.9],
    [3.3, -3.2],
  ] as readonly (readonly [number, number])[],
  /** Height of the panel centre (and its weak-eye shape) above each pedestal's ground. */
  shapeHeight: 2.5,
  /** Dark both-eye panel behind each shape (identical on all three): radius, rim, thickness, backward tilt. */
  panelRadius: 0.7,
  rimRadius: 0.8,
  panelDepth: 0.08,
  panelTilt: 0.16,
  poleRadius: 0.07,
  /** The shape sits this far in front of the panel face. */
  shapeLift: 0.05,
  /** Pedestal parts (heights above the ground). */
  baseHeight: 0.18,
  baseSize: 1.2,
  columnRadius: 0.42,
  capBottom: 0.96,
  capHeight: 0.12,
  capRadius: 0.56,
  buttonRadius: 0.3,
  buttonHeight: 0.13,
  /** E prompt: radius around the button. */
  promptRadius: 1.5,
  /** Fade-in of a new try's shapes. */
  fadeInSeconds: 0.35,
  /** The weak-eye shapes fade out over the end of the beat after an answer. */
  fadeOutSeconds: 0.3,
  /** Staircase top (levels 0..maxLevel). */
  maxLevel: 7,
  /** Shape size (outer, metres) from level 2 down to the floor at maxLevel. */
  size: { base: 1.0, floor: 0.75 },
  /** Ring gap (metres) from level 2 down to the floor at maxLevel. */
  gap: { base: 0.3, floor: 0.11 },
  /** The challenge's size scale never shrinks the shapes below this factor (keeps them solvable). */
  minChallengeSize: 0.8,
  /** Hero spot in front of each button (metres from the pedestal, towards the approach). */
  standOff: 1.1,
  /** Start pad (a press pad: stand on it and press Use) in front of the middle pedestal. */
  pad: { x: 0.9, z: -1.2, r: 0.9 },
  /** Idle look of the three panels (weak eye only): the same soft circle on all three. */
  idleFade: 0.5,
  /** Edge of the play prompt (the device's Use button) floating beside the pedestals (m). */
  promptSize: 1.0,
} as const;

/**
 * Prize by hits out of 5 (tier 1, 2, 3): nothing below 3 right, 5 of 5 is the jackpot. Tuned with
 * `simulateOddOne` (./logic.ts) against the real round machine and the staircase
 * (tests/activities/glasses-oddone.test.ts): a random-guess bot ≤ 6 gems a minute at every tier,
 * a child who sees the shapes ≥ 25.
 */
export const ODD_PRIZE: PrizeTable = {
  1: [0, 0, 0, 4, 6, 12],
  2: [0, 0, 0, 4, 7, 14],
  3: [0, 0, 0, 5, 8, 16],
};

/** 5 tries a round, one straight after the other (the child stays at the buttons). */
export const ODD_RULES: RoundRules = {
  tries: 5,
  minHits: 3,
  prize: ODD_PRIZE,
  between: 'next',
  beat: 1.2,
};

/**
 * The booth on the left of the pedestals, turned to face the pad's camera and the approach.
 * Heights are relative to the site's y (index.ts lifts them onto the ground under the pad).
 */
export const ODD_BOOTH: BoothSpec = {
  marquee: { x: -3.7, z: -2.3, yaw: 0.6 },
  lamps: 5,
  pad: { x: ODD.pad.x, z: ODD.pad.z, r: ODD.pad.r, walkIn: false },
  playPrompt: 'button',
  // 3-2-1-GO pops in front of the middle panel, where the shapes are about to appear.
  countdown: { x: ODD.pedestals[1][0], y: ODD.shapeHeight, z: ODD.pedestals[1][1] + 0.8 },
  decals: [
    // Chevrons from the pad towards the three buttons.
    { kind: 'chevron', x: ODD.pad.x, z: ODD.pad.z - 1.3, size: 0.8, yaw: 0 },
    { kind: 'chevron', x: ODD.pad.x - 1.25, z: ODD.pad.z - 1.0, size: 0.7, yaw: 0.9 },
    { kind: 'chevron', x: ODD.pad.x + 1.25, z: ODD.pad.z - 1.0, size: 0.7, yaw: -0.9 },
  ],
};
