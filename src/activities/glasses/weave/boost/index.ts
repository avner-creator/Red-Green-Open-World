/**
 * Glasses weave part `boost`: a weak-eye beat on the buggy race's boost pads (timeIt).
 *
 * While the race is on, the next pad ahead (within 40 m) carries a weak-eye arch across the road
 * (an upright ring whose lower half the road hides, legs beside the buggy in the chase view): a
 * closing ring that shrinks onto a target ring with a steady 1.2 s beat. The target ring flares
 * bright and thick only in its "hot" window. Driving over the pad while it is hot is a turbo pad:
 * +1 / 2 / 3 gems by tier and a weak-eye flash on the layer. Driving over it cold is a miss. Pads
 * the child never touches give no result. Each pad's beat phase is random (`env.rng`), so it
 * cannot be learned; the window narrows by tier (two hits in a row raise it, a miss lowers it).
 *
 * The race itself never changes: the pad boost, the surge after three pads, rivals and prizes are
 * the race's own, and this part only reads `getRaceView` (pad hits are the race's `padsHit`; the
 * pad hit is the one nearest the buggy). Nothing goes into the both-eye scene or the HUD; the only
 * both-eye feedback is the `env.pay` toast and chime after a turbo pad.
 *
 * Active only while `phase === 'racing'`; otherwise nothing is attached and `update` returns at
 * once. At most 2 draws (the beat hoop and the flash).
 */
import type * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GlassesTier, VehicleApi } from '../../../../types';
import { createRing, createTimingRing, withChallenge } from '../../../../vision/toolkit';
import type { RingBlock, TimingRingBlock } from '../../../../vision/toolkit';
import { getRaceView } from '../../../race';
import type { RaceView } from '../../../race';
import { RACE } from '../../../race/config';
import type { WeaveEnv, WeavePart } from '../types';
import { BOOST, cycleAt, halfWindowT, isHot, judge, lapDelta, luckRate, nearestPad, nextPad, offsetFor, showFade, stepTier } from './logic';
import type { Outcome } from './logic';

