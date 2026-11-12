/**
 * `bounce` (timeIt): a weak-eye perfect-bounce timing ring on the giant trampoline.
 *
 * While the hero falls in a trampoline flight (owner 'trampoline') with enough time left, a bold
 * ground-facing timing ring (`./boldRing.ts`: thick two-tone bands, a ticked target, nothing like
 * the mat's painted stripes) lies on the fall line to the landing spot, 3 m below the hero's feet
 * (so the high, downward-looking trampoline camera always has it on screen right under the hero,
 * never over the both-eye body), and settles onto the landing spot 0.3 m above the mat at the end.
 * Its closing band meets the target at a random moment between 20 % and 80 % of the fall
 * (`./logic.ts`).
 *
 * The attempt is exactly ONE press of Jump or Use before the last 0.35 s of the fall. When the
 * landing zone starts the fall is settled: one press in the window = hit (1 / 2 / 3 gems by tier,
 * a weak-eye star burst; three perfects in a row +3), one press outside it = miss. No press, a
 * press only in the landing zone (the ordinary landing press), two or more presses (mashing), or
 * a press during the rise (tapping: that fall gets no ring) give no result at all.
 *
 * Read-only on the trampoline: it reads the public Flight state (`getFlight`), never changes an
 * apex and never calls `flight.begin`. Hold-to-grow keeps working (press at the ring, keep holding
 * through the landing). Everything is on the WeakOnly layer; feedback only once the fall is
 * settled. Nothing is attached and `update` returns early while the hero is not on the trampoline.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GlassesTier } from '../../../../types';
import { createGlyphSprite, createRing, timingRadius, withChallenge } from '../../../../vision/toolkit';
import type { GlyphSpriteBlock, RingBlock } from '../../../../vision/toolkit';
import { timeToLand } from '../../../ballistics';
import { getFlight } from '../../../flight';
import type { WeaveEnv, WeavePart } from '../types';
import { createBoldRing } from './boldRing';
import type { BoldRingBlock } from './boldRing';
import { FallPresses, applyGrade, freshStreak, inLandingZone, planFall } from './logic';
import type { FallOutcome, FallPlan } from './logic';

/** Look of the ring (metres, before the tier size). */
const LOOK = {
  lift: 0.3,
  /** The ring rides this far below the hero's feet on the fall line. */
  below: 3,
  target: 1.6,
  start: 4.2,
  /** Band widths (m) before the tier size, and their floor (bold at every tier). */
  targetWidth: 0.45,
  closingWidth: 0.5,
  minWidth: 0.3,
  /** `t` at which the closing band meets the target (toolkit timing convention). */
  perfectAt: 0.8,
  missFade: 0.35,
  burstTime: 0.8,
  starRise: 0.2,
  starHeight: 1.1,
} as const;

