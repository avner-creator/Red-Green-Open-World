/**
 * `bounce` (timeIt): a weak-eye perfect-bounce timing ring on the giant trampoline.
 *
 * While the hero falls in a trampoline flight (owner 'trampoline') with enough time left, a
 * ground-facing timing ring lies on the fall line to the landing spot, 3 m below the hero's feet
 * (so the high, downward-looking trampoline camera always has it on screen right under the hero,
 * never over the both-eye body), and settles onto the landing spot 0.3 m above the mat at the end.
 * It closes onto its target at a random moment between 35 % and 75 % of the fall (`./logic.ts`). One press of Jump or
 * Use per fall is the attempt: in the window = hit (1 / 2 / 3 gems by tier, a weak-eye star burst;
 * three perfects in a row +3), outside it = miss. A press in the last 0.35 s is the ordinary landing
 * press and never counts; holding Jump from before the fall makes no press; a press during the
 * rise means the child is tapping, so that fall gets no ring and no result.
 *
 * Read-only on the trampoline: it reads the public Flight state (`getFlight`), never changes an
 * apex and never calls `flight.begin`. Hold-to-grow keeps working (press at the ring, keep holding
 * through the landing). Everything is on the WeakOnly layer; feedback after the press only.
 * Nothing is attached and `update` returns early while the hero is not on the trampoline.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GlassesTier } from '../../../../types';
import { createGlyphSprite, createRing, createTimingRing, withChallenge } from '../../../../vision/toolkit';
import type { GlyphSpriteBlock, RingBlock, TimingRingBlock } from '../../../../vision/toolkit';
import { timeToLand } from '../../../ballistics';
import { getFlight } from '../../../flight';
import type { WeaveEnv, WeavePart } from '../types';
import { applyGrade, freshStreak, gradePress, planFall } from './logic';
import type { FallPlan, PressGrade } from './logic';

/** Look of the ring (metres, before the tier size). */
const LOOK = {
  lift: 0.3,
  /** The ring rides this far below the hero's feet on the fall line. */
  below: 3,
  target: 1.5,
  start: 4.2,
  thickness: 0.3,
  /** `t` at which the closing ring meets the target (toolkit convention). */
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
  decided: boolean;
  /** Landing spot (fixed for the fall). */
  spot: THREE.Vector3;
}

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  const streak = freshStreak();
  let fall: Fall | null = null;
  let ring: TimingRingBlock | null = null;
  let ringFade = 1;
  let ringFading = false;
  let burst: RingBlock | null = null;
  let star: GlyphSpriteBlock | null = null;
  let fxLeft = 0;
  const fxSpot = new THREE.Vector3();
  /** A Jump/Use press was seen during the current rise (tapping: the next fall does not count). */
  let risePress = false;
  let wasOn = false;
  /** Test hook: perfect moment as a share of the allowed range (sticky until reset / null). */
  let forcedShare: number | null = null;
  let hits = 0;
  let misses = 0;
  let perfects = 0;
  let falls = 0;
  let skipped = 0;
  let lastGrade: PressGrade['kind'] | null = null;

  const dropRing = (): void => {
    if (!ring) return;
    env.remove(ring.object);
    ring.dispose();
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

  const applyRing = (): void => {
    if (!ring || !fall) return;
    ring.setT(Math.min(1, (fall.at / fall.plan.perfect) * LOOK.perfectAt));
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
    fall = { plan, at: 0, decided: false, spot };
    makeRing(plan, spot);
  };

  const makeRing = (plan: FallPlan, spot: THREE.Vector3): void => {
    dropRing();
    const tp = withChallenge(plan.tier, env.challenge());
    const s = tp.size;
    // The toolkit "near" highlight marks the whole hit window (in t units of the closing ring).
    const nearT = (plan.half / plan.perfect) * LOOK.perfectAt;
    const r = createTimingRing({
      radius: LOOK.target * s,
      startRadius: LOOK.start * s,
      thickness: Math.max(0.16, LOOK.thickness * s),
      perfectAt: LOOK.perfectAt,
      perfect: nearT,
      good: nearT,
      targetAlpha: 0.6,
      level: tp.level,
      opacity: tp.opacity,
      facing: 'ground',
    });
    r.object.name = 'weave-bounce-ring';
    ringPos(r.object.position, spot);
    ring = r;
    ringFade = 1;
    ringFading = false;
    r.setFade(1);
    applyRing();
    env.add(r.object, VisionLayer.WeakOnly);
  };

  const ensureFx = (): { burst: RingBlock; star: GlyphSpriteBlock } => {
    if (!burst) {
      burst = createRing({ radius: 1, thickness: 0.2, segments: 10, segmentFill: 0.42, spin: 0.45, facing: 'ground' });
      burst.object.name = 'weave-bounce-burst';
    }
    if (!star) {
      star = createGlyphSprite({ text: '★', height: LOOK.starHeight, maxChars: 2 });
      star.object.name = 'weave-bounce-star';
    }
    return { burst, star };
  };

  const celebrate = (at: THREE.Vector3): void => {
    const fx = ensureFx();
    fxSpot.copy(at);
    fxLeft = LOOK.burstTime;
    fx.burst.object.position.copy(at).y += 0.02;
    fx.star.object.position.copy(at).y += LOOK.starRise;
    updateFx(0);
    env.add(fx.burst.object, VisionLayer.WeakOnly);
    env.add(fx.star.object, VisionLayer.WeakOnly);
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

  const press = (g: PressGrade): void => {
    if (!fall) return;
    fall.decided = true;
    lastGrade = g.kind;
    if (g.kind === 'ignore') return;
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
    wasOn = false;
    forcedShare = null;
    hits = misses = perfects = falls = skipped = 0;
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
        if (fall) endFall();
        return;
      }
      wasOn = true;
      const inp = ctx.input.state;
      const pressed = inp.jumpPressed || inp.usePressed;
      if (f.vy > 0) {
        // Rising (or the dwell on the mat): a landing ends the fall.
        if (fall) endFall();
        if (pressed) risePress = true;
        return;
      }
      if (!fall) {
        startFall(f);
        if (!fall) return;
      }
      const p = ctx.player.position;
      fall.at = Math.max(0, fall.plan.fall - timeToLand(p.y, f.vy, f.endY));
      if (fxLeft > 0) ringPos(fxSpot, fall.spot);
      if (ring) {
        ringPos(ring.object.position, fall.spot);
        applyRing();
        ring.update(dt);
        if (ringFading) {
          ringFade = Math.max(0, ringFade - dt / LOOK.missFade);
          ring.setFade(ringFade);
          if (ringFade <= 0) dropRing();
        }
      }
      if (pressed && !fall.decided) press(gradePress(fall.plan, fall.at));
    },
    dispose() {
      reset();
      ring?.dispose();
      burst?.dispose();
      star?.dispose();
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
        tier: streak.tier,
        hitsInRow: streak.hitsInRow,
        perfectsInRow: streak.perfectsInRow,
        hits,
        misses,
        perfects,
        falls,
        skipped,
        lastGrade,
        forcedShare,
        tracked: env.tracked().length,
      };
    },
    force(params) {
      if ('perfectAt' in params) {
        const v = params.perfectAt;
        forcedShare = typeof v === 'number' ? Math.min(1, Math.max(0, v)) : null;
        if (fall && forcedShare !== null) {
          const re = planFall(fall.plan.fall, fall.plan.tier, 0, forcedShare);
          if (re) {
            fall.plan = re;
            if (ring && !fall.decided) makeRing(re, fall.spot);
          }
        }
      }
      if (typeof params.tier === 'number') {
        const t = Math.round(params.tier);
        streak.tier = (t >= 3 ? 3 : t <= 1 ? 1 : 2) as GlassesTier;
        streak.hitsInRow = 0;
      }
    },
    drawObjects: () => env.tracked(),
  };
}
