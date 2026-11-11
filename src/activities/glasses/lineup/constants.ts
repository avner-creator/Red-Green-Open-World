/** Line-up ("magic ring bubbles"): tuning (metres, seconds, degrees) and the booth. */
import type { BoothSpec, PrizeTable, RoundRules } from '../booth/types';

export const LINEUP = {
  /**
   * Start pad = aim pad, site-local (x right, z towards the approach); bubbles float towards −Z.
   * `radius` is the kit pad's radius (the hero counts as on it within radius + 0.2).
   */
  pad: { x: 0, z: -1.0, radius: 1.1 },
  bubble: {
    /** Bubble slots (tier 3 shows two at once, tiers 1–2 one). */
    slots: 2,
    /** Seconds a live bubble waits before it floats away (a ✗). */
    lifetime: 12,
    bob: 0.18,
    spawnIn: 0.6,
    popSeconds: 0.55,
    driftSeconds: 1.2,
    /** A bubble's radius is this fraction of the ring's (so a bubble inside the ring sits in it). */
    ofRing: 0.78,
  },
  /** Approximate extra distance from the camera to the pad (third-person camera behind the hero). */
  cameraBack: 5.1,
  /** Candidate spots relative to the pad: angles off straight ahead, distances, heights above the pad. */
  spots: {
    /** Angles (degrees; positive = to the child's LEFT). The booth's side keeps only up to `boothSideMax`. */
    angles: [-34, -17, 0, 17, 34],
    boothSideMax: 17,
    distances: [8, 10.5, 13],
    heights: [2.4, 3.3, 4.2],
    /** Free space needed behind a bubble along the sightline (no wall/tree right behind it). */
    behind: 5,
    /** Bubbles keep this far apart, as seen from the pad (degrees). */
    spacingDeg: 14,
    /** Ground must stay this far below a bubble. */
    clearance: 1.6,
  },
  /** Where the ✓ / ✗ pops: beside the hero on the pad (m to the side, height), never at a bubble. */
  popSide: 1.7,
  popY: 1.6,
} as const;

/**
 * Prize by pops out of 5 bubbles (tier 1, 2, 3): nothing below 3. Tuned against the real round
 * machine (tests/activities/glasses-lineup.test.ts): a blind player earns well under 1 gem a
 * minute, a child who sees the ring ≥ 25 a minute at tier 1.
 */
export const LINEUP_PRIZE: PrizeTable = {
  1: [0, 0, 0, 5, 9, 14],
  2: [0, 0, 0, 6, 10, 16],
  3: [0, 0, 0, 6, 11, 18],
};

export const LINEUP_RULES: RoundRules = {
  tries: 5,
  minHits: 3,
  prize: LINEUP_PRIZE,
  between: 'next',
  beat: 0.7,
  // Up after 4 or 5 pops, down after 2 or fewer.
  upAt: 4,
  downBelow: 3,
};

/**
 * The booth beside the pad, a little ahead of it, turned to face the camera behind the hero on
 * the pad (so its lamps are in view while aiming). `side` −1 = on the child's left, +1 = right.
 */
export function lineupBooth(side: -1 | 1): BoothSpec {
  const mx = 3.4 * side;
  const mz = -3.0;
  const camZ = LINEUP.pad.z + LINEUP.cameraBack;
  return {
    marquee: { x: mx, z: mz, yaw: Math.atan2(LINEUP.pad.x - mx, camZ - mz) },
    lamps: LINEUP_RULES.tries,
    pad: { x: LINEUP.pad.x, z: LINEUP.pad.z, r: LINEUP.pad.radius, walkIn: true },
    // During play the prompt quad shows the device's button (E / X / tap): see `index.ts`.
    // The prompt is the Use button of the device in use (key E, gamepad X, a tapping hand).
    playPrompt: 'button',
    decals: [
      // Footprints and chevrons from the approach onto the pad.
      { kind: 'chevron', x: 0, z: LINEUP.pad.z + 2.3, size: 0.9, yaw: 0 },
      { kind: 'chevron', x: 0, z: LINEUP.pad.z + 3.5, size: 0.9, yaw: 0 },
    ],
  };
}