type Pad = RaceView['pads'][number];

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;

  // ── state ──
  let active = false;
  let clock = 0;
  let tier: GlassesTier = 1;
  let streak = 0;
  let lastPadsHit = 0;
  let target = -1;
  let offset = 0;
  let seen = 0;
  /** The pad crossed last: skipped as "next" until it is behind (or a lap away). */
  let done = -1;
  let flashT = -1;
  let flashPad: Pad | null = null;
  let hits = 0;
  let misses = 0;
  let last: { pad: number; t: number; outcome: Outcome } | null = null;
  let ahead = Infinity;
  let fade = 0;

  // ── objects (built lazily at the first race) ──
  let ring: TimingRingBlock | null = null;
  let ringTier: GlassesTier | 0 = 0;
  let flash: RingBlock | null = null;

  const isAttached = (o: THREE.Object3D | null | undefined): boolean => !!o && env.tracked().includes(o);
  const attach = (o: THREE.Object3D): void => {
    if (!isAttached(o)) env.add(o, VisionLayer.WeakOnly);
  };
  const detach = (o: THREE.Object3D | null | undefined): void => {
    if (o) env.remove(o);
  };

  function ensureRing(): TimingRingBlock {
    if (ring && ringTier === tier) return ring;
    const was = isAttached(ring?.object);
    if (ring) {
      detach(ring.object);
      ring.dispose();
    }
    const p = withChallenge(tier, env.challenge());
    const half = halfWindowT(tier);
    ring = createTimingRing({
      radius: BOOST.ringRadius,
      startRadius: BOOST.ringStart,
      thickness: BOOST.ringThickness,
      perfectAt: BOOST.perfectAt,
      perfect: half,
      good: half,
      targetAlpha: 0.3,
      level: p.level,
      opacity: p.opacity,
      facing: 'wall',
    });
    ring.object.name = 'boostBeat';
    ringTier = tier;
    if (was) attach(ring.object);
    return ring;
  }

  function ensureFlash(): RingBlock {
    if (!flash) {
      flash = createRing({ radius: BOOST.ringRadius, thickness: 0.6, segments: 10, segmentFill: 0.55, spin: 0.9, facing: 'wall' });
      flash.object.name = 'boostFlash';
    }
    return flash;
  }

  function deactivate(): void {
    for (const o of env.tracked()) env.remove(o);
    active = false;
    target = -1;
    done = -1;
    seen = 0;
    flashT = -1;
    flashPad = null;
    ahead = Infinity;
    fade = 0;
  }

  const car = (): VehicleApi | undefined => ctx.vehicles.all.find((v) => v.kind === 'car');
  const scale = (): number => Math.max(0.8, withChallenge(tier, env.challenge()).size);

  /** Pick the next pad ahead (a new pad gets a fresh random beat phase). */
  function retarget(view: RaceView): void {
    const pads = view.pads;
    const prog = view.progress;
    const L = view.length;
    // The pad just crossed stays "done" until it is behind or far ahead (next lap).
    if (done >= 0 && pads[done]) {
      const d = lapDelta(prog, pads[done].s, L);
      if (d < -BOOST.passedBehind || d > 10) done = -1;
    }
    const usable = done >= 0 ? pads.map((p, i) => (i === done ? { s: p.s + L / 2 } : p)) : pads;
    const n = nextPad(usable, prog, L);
    ahead = n.index >= 0 ? lapDelta(prog, pads[n.index].s, L) : Infinity;
    if (n.index !== target) {
      target = n.index;
      offset = env.rng();
      seen = 0;
    }
  }

  // ── visuals (no time advance: also called from force) ──
  function place(view: RaceView): void {
    const pad = target >= 0 ? view.pads[target] : undefined;
    fade = pad ? showFade(ahead) : 0;
    if (pad && fade > 0) {
      const r = ensureRing();
      attach(r.object);
      const s = scale();
      r.object.scale.setScalar(s);
      r.object.position.set(pad.x, pad.y + BOOST.ringHeight * s, pad.z);
      r.object.rotation.set(0, Math.atan2(pad.dx, pad.dz), 0);
      r.setT(cycleAt(offset, clock));
      r.setFade(fade);
    } else detach(ring?.object);

    if (flashPad && flashT >= 0 && flashT < BOOST.flashSeconds) {
      const f = ensureFlash();
      attach(f.object);
      const k = flashT / BOOST.flashSeconds;
      const s = scale() * (1 + 1.3 * k);
      f.object.scale.setScalar(s);
      f.object.position.set(flashPad.x, flashPad.y + BOOST.ringHeight * scale(), flashPad.z);
      f.object.rotation.set(0, Math.atan2(flashPad.dx, flashPad.dz), 0);
      f.setFade(1 - k * k);
    } else detach(flash?.object);
  }

  function crossed(view: RaceView): void {
    const i = nearestPad(view.pads, view.progress, view.length);
    const t = cycleAt(offset, clock);
    const outcome = judge(i, target, seen, t, tier);
    last = { pad: i, t, outcome };
    done = i;
    if (outcome) {
      const hit = outcome === 'hit';
      env.result(tier, hit);
      if (hit) {
        hits++;
        env.pay(BOOST.pay[tier]);
        flashT = 0;
        flashPad = view.pads[i] ?? null;
      } else misses++;
      ({ tier, streak } = stepTier(tier, streak, hit));
    }
    target = -1;
    seen = 0;
  }

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      deactivate();
      tier = 1;
      streak = 0;
      hits = 0;
      misses = 0;
      last = null;
      clock = 0;
    },
    update(dt) {
      const view = getRaceView(ctx);
      if (!view || view.phase !== 'racing' || view.pads.length === 0) {
        if (active) deactivate();
        return;
      }
      if (!active) {
        active = true;
        lastPadsHit = view.padsHit;
      }
      clock += dt;
      if (view.padsHit > lastPadsHit) {
        lastPadsHit = view.padsHit;
        crossed(view);
      } else if (view.padsHit < lastPadsHit) lastPadsHit = view.padsHit;
      retarget(view);
      if (ring && isAttached(ring.object) && fade > 0.5) seen += dt;
      if (flashT >= 0) {
        flashT += dt;
        if (flashT >= BOOST.flashSeconds) {
          flashT = -1;
          flashPad = null;
        }
      }
      flash?.update(dt);
      place(view);
    },
    dispose() {
      deactivate();
      ring?.dispose();
      flash?.dispose();
      ring = flash = null;
    },
    debug() {
      const view = getRaceView(ctx);
      const t = cycleAt(offset, clock);
      return {
        active,
        phase: view?.phase ?? null,
        attached: env.tracked().length,
        padsHit: view?.padsHit ?? null,
        target,
        ahead: Number.isFinite(ahead) ? ahead : null,
        fade,
        t,
        hot: target >= 0 && isHot(t, tier),
        tier,
        streak,
        window: BOOST.window[tier],
        luck: luckRate(tier),
        seen,
        clock,
        ringAttached: isAttached(ring?.object),
        flashAttached: isAttached(flash?.object),
        last,
        hits,
        misses,
      };
    },
    force(params) {
      if (typeof params.tier === 'number') {
        tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
        streak = 0;
      }
      if (typeof params.streak === 'number') streak = Math.max(0, Math.round(params.streak));
      // Cycle position of the current pad's beat right now (0..1).
      if (typeof params.phase === 'number') offset = offsetFor(params.phase, clock);
      // Set the beat so the buggy, at its current speed, reaches the pad trigger hot or cold.
      if (params.arrive === 'hot' || params.arrive === 'cold') {
        const speed = Math.max(1, car()?.speed ?? 1);
        const eta = Math.max(0, (Number.isFinite(ahead) ? ahead : 0) - RACE.padHalf.along) / speed;
        const t = params.arrive === 'hot' ? BOOST.perfectAt : BOOST.perfectAt + 0.5;
        offset = offsetFor(t - Math.floor(t), clock, eta);
      }
      const view = getRaceView(ctx);
      if (active && view && view.phase === 'racing') place(view);
    },
    drawObjects: () => env.tracked(),
  };
}
