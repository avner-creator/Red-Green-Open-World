/**
 * "Auto challenge" numbers (grown-up option, off by default). A gentle per-session staircase:
 * a run of hits makes weak-eye objects a little fainter / smaller and the other eye's picture a
 * little dimmer; a miss or a long dry spell steps back. Always within the calibrated values.
 */
export const CHALLENGE = {
  /** Highest staircase step (level 0 = exactly the calibrated picture). */
  maxLevel: 6,
  /** Hits in a row that make it one step harder. */
  hitsToStepUp: 3,
  /** Playing seconds without a hit before it quietly steps one easier. */
  droughtSeconds: 40,
  /** Per level: weakScale = 1 − weakPerLevel·level (floor 0.58 at level 6). */
  weakPerLevel: 0.07,
  /** Per level: strongScale = 1 − strongPerLevel·level (floor 0.70). */
  strongPerLevel: 0.05,
  /** Per level: sizeScale = 1 − sizePerLevel·level (floor 0.76). */
  sizePerLevel: 0.04,
  /** Seconds the applied scales take to glide one step (nothing pops). */
  easeSeconds: 2,
  /** Largest playing-time jump taken from one `session:tick` (timer skips don't count as play). */
  maxTickDelta: 1,
} as const;

