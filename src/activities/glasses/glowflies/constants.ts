/** Glow-flies tuning (site-local metres, seconds). */
import type { GlassesTier } from '../../../types';

export const FLIES = {
  /** Flies in the air at once: min..max (seeded). */
  minCount: 5,
  maxCount: 7,
  /** The patch the flies stay inside (site-local circle around the centre). */
  patchRadius: 5.1,
  /** Keep every path this far (XZ) from the board and from the jar. */
  boardClear: 1.5,
  jarClear: 1.3,
  /** Flight height above the ground (the whole path stays inside). */
  minHeight: 0.8,
  maxHeight: 2.2,
  /** Catch distance from the hero's chest (metres). */
  catchRadius: 1.1,
  /** Player counts as "in the patch" within this distance of the centre (misses only count then). */
  insideRadius: 7,
  /** Respawn delay after a catch or a fly-off (seconds, seeded in this band). */
  respawnMin: 15,
  respawnMax: 20,
  /** Fly-off animation (rises and fades on the weak layer). */
  leaveSeconds: 1.3,
  /** Life before flying off, per tier. */
  life: { 1: 30, 2: 22, 3: 15 } as Record<GlassesTier, number>,
  /** Gems per catch, per tier. */
  gems: { 1: 1, 2: 2, 3: 4 } as Record<GlassesTier, number>,
  /** Base angular speed of the paths (rad/s); multiplied by the tier speed. */
  baseSpeed: 0.42,
  /** Fly glow quad size (metres) before the tier size. */
  size: 0.95,
  /** Quick catches within this many seconds raise the chime's pitch. */
  comboWindow: 4,
  /** Bursts kept at once and particles per burst. */
  maxBursts: 3,
  burstParticles: 9,
  burstSeconds: 0.8,
  /** Speed cap for the swept catch test (faster = a teleport: point test only). */
  maxSpeed: 40,
  slack: 0.5,
  /** Glow beads in the jar (one notch per catch; full after this many). */
  jarNotches: 12,
  /** Non-positional "something is near" chime: distance and minimum interval. */
  nearRadius: 3.2,
  nearInterval: 1.6,
} as const;
