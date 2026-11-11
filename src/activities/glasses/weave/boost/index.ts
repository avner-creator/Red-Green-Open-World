/**
 * Glasses weave part `boost`: the "turbo tap" on the buggy race's boost pads (timeIt).
 *
 * While the race is on, a weak-eye countdown ring stands high over the next pad (above the buggy
 * in the chase view, from ~60 m). A closing ring shrinks with the distance and meets its target
 * ring as the buggy reaches the pad; the target ring flares in the tap zone. The child taps the
 * turbo button (Emote: C / G, gamepad D-pad up, the touch Emote button; it does nothing else in
 * the buggy) as the buggy reaches the pad: a hit is a turbo pad, +1 / 2 / 3 gems by tier and a
 * weak-eye flash. A press aimed at a pad but mistimed is a miss. Any other press, and every pad
 * crossed without a press, gives no result, so a child who ignores the layer gets nothing at all.
 * Tier: up after two hits in a row, down after a miss (per session). Rules: `./logic.ts`.
 *
 * The race itself never changes: pads, boost, surge, rivals and prizes are the race's own; this
 * part only reads `getRaceView` and the input. Nothing goes into the both-eye scene or the HUD;
 * the only both-eye feedback is the `env.pay` toast and chime after a hit, plus one Emote toast as
 * the first race of a session counts down (which button; never tied to a pad).
 *
 * Active only while `phase === 'racing'`; otherwise nothing is attached and `update` returns at
 * once. At most 2 draws: the ring and the Emote face inside it (`./face.ts`), or the ring and a hit
 * flash (the face is left out while a flash plays).
 */
import type * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GlassesTier, VehicleApi } from '../../../../types';
import { createRing, createTimingRing, withChallenge } from '../../../../vision/toolkit';
import type { RingBlock, TimingRingBlock } from '../../../../vision/toolkit';
import { getRaceView } from '../../../race';
import type { RaceView } from '../../../race';
import { leftOf } from '../../../race/track';
import type { WeaveEnv, WeavePart } from '../types';
import { createEmoteFace } from './face';
import type { EmoteFace } from './face';
import { BOOST, TapJudge, bestBlindRate, hintNow, inZone, ringPad, ringT, showFade, stepTier, zoneHalfT } from './logic';
import type { Outcome } from './logic';

