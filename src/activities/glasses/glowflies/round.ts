/**
 * Glow-fly rounds on the booth kit (pure; the mechanic and the unit-test simulation share it).
 *
 * A round is TIMED (the kit's `RoundRules.time`): after 3-2-1-GO the flies come out and the child
 * has `FLY_ROUND.time` seconds to catch `tries` (= 5) of them; every catch lights the next lamp.
 * When the time runs out the round ends QUIETLY with the catches so far: no lamp and no
 * `glasses:result` for the catches never made (nothing is reported for flies the child never came
 * near). The prize needs 3 catches.
 */
import { MARQUEE, PAD_TOP } from '../booth/geometry';
import type { BoothSpec, PrizeTable, RoundRules, V3 } from '../booth/types';
import { pickPromptSpot } from '../booth/view';

export const FLY_ROUND = {
  /**
   * Seconds to catch 5 flies (from GO). With 3 flies in the air, high enough to need a jump, a
   * blind lawn-mower reaches 3 catches in < 15 % of rounds, a seeing child in > 90 %.
   */
  time: 30,
  /** The last seconds tick (sound) and the unlit lamps blink faster and faster. */
  hurry: 10,
  /** Blink rate of the unlit lamps: Hz at the start of the round and at the end. */
  blinkSlow: 0.6,
  blinkFast: 5,
} as const;

/**
 * Prize by catches out of 5 (tier 1, 2, 3): nothing below 3. Tuned with the round simulation in
 * tests/activities/glasses-glowflies-sim.test.ts: a blind lawn-mower earns ≪ 6 gems a minute, a
 * child who sees the flies ≥ 25 at tier 1.
 */
export const FLY_PRIZE: PrizeTable = {
  1: [0, 0, 0, 4, 7, 11],
  2: [0, 0, 0, 5, 8, 13],
  3: [0, 0, 0, 5, 9, 16],
};

export const FLY_RULES: RoundRules = {
  tries: 5,
  minHits: 3,
  prize: FLY_PRIZE,
  between: 'next',
  // One timed play phase: every catch lights the next lamp; the round ends at 5 or when time is up.
  time: FLY_ROUND.time,
  // Up after all 5, down below 3 (the kit's defaults, spelled out).
  upAt: 5,
  downBelow: 3,
};

/** Seconds left → blink phase of the unlit lamps (true = lit). Faster as time runs out. */
export function blinkOn(left: number, elapsed: number): boolean {
  const k = Math.max(0, Math.min(1, 1 - left / FLY_ROUND.time));
  // Rate rises with the square of the elapsed share: calm at first, frantic at the end.
  const hz = FLY_ROUND.blinkSlow + (FLY_ROUND.blinkFast - FLY_ROUND.blinkSlow) * k * k;
  // Integrated phase of a linearly-rising rate is awkward for a pure function; a phase built
  // from `elapsed` × the current rate is fine for a blink.
  return Math.sin(elapsed * hz * Math.PI * 2) > -0.2;
}

/** The patch's layout frame: the hero's start pad at the meadow's edge on the approach side. */
export const FLY_PAD = { x: 0, z: 5.0, r: 1.0 } as const;

/**
 * The booth: on the child's left of the pad, a step towards the meadow, turned to face the camera
 * behind the hero on the pad (layout-local; the patch centre is the origin).
 */
export const FLY_BOOTH: BoothSpec = {
  marquee: { x: -3.3, z: 3.2, yaw: Math.atan2(3.3, FLY_PAD.z + 5.1 - 3.2) },
  lamps: FLY_RULES.tries,
  pad: { x: FLY_PAD.x, z: FLY_PAD.z, r: FLY_PAD.r, walkIn: true },
  playPrompt: 'catch',
  decals: [
    { kind: 'chevron', x: 0, z: FLY_PAD.z - 1.9, size: 0.9, yaw: 0 },
    { kind: 'chevron', x: 0, z: FLY_PAD.z - 3.0, size: 0.9, yaw: 0 },
  ],
};

/** Layout-local points that must stay inside the site on clear land: the marquee and the pad. */
export function flyBoothFootprint(): { x: number; z: number }[] {
  const m = FLY_BOOTH.marquee;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const pt = (lx: number, lz: number): { x: number; z: number } => ({ x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c });
  return [pt(0, -0.3), pt(-1.6, 0.1), pt(1.6, 0.1), pt(-1.6, -0.6), pt(1.6, -0.6), { x: FLY_PAD.x, z: FLY_PAD.z + FLY_PAD.r }, { x: FLY_PAD.x - FLY_PAD.r, z: FLY_PAD.z }, { x: FLY_PAD.x + FLY_PAD.r, z: FLY_PAD.z }];
}

/** The marquee's centre (layout-local): flies keep `FLIES.boothClear` from it. */
export function flyBoothCentre(): { x: number; z: number } {
  return flyBoothFootprint()[0];
}

/** Layout-local points that must be in clear view from where children arrive: lamps, banner, board, pad. */
export function flyArrivalTargets(): { x: number; z: number; y: number }[] {
  const m = FLY_BOOTH.marquee;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const mq = (lx: number, lz: number): { x: number; z: number } => ({ x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c });
  return [
    { ...mq(0, 0.2), y: MARQUEE.lampY },
    { ...mq(0, 0.2), y: MARQUEE.bannerY },
    { ...mq(0.8, 0.2), y: MARQUEE.boardY },
    { x: FLY_PAD.x, z: FLY_PAD.z, y: 0.5 },
  ];
}

/** Edge of the play prompt ("catch!") (m). */
export const FLY_PROMPT_SIZE = 1.3;

/**
 * Where the play prompt floats: beside the booth, between it and the pad, in the pad camera's
 * central safe area and off the hero (`booth/view.ts`). `ground(x, z)`: ground height under a
 * layout-local point relative to the site's y. Never depends on the flies.
 */
export function flyPrompt(ground: (x: number, z: number) => number): { at: V3; fits: boolean } {
  const pad = { x: FLY_PAD.x, y: ground(FLY_PAD.x, FLY_PAD.z) + PAD_TOP, z: FLY_PAD.z };
  // In front of the booth's picture board (the marquee's own frame: +z towards its front), towards
  // the pad: never inside the booth, never over the meadow where the flies are.
  const m = FLY_BOOTH.marquee;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const cands: V3[] = [];
  for (const lz of [1.0, 1.5, 0.7]) {
    for (const lx of [0.9, 0.5, 1.3, 0.1]) {
      for (const h of [1.9, 2.3, 1.6, 2.7]) {
        const x = m.x + lx * c + lz * s;
        const z = m.z - lx * s + lz * c;
        cands.push({ x, y: ground(x, z) + h, z });
      }
    }
  }
  return pickPromptSpot(cands, { pad, look: { x: 0, z: 0 }, size: FLY_PROMPT_SIZE + 0.3 });
}
