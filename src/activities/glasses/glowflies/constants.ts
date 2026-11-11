/** Glow-flies tuning (site-local metres, seconds). */
import type { GlassesTier } from '../../../types';

export const FLIES = {
  /**
   * Flies in the air at once during a round: min..max (seeded). Few, high (a jump is needed) and
   * short-lived, so a blind sweep rarely reaches 3 catches in a round (see ./round.ts).
   */
  minCount: 3,
  maxCount: 3,
  /** The meadow (flowers) around the patch centre. */
  patchRadius: 5.1,
  /** Flies roam this far from the patch centre where the ground allows it… */
  roamRadius: 8.5,
  /** …and never farther than this from the site centre. */
  maxFromSite: 9,
  /** Keep every path this far (XZ) from the board and from the jar. */
  boardClear: 1.5,
  jarClear: 1.3,
  /** Keep every path this far (XZ) from the booth's marquee centre. */
  boothClear: 2.4,
  /** Flight height above the ground (the whole path stays inside). */
  minHeight: 1.9,
  maxHeight: 3.0,
  /** Catch distance from the hero's chest (metres). */
  catchRadius: 0.95,
  /** Player counts as "in the patch" within this distance of the patch centre. */
  insideRadius: 10,
  /** A fly that flies off counts as a miss only if the hero came this close (XZ) to it. */
  noticeRadius: 3,
  /** Respawn delay after a catch or a fly-off (seconds, seeded in this band). */
  respawnMin: 4,
  respawnMax: 6,
  /** Fly-off animation (rises and fades on the weak layer). */
  leaveSeconds: 1.3,
  /** Life before flying off, per tier. */
  life: { 1: 7, 2: 6, 3: 5 } as Record<GlassesTier, number>,
  /** Gems per catch, per tier. */
  gems: { 1: 1, 2: 2, 3: 3 } as Record<GlassesTier, number>,
  /** Base angular speed of the paths (rad/s); multiplied by the tier speed. */
  baseSpeed: 0.42,
  /** Fly glow quad size (metres) before the tier size. */
  size: 2.4,
  /** Quick catches within this many seconds raise the chime's pitch. */
  comboWindow: 4,
  /** Bursts kept at once and particles per burst. */
  maxBursts: 3,
  burstParticles: 9,
  burstSeconds: 0.8,
  /** Speed cap for the swept catch test (faster = a teleport: point test only). */
  maxSpeed: 40,
  slack: 0.5,
  /** Glow beads in the jar (one per catch of the round; full after 5). */
  jarNotches: 5,
} as const;