type Pad = RaceView['pads'][number];

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;

  // ── state ──
  let active = false;
  let tier: GlassesTier = 1;
  let streak = 0;
  let judge: TapJudge | null = null;
  let judgePads: readonly Pad[] | null = null;
  let target = -1;
  let toZone = Infinity;
  let fade = 0;
  /** Test only: show this ring t instead of the distance-driven one (until the next update). */
  let tOverride: number | null = null;
  let flashT = -1;
  let flashPad: Pad | null = null;
  let hits = 0;
  let misses = 0;
  let presses = 0;
  let last: { pad: number; along: number; across: number; outcome: Outcome } | null = null;

  // ── objects (built lazily at the first race) ──
  let ring: TimingRingBlock | null = null;
  let ringTier: GlassesTier | 0 = 0;
  let flash: RingBlock | null = null;
  let face: EmoteFace | null = null;
  /** Test only: false hides the Emote face (to prove it is weak-eye only). */
  let faceOn = true;
  /** The once-per-session Emote toast has been shown. */
  let hinted = false;
  let hintToasts = 0;

  function ensureFace(): EmoteFace {
    if (!face) face = createEmoteFace(BOOST.faceRadius);
    return face;
  }

  const isAttached = (o: THREE.Object3D | null | undefined): boolean => !!o && env.tracked().includes(o);
  const attach = (o: THREE.Object3D): void => {
    if (!isAttached(o)) env.add(o, VisionLayer.WeakOnly);
  };
  const detach = (o: THREE.Object3D | null | undefined): void => {
    if (o) env.remove(o);
  };
  const car = (): VehicleApi | undefined => ctx.vehicles.all.find((v) => v.kind === 'car');
  const scale = (): number => Math.max(0.85, withChallenge(tier, env.challenge()).size);

  function ensureRing(): TimingRingBlock {
    if (ring && ringTier === tier) return ring;
    const was = isAttached(ring?.object);
    if (ring) {
      detach(ring.object);
      ring.dispose();
    }
    const p = withChallenge(tier, env.challenge());
    const half = zoneHalfT(tier);
    ring = createTimingRing({
      radius: BOOST.ringRadius,
      startRadius: BOOST.ringStart,
      thickness: BOOST.ringThickness,
      perfectAt: BOOST.perfectAt,
      perfect: half,
      good: half,
      targetAlpha: 0.6,
      level: p.level,
      opacity: p.opacity,
      facing: 'wall',
    });
    ring.object.name = 'boostRing';
    ringTier = tier;
    if (was) attach(ring.object);
    return ring;
  }

  function ensureFlash(): RingBlock {
    if (!flash) {
      flash = createRing({ radius: BOOST.ringRadius, thickness: 0.7, segments: 10, segmentFill: 0.55, spin: 0.9, facing: 'wall' });
      flash.object.name = 'boostFlash';
    }
    return flash;
  }

  function deactivate(): void {
    for (const o of env.tracked()) env.remove(o);
    active = false;
    target = -1;
    toZone = Infinity;
    fade = 0;
    tOverride = null;
    flashT = -1;
    flashPad = null;
    judge?.reset();
  }

  function ensureJudge(view: RaceView): TapJudge {
    if (!judge || judgePads !== view.pads) {
      judge = new TapJudge(
        view.pads.map((p) => p.s),
        view.length,
      );
      judgePads = view.pads;
    }
    return judge;
  }

  /** The buggy relative to pad `i`: along its travel direction and sideways. */
  function relTo(pad: Pad): { along: number; across: number } {
    const c = car();
    const p = c ? c.position : ctx.player.position;
    const dx = p.x - pad.x;
    const dz = p.z - pad.z;
    const l = leftOf(pad.dx, pad.dz);
    return { along: dx * pad.dx + dz * pad.dz, across: dx * l.x + dz * l.z };
  }

  function place(view: RaceView): void {
    const pad = target >= 0 ? view.pads[target] : undefined;
    fade = pad ? showFade(toZone) : 0;
    if (pad && fade > 0) {
      const r = ensureRing();
      attach(r.object);
      const s = scale();
      r.object.scale.setScalar(s);
      r.object.position.set(pad.x, pad.y + BOOST.ringHeight, pad.z);
      r.object.rotation.set(0, Math.atan2(pad.dx, pad.dz), 0);
      r.setT(tOverride ?? ringT(toZone));
      r.setFade(fade);
    } else detach(ring?.object);

    // The Emote face inside the ring (which button to tap). Left out while a hit flash plays,
    // so the part never draws more than 2 meshes.
    const flashing = flashPad !== null && flashT >= 0 && flashT < BOOST.flashSeconds;
    if (pad && fade > 0 && faceOn && !flashing) {
      const f = ensureFace();
      attach(f.mesh);
      const s = scale();
      f.mesh.scale.setScalar(s);
      f.mesh.position.set(pad.x, pad.y + BOOST.ringHeight, pad.z);
      f.mesh.rotation.set(0, Math.atan2(pad.dx, pad.dz), 0);
      f.setOpacity(fade * withChallenge(tier, env.challenge()).opacity);
    } else detach(face?.mesh);

    if (flashPad && flashT >= 0 && flashT < BOOST.flashSeconds) {
      const f = ensureFlash();
      attach(f.object);
      const k = flashT / BOOST.flashSeconds;
      f.object.scale.setScalar(scale() * (1 + 1.2 * k));
      f.object.position.set(flashPad.x, flashPad.y + BOOST.ringHeight, flashPad.z);
      f.object.rotation.set(0, Math.atan2(flashPad.dx, flashPad.dz), 0);
      f.setFade(1 - k * k);
    } else detach(flash?.object);
  }

  function retarget(view: RaceView, j: TapJudge): void {
    const r = ringPad(
      view.pads.map((p) => p.s),
      view.progress,
      view.length,
      (i) => j.isJudged(i, view.progress),
    );
    target = r.index;
    toZone = r.toZone;
  }

  function onPress(view: RaceView, j: TapJudge): void {
    presses++;
    const res = j.press(view.progress, tier, (i) => relTo(view.pads[i]));
    if (!res.outcome) return;
    const rel = relTo(view.pads[res.pad]);
    last = { pad: res.pad, along: rel.along, across: rel.across, outcome: res.outcome };
    const hit = res.outcome === 'hit';
    env.result(tier, hit);
    if (hit) {
      hits++;
      env.pay(BOOST.pay[tier]);
      flashT = 0;
      flashPad = view.pads[res.pad] ?? null;
    } else misses++;
    ({ tier, streak } = stepTier(tier, streak, hit));
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
      presses = 0;
      hinted = false;
      faceOn = true;
      last = null;
    },
    update(dt) {
      const view = getRaceView(ctx);
      // Once per session, as the first race counts down: which button is the turbo tap.
      if (view && hintNow(view.phase, hinted)) {
        hinted = true;
        hintToasts++;
        ctx.events.emit('ui:toast', { icon: 'emote' });
      }
      if (!view || view.phase !== 'racing' || view.pads.length === 0) {
        if (active) deactivate();
        return;
      }
      const j = ensureJudge(view);
      if (!active) {
        active = true;
        j.reset();
      }
      tOverride = null;
      if (ctx.input.state.emotePressed && ctx.player.vehicle === car()) onPress(view, j);
      retarget(view, j);
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
      face?.dispose();
      ring = flash = null;
      face = null;
    },
    debug() {
      const view = getRaceView(ctx);
      const pad = view && target >= 0 ? view.pads[target] : undefined;
      const rel = pad ? relTo(pad) : null;
      return {
        active,
        phase: view?.phase ?? null,
        attached: env.tracked().length,
        padsHit: view?.padsHit ?? null,
        target,
        toZone: Number.isFinite(toZone) ? toZone : null,
        along: rel?.along ?? null,
        across: rel?.across ?? null,
        inZone: rel ? inZone(rel.along, tier) : false,
        fade,
        t: ring?.t ?? null,
        tier,
        streak,
        zone: [BOOST.zoneCentre - BOOST.zoneHalf[tier], BOOST.zoneCentre + BOOST.zoneHalf[tier]],
        bestBlind: bestBlindRate(tier),
        ringAttached: isAttached(ring?.object),
        flashAttached: isAttached(flash?.object),
        faceAttached: isAttached(face?.mesh),
        hinted,
        hintToasts,
        last,
        presses,
        hits,
        misses,
      };
    },
    force(params) {
      if (typeof params.tier === 'number') {
        tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
        streak = 0;
      }
      // Show this closing-ring position now (until the next update).
      if (typeof params.t === 'number') tOverride = Math.min(1, Math.max(0, params.t));
      if (typeof params.face === 'boolean') faceOn = params.face;
      const view = getRaceView(ctx);
      if (active && view && view.phase === 'racing') place(view);
    },
    drawObjects: () => env.tracked(),
  };
}
