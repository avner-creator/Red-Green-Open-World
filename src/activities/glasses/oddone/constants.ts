/** Odd one out pedestals: tuning (metres, seconds). */
export const ODD = {
  /** Pedestal centres in site-local metres (x right, z towards the approach): a gentle arc. */
  pedestals: [
    [-2.6, -2.2],
    [0, -3.0],
    [2.6, -2.2],
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
  /** Seconds of feedback after an answer before the next round. */
  feedbackSeconds: 1.6,
  /** Fade-in of a new round's shapes. */
  fadeInSeconds: 0.35,
  /** Staircase top (levels 0..maxLevel). */
  maxLevel: 7,
  /** Shape size (outer, metres) from level 2 down to the floor at maxLevel. */
  size: { base: 1.0, floor: 0.75 },
  /** Ring gap (metres) from level 2 down to the floor at maxLevel. */
  gap: { base: 0.3, floor: 0.11 },
  /** The challenge's size scale never shrinks the shapes below this factor (keeps them solvable). */
  minChallengeSize: 0.8,
  /** Gems per tier. */
  gems: { 1: 2, 2: 3, 3: 5 } as const,
} as const;