interface Fall {
  plan: FallPlan;
  /** Seconds since the fall started (from the live flight). */
  at: number;
  /** Settled (the landing zone started): no more presses count. */
  decided: boolean;
  presses: FallPresses;
  /** Landing spot (fixed for the fall). */
  spot: THREE.Vector3;
}

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  const streak = freshStreak();
  let fall: Fall | null = null;
  let bold: BoldRingBlock | null = null;
  let ring: BoldRingBlock | null = null;
  let ringFade = 1;
  let ringFading = false;
  let burst: RingBlock | null = null;
  let star: GlyphSpriteBlock | null = null;
  let fxLeft = 0;
  const fxSpot = new THREE.Vector3();
  /** A Jump/Use press was seen during the current rise (tapping: the next fall does not count). */
  let risePress = false;
  /** This descent was already checked (planned or too short): one check per descent, never per frame. */
  let descentSeen = false;
  let wasOn = false;
  /** Test hook: perfect moment as a share of the allowed range (sticky until reset / null). */
  let forcedShare: number | null = null;
  /** Test hook: shift the ring sideways (to look at it over the grass beside the mat). */
  const lookOffset = new THREE.Vector3();
  let hits = 0;
  let misses = 0;
  let perfects = 0;
  let falls = 0;
  let skipped = 0;
  let mashed = 0;
  let lastGrade: FallOutcome['kind'] | null = null;

  const dropRing = (): void => {
    if (!ring) return;
    env.remove(ring.object);
    ring = null;
    ringFading = false;
  };

  const endFall = (): void => {
    dropRing();
    fall = null;
  };

  /** Where the ring is now: on the fall line `below` m under the feet, or on the landing spot. */
  const ringPos = (out: THREE.Vector3, spot: THREE.Vector3): THREE.Vector3 => {
    const f = getFlight(ctx);
    const p = ctx.player.position;
    const y = p.y - LOOK.below;
    if (y <= spot.y || f.vy > 0) return out.copy(spot);
    const tau = timeToLand(p.y, f.vy, y);
    return out.set(p.x + f.vx * tau, y, p.z + f.vz * tau);
  };

  /** Ring size by tier: smaller at higher tiers, never below 70 % (it stays bold). */
  const ringSize = (tier: GlassesTier): number => Math.max(0.7, withChallenge(tier, env.challenge()).size);

  const applyRing = (): void => {
    if (!ring || !fall) return;
    const pl = fall.plan;
    const s = ringSize(pl.tier);
    const t = Math.min(1, (fall.at / pl.perfect) * LOOK.perfectAt);
    ring.set({
      closing: Math.max(0.001, timingRadius(t, LOOK.target * s, LOOK.start * s, LOOK.perfectAt)),
      near: Math.abs(fall.at - pl.perfect) <= pl.half ? 1 : 0,
    });
  };

  const makeRing = (plan: FallPlan, spot: THREE.Vector3): void => {
    dropRing();
    const tp = withChallenge(plan.tier, env.challenge());
    const s = ringSize(plan.tier);
    if (!bold) {
      bold = createBoldRing({ maxRadius: LOOK.start, facing: 'ground' });
      bold.object.name = 'weave-bounce-ring';
    }
    const r = bold;
    r.set({
      target: LOOK.target * s,
      targetWidth: Math.max(LOOK.minWidth, LOOK.targetWidth * s),
      closingWidth: Math.max(LOOK.minWidth, LOOK.closingWidth * s),
      progress: 1,
      ticks: 8,
      rotation: 0,
      level: Math.max(0.85, tp.level),
      opacity: 1,
    });
    ringPos(r.object.position, spot);
    ring = r;
    ringFade = 1;
    ringFading = false;
    r.setFade(1);
    applyRing();
    env.add(r.object, VisionLayer.WeakOnly);
  };

  const startFall = (f: ReturnType<typeof getFlight>): void => {
    const p = ctx.player.position;
    const left = timeToLand(p.y, f.vy, f.endY);
    const u = env.rng();
    falls++;
    const plan = planFall(left, streak.tier, u, forcedShare);
    if (!plan || risePress) {
      if (plan) skipped++;
      risePress = false;
      return;
    }
    risePress = false;
    const spot = new THREE.Vector3(p.x + f.vx * left, f.endY + LOOK.lift, p.z + f.vz * left);
    fall = { plan, at: 0, decided: false, presses: new FallPresses(), spot };
    makeRing(plan, spot);
  };

  const ensureFx = (): { burst: RingBlock; star: GlyphSpriteBlock } => {
    if (!burst) {
      burst = createRing({ radius: 1, thickness: 0.24, segments: 10, segmentFill: 0.42, spin: 0.45, facing: 'ground' });
      burst.object.name = 'weave-bounce-burst';
    }
    if (!star) {
      star = createGlyphSprite({ text: '★', height: LOOK.starHeight, maxChars: 2 });
      star.object.name = 'weave-bounce-star';
    }
    return { burst, star };
  };

  const updateFx = (dt: number): void => {
    if (!burst || !star) return;
    fxLeft = Math.max(0, fxLeft - dt);
    const k = 1 - fxLeft / LOOK.burstTime; // 0 → 1
    burst.update(dt);
    burst.object.scale.setScalar(1.6 + 3.6 * (1 - (1 - k) ** 2));
    burst.setFade(Math.max(0, 1 - k) ** 0.7);
    burst.object.position.set(fxSpot.x, fxSpot.y + 0.02, fxSpot.z);
    star.object.position.set(fxSpot.x, fxSpot.y + LOOK.starRise, fxSpot.z);
    star.object.scale.setScalar(0.8 + 0.5 * Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5));
    star.setFade(k < 0.6 ? 1 : Math.max(0, (1 - k) / 0.4));
    if (fxLeft <= 0) {
      env.remove(burst.object);
      env.remove(star.object);
    }
  };

  const celebrate = (at: THREE.Vector3): void => {
    const fx = ensureFx();
    fxSpot.copy(at);
    fxLeft = LOOK.burstTime;
    updateFx(0);
    env.add(fx.burst.object, VisionLayer.WeakOnly);
    env.add(fx.star.object, VisionLayer.WeakOnly);
  };

  /** The landing zone started: settle the fall's presses into one result (or none). */
  const settle = (): void => {
    if (!fall) return;
    fall.decided = true;
    const g = fall.presses.settle(fall.plan);
    lastGrade = g.kind;
    if (g.kind === 'none' || g.kind === 'ignore') return;
    if (g.kind === 'mash') {
      mashed++;
      ringFading = true;
      return;
    }
    const tier: GlassesTier = fall.plan.tier;
    const gems = applyGrade(streak, g);
    env.result(tier, g.kind === 'hit');
    if (g.kind === 'hit') {
      hits++;
      if (g.perfect) perfects++;
      env.pay(gems);
      const at = ringPos(new THREE.Vector3(), fall.spot);
      dropRing();
      celebrate(at);
    } else {
      misses++;
      ringFading = true;
    }
  };

  const reset = (): void => {
    endFall();
    if (burst) env.remove(burst.object);
    if (star) env.remove(star.object);
    fxLeft = 0;
    Object.assign(streak, freshStreak());
    risePress = false;
    descentSeen = false;
    wasOn = false;
    forcedShare = null;
    lookOffset.set(0, 0, 0);
    hits = misses = perfects = falls = skipped = mashed = 0;
    lastGrade = null;
  };

  return {
    id: env.id,
    kind: env.kind,
    reset,
    update(dt) {
      const f = getFlight(ctx);
      const on = f.active && f.owner === 'trampoline';
      if (!on && !wasOn && !fall && fxLeft <= 0) return;
      if (fxLeft > 0) updateFx(dt);
      if (!on) {
        wasOn = false;
        risePress = false;
        descentSeen = false;
        if (fall) endFall();
        return;
      }
      wasOn = true;
      const inp = ctx.input.state;
      const pressed = inp.jumpPressed || inp.usePressed;
      if (f.vy > 0) {
        // Rising (or the dwell on the mat): a landing ends the fall.
        if (fall) endFall();
        descentSeen = false;
        if (pressed) risePress = true;
        return;
      }
      if (!fall) {
        if (descentSeen) return;
        descentSeen = true;
        startFall(f);
        if (!fall) return;
      }
      const p = ctx.player.position;
      fall.at = Math.max(0, fall.plan.fall - timeToLand(p.y, f.vy, f.endY));
      if (fxLeft > 0) ringPos(fxSpot, fall.spot);
      if (ring) {
        ringPos(ring.object.position, fall.spot);
        ring.object.position.x += lookOffset.x;
        ring.object.position.z += lookOffset.z;
        applyRing();
        if (ringFading) {
          ringFade = Math.max(0, ringFade - dt / LOOK.missFade);
          ring.setFade(ringFade);
          if (ringFade <= 0) dropRing();
        }
      }
      if (fall.decided) return;
      if (pressed) fall.presses.press(fall.plan, fall.at);
      if (inLandingZone(fall.plan, fall.at)) settle();
    },
    dispose() {
      reset();
      bold?.dispose();
      burst?.dispose();
      star?.dispose();
      bold = null;
      burst = null;
      star = null;
    },
    debug() {
      const f = getFlight(ctx);
      return {
        active: env.tracked().length > 0,
        onTrampoline: f.active && f.owner === 'trampoline',
        falling: fall !== null,
        ring: ring !== null,
        fall: fall?.plan.fall ?? null,
        at: fall?.at ?? null,
        perfect: fall?.plan.perfect ?? null,
        half: fall?.plan.half ?? null,
        decided: fall?.decided ?? null,
        presses: fall?.presses.presses ?? null,
        tier: streak.tier,
        hitsInRow: streak.hitsInRow,
        perfectsInRow: streak.perfectsInRow,
        hits,
        misses,
        perfects,
        mashed,
        falls,
        skipped,
        lastGrade,
        forcedShare,
        tracked: env.tracked().length,
      };
    },
    force(params) {
      if ('lookOffset' in params) {
        const o = params.lookOffset;
        if (Array.isArray(o) && typeof o[0] === 'number' && typeof o[1] === 'number') lookOffset.set(o[0], 0, o[1]);
        else lookOffset.set(0, 0, 0);
        if (ring && fall) {
          ringPos(ring.object.position, fall.spot);
          ring.object.position.x += lookOffset.x;
          ring.object.position.z += lookOffset.z;
        }
      }
      if (typeof params.tier === 'number') {
        const t = Math.round(params.tier);
        streak.tier = (t >= 3 ? 3 : t <= 1 ? 1 : 2) as GlassesTier;
        streak.hitsInRow = 0;
        if (fall && !fall.decided) {
          const re = planFall(fall.plan.fall, streak.tier, 0, forcedShare ?? 0.5);
          if (re) {
            fall.plan = re;
            if (ring) makeRing(re, fall.spot);
          }
        }
      }
      if ('perfectAt' in params) {
        const v = params.perfectAt;
        forcedShare = typeof v === 'number' ? Math.min(1, Math.max(0, v)) : null;
        if (fall && forcedShare !== null && !fall.decided) {
          const re = planFall(fall.plan.fall, fall.plan.tier, 0, forcedShare);
          if (re) {
            fall.plan = re;
            if (ring) applyRing();
          }
        }
      }
    },
    drawObjects: () => env.tracked(),
  };
}
