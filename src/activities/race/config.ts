/** Race constants (stream N). Kept here so the logic and the tests share them. */
import type { RivalTuning } from './ai';

export const RACE = {
  laps: 3,
  /** Seconds of the 3-2-1 countdown. */
  countdown: 3,
  /** The race ends this long after the start whatever happens (nobody gets stuck in it). */
  maxSeconds: 150,
  /** …or this long after both friends finished. */
  afterFriends: 25,
  /** Boost pad: extra top speed (m/s), seconds, kick (m/s). */
  pad: { extra: 5, seconds: 1.1, kick: 3 },
  /** Three in a row: the rocket surge. */
  surge: { extra: 9, seconds: 2.4, kick: 5 },
  /** Pad trigger half-size: along the road and across it, metres. */
  padHalf: { along: 2.2, across: 1.9 },
  /** Checkpoint arches every lap (the start/finish gantry is number 0). */
  checkpoints: 5,
  /** Seconds on the podium before the result card. */
  podiumSeconds: 4,
  /** Nothing updates when idle and the player is further than this. */
  wakeDistance: 140,
} as const;

/** Two friends; `aim` < 0 means they like to sit just behind the player (beatable). */
export const RIVALS: readonly (RivalTuning & { paint: number })[] = [
  { cruise: 12.5, aim: -5, lane: 1.8, oopsAt: 150, paint: 0x2b3a67 },
  { cruise: 12, aim: -10, lane: -1.8, oopsAt: 70, paint: 0xf1f3f6 },
];

/** Grid: [lap distance behind the line, lateral] for player, friend 1, friend 2. */
export const GRID: readonly (readonly [number, number])[] = [
  [-5, -1.6],
  [-5, 1.8],
  [-11.5, 0],
];
