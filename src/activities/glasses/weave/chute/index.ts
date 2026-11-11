/**
 * Glasses weave part `chute`, in the balloon skydive (two optional plays on top of the ride):
 *
 *  - **Parachute ring (timeIt).** On each jump a target height (70–120 m above ground, random,
 *    continuous) is picked. A weak-eye timing ring lies round the hero and closes onto its target
 *    ring as the height nears the target; the target ring flares while the hero is inside the
 *    tier's window. Opening the chute (Space) in the window is a hit (2/3/5 gems + a weak-eye
 *    flash); a manual open that is close but outside it (±20 m) is a miss; anything farther and the
 *    ride's own auto-open give no result. The ride itself never changes.
 *  - **Hoop gem (lineUp).** One strong-eye hoop (radius 3 m, flat) hangs 100–130 m up beside the
 *    gem trail (hands-off freefall passes beside it). A weak-eye gem orbits in the hoop's plane and
 *    is inside it 40 % of the time. Falling through the hoop while the gem is inside is a hit
 *    (+3 gems, the gem pops); through it while the gem is outside is a miss; beside it, nothing.
 *    Each eye alone lacks one half.
 *
 * Active only from the top of the balloon ride to the landing (`getSkydiveView`); otherwise nothing
 * is attached and `update` returns at once. At most 4 draws (ring or flash, hoop, gem).
 */
import * as THREE from 'three';
import { BALLOON } from '../../../../config';
import { VisionLayer } from '../../../../types';
import type { GlassesTier } from '../../../../types';
import { createRing, createTimingRing, withChallenge } from '../../../../vision/toolkit';
import type { RingBlock, TimingRingBlock } from '../../../../vision/toolkit';
import { buildGemGeometry } from '../../../gems';
import { getSkydiveView } from '../../../skydive';
import type { RidePhase } from '../../../skydive';
import type { WeaveEnv, WeavePart } from '../types';
import { CHUTE, HOOP, crossDisc, gemIsInside, gemOffset, hoopOutcome, orbitRadius, pickTarget, placeHoop, ringOutcome, ringT, stepTier, thetaFor, windowT } from './logic';
import type { Outcome, P3 } from './logic';

/** Chest height above the feet (the ride's own hoop test uses the same). */
const CHEST = 0.85;
/** The hoop is dropped quietly once the hero is this far below it. */
const BELOW_DONE = 12;

const isLive = (p: RidePhase): boolean => p === 'top' || p === 'freefall' || p === 'canopy';

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  const R = orbitRadius();

  // ── state ──
  let active = false;
  let lastPhase: RidePhase = 'idle';
  let time = 0;
  let ringTier: GlassesTier = 1;
  let hoopTier: GlassesTier = 1;
  let target = 0;
  let ringOpen = false; // this jump's ring still waiting for the open
  let lastOpen: { agl: number; auto: boolean; outcome: Outcome } | null = null;
  let hoopArmed = false;
  let hoopFade = 0; // 1 → 0 after the pass
  let hoopCenter: P3 | null = null;
  let theta = 0;
  let orbitDir = 0;
  let gemPop = -1;
  let flashT = -1;
  let hits = 0;
  let misses = 0;
  let lastHoop: Outcome = null;
  /** Test only: pin the gem to a world point (mirror check moves the hoop, not the gem). */
  let gemPin: P3 | null = null;
  const chest = new THREE.Vector3();
  const prevChest = new THREE.Vector3();
  const vel = new THREE.Vector3();

  // ── objects (built lazily on the first ride) ──
  let ring: TimingRingBlock | null = null;
  let flash: RingBlock | null = null;
  let hoop: RingBlock | null = null;
  let gem: THREE.Mesh | null = null;
  let gemMat: THREE.MeshBasicMaterial | null = null;
  let gemGeo: THREE.BufferGeometry | null = null;

  const attached = (o: THREE.Object3D | null | undefined): boolean => !!o && o.parent !== null && env.tracked().includes(o);
  const attach = (o: THREE.Object3D, layer: VisionLayer): void => {
    if (!env.tracked().includes(o)) env.add(o, layer);
  };
  const detach = (o: THREE.Object3D | null | undefined): void => {
    if (o) env.remove(o);
  };

  function buildRing(): void {
    ring?.dispose();
    const p = withChallenge(ringTier, env.challenge());
    const w = windowT(ringTier);
    ring = createTimingRing({
      radius: CHUTE.ringRadius,
      startRadius: CHUTE.ringStart,
      thickness: CHUTE.ringThickness,
      perfectAt: CHUTE.perfectAt,
      perfect: w,
      good: w,
      targetAlpha: 0.7,
      level: p.level,
      opacity: p.opacity,
      facing: 'ground',
    });
    ring.object.name = 'chuteRing';
  }

  function ensureObjects(): void {
    if (!hoop) {
      hoop = createRing({ radius: HOOP.radius, thickness: HOOP.thickness, segments: 12, segmentFill: 0.78, spin: 0.05, facing: 'ground' });
      hoop.object.name = 'chuteHoop';
    }
    if (!gem) {
      gemGeo = buildGemGeometry();
      gemMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      gem = new THREE.Mesh(gemGeo, gemMat);
      gem.name = 'chuteHoopGem';
      gem.castShadow = false;
      gem.receiveShadow = false;
    }
    if (!flash) {
      flash = createRing({ radius: 2.2, thickness: 0.32, segments: 10, segmentFill: 0.5, spin: 0.6 });
      flash.object.name = 'chuteFlash';
    }
  }

  function deactivate(): void {
    for (const o of env.tracked()) env.remove(o);
    active = false;
    ringOpen = false;
    hoopArmed = false;
    hoopCenter = null;
    flashT = -1;
    gemPop = -1;
  }

  function readChest(): void {
    const p = ctx.player.position;
    chest.set(p.x, p.y + CHEST, p.z);
  }

  /** A new jump: new target, new hoop, new orbit. */
  function newJump(phase: RidePhase): void {
    ensureObjects();
    target = pickTarget(env.rng);
    const h = HOOP.heightMin + (HOOP.heightMax - HOOP.heightMin) * env.rng();
    const side: 1 | -1 = env.rng() < 0.5 ? 1 : -1;
    theta = env.rng() * Math.PI * 2;
    orbitDir = env.rng() * Math.PI * 2;
    const trail = ctx.world.gemSpots
      .filter((s) => s.tag === 'skydive')
      .map((s) => ({ x: s.position.x, y: s.position.y, z: s.position.z }))
      .sort((a, b) => b.y - a.y);
    hoopCenter = placeHoop(trail, (x, z) => ctx.world.heightAt(x, z), h, side);
    hoopArmed = hoopCenter !== null && phase !== 'canopy';
    hoopFade = 1;
    gemPop = -1;
    ringOpen = phase !== 'canopy';
    lastOpen = null;
    lastHoop = null;
    flashT = -1;
    buildRing();
    readChest();
    prevChest.copy(chest);
    vel.set(0, 0, 0);
  }

  // ── visuals (no time advance: also called from force) ──
  function place(phase: RidePhase): void {
    const view = getSkydiveView(ctx);
    // Ring: round the hero during the freefall until the chute opens.
    if (ring && ringOpen && phase === 'freefall') {
      attach(ring.object, VisionLayer.WeakOnly);
      const p = withChallenge(ringTier, env.challenge());
      ring.object.scale.setScalar(Math.max(0.75, p.size));
      ring.object.position.set(chest.x, chest.y - 0.35, chest.z);
      // Fresh height only once the ride has stepped this fall (fallTime > 0).
      const agl = view && view.fallTime > 0 ? view.heightAboveGround : target + CHUTE.span + 1;
      ring.setT(ringT(agl, target));
      // Fades out once the closing ring has gone well past its target.
      ring.setFade(agl < target - CHUTE.span * 0.3 ? 0 : 1);
    } else if (ring) detach(ring.object);

    // Hoop + gem.
    if (hoop && gem && gemMat && hoopCenter && (hoopArmed || hoopFade > 0)) {
      attach(hoop.object, VisionLayer.StrongOnly);
      hoop.object.position.set(hoopCenter.x, hoopCenter.y, hoopCenter.z);
      hoop.setFade(hoopArmed ? 1 : hoopFade);
      const hp = withChallenge(hoopTier, env.challenge());
      const o = gemOffset(theta, R, orbitDir);
      if (gemPin) gem.position.set(gemPin.x, gemPin.y + 0.15, gemPin.z);
      else gem.position.set(hoopCenter.x + o.x, hoopCenter.y + 0.15, hoopCenter.z + o.z);
      gem.rotation.y = time * 1.4;
      let s = HOOP.gemScale * Math.max(0.7, hp.size);
      if (gemPop >= 0) {
        const k = Math.min(1, gemPop / 0.45);
        s *= Math.max(0.001, (1 + k * 1.4) * (1 - k));
      }
      gem.scale.setScalar(s);
      gemMat.color.setScalar(hp.level);
      if (gemPop >= 0.45) detach(gem);
      else attach(gem, VisionLayer.WeakOnly);
    } else {
      detach(hoop?.object);
      detach(gem);
    }

    // Flash after a ring hit (weak layer, round the hero).
    if (flash && flashT >= 0 && flashT < CHUTE.flashSeconds) {
      attach(flash.object, VisionLayer.WeakOnly);
      const k = flashT / CHUTE.flashSeconds;
      flash.object.position.set(chest.x, chest.y + 0.6, chest.z);
      flash.object.scale.setScalar(0.8 + 1.6 * k);
      flash.setFade(1 - k * k);
    } else detach(flash?.object);
  }

  function resolveRing(): void {
    const view = getSkydiveView(ctx);
    if (!view || !ringOpen) return;
    ringOpen = false;
    const agl = view.heightAboveGround;
    const auto = agl <= BALLOON.autoChuteHeight;
    const outcome = ringOutcome(agl, target, ringTier, auto);
    lastOpen = { agl, auto, outcome };
    if (!outcome) return;
    const hit = outcome === 'hit';
    env.result(ringTier, hit, 'timeIt');
    if (hit) {
      hits++;
      env.pay(CHUTE.pay[ringTier]);
      flashT = 0;
    } else misses++;
    ringTier = stepTier(ringTier, hit);
  }

  function checkHoop(): void {
    if (!hoopArmed || !hoopCenter) return;
    const d = crossDisc(prevChest, chest, hoopCenter, HOOP.radius);
    const through = d !== null;
    if (!through) {
      // Beside the hoop: no result. Once the hero is well below it, let it go.
      if (chest.y < hoopCenter.y - BELOW_DONE) hoopArmed = false;
      return;
    }
    const outcome = hoopOutcome(true, gemIsInside(theta, R));
    lastHoop = outcome;
    hoopArmed = false;
    hoopFade = 1;
    const hit = outcome === 'hit';
    env.result(hoopTier, hit, 'lineUp');
    if (hit) {
      hits++;
      gemPop = 0;
      env.pay(HOOP.pay);
    } else misses++;
    hoopTier = stepTier(hoopTier, hit);
  }

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      deactivate();
      gemPin = null;
      lastPhase = 'idle';
      ringTier = 1;
      hoopTier = 1;
      hits = 0;
      misses = 0;
      lastOpen = null;
      lastHoop = null;
    },
    update(dt) {
      const view = getSkydiveView(ctx);
      const phase = view ? view.phase : 'idle';
      if (!isLive(phase)) {
        if (active) deactivate();
        lastPhase = phase;
        return;
      }
      time += dt;
      const fresh = !active || (phase === 'freefall' && lastPhase !== 'top' && lastPhase !== 'freefall') || (phase === 'top' && lastPhase !== 'top');
      if (fresh) {
        active = true;
        newJump(phase);
      }
      if (phase === 'canopy' && lastPhase === 'freefall') resolveRing();
      lastPhase = phase;

      prevChest.copy(chest);
      readChest();
      if (dt > 0) vel.subVectors(chest, prevChest).divideScalar(dt);
      if (phase === 'top') prevChest.copy(chest);
      else checkHoop();

      const sp = withChallenge(hoopTier, env.challenge()).speed;
      theta = (theta + ((Math.PI * 2) / HOOP.period) * sp * dt) % (Math.PI * 2);
      if (!hoopArmed && hoopFade > 0) hoopFade = Math.max(0, hoopFade - dt / 0.6);
      if (gemPop >= 0) gemPop += dt;
      if (flashT >= 0) {
        flashT += dt;
        if (flashT >= CHUTE.flashSeconds) flashT = -1;
      }
      hoop?.update(dt);
      flash?.update(dt);
      place(phase);
    },
    dispose() {
      deactivate();
      ring?.dispose();
      flash?.dispose();
      hoop?.dispose();
      gemGeo?.dispose();
      gemMat?.dispose();
      ring = flash = hoop = null;
      gem = null;
    },
    debug() {
      const view = getSkydiveView(ctx);
      return {
        active,
        phase: view?.phase ?? null,
        agl: view?.heightAboveGround ?? null,
        attached: env.tracked().length,
        ring: { target, tier: ringTier, window: CHUTE.window[ringTier], open: ringOpen, t: ring?.t ?? null, attached: attached(ring?.object) },
        lastOpen,
        hoop: {
          center: hoopCenter,
          radius: HOOP.radius,
          tier: hoopTier,
          armed: hoopArmed,
          theta,
          gemInside: gemIsInside(theta, R),
          gem: gem ? { x: gem.position.x, y: gem.position.y, z: gem.position.z } : null,
          attached: attached(hoop?.object),
          gemAttached: attached(gem),
        },
        lastHoop,
        flash: flashT,
        hits,
        misses,
      };
    },
    force(params) {
      const view = getSkydiveView(ctx);
      const phase = view?.phase ?? 'idle';
      if (typeof params.ringTier === 'number') {
        ringTier = Math.min(3, Math.max(1, Math.round(params.ringTier))) as GlassesTier;
        buildRing();
      }
      if (typeof params.hoopTier === 'number') hoopTier = Math.min(3, Math.max(1, Math.round(params.hoopTier))) as GlassesTier;
      if (typeof params.target === 'number') {
        target = params.target;
        ringOpen = true;
      }
      if (typeof params.theta === 'number') theta = params.theta;
      if (typeof params.gemInside === 'boolean') theta = thetaFor(params.gemInside);
      if (typeof params.orbitDir === 'number') orbitDir = params.orbitDir;
      if ('keepGemAt' in params) {
        const k = params.keepGemAt as P3 | null;
        gemPin = k && typeof k.x === 'number' ? { x: k.x, y: k.y, z: k.z } : null;
      }
      const at = params.hoop as P3 | undefined;
      const ahead = params.hoopAhead;
      if ((at && typeof at.x === 'number') || typeof ahead === 'number') {
        ensureObjects();
        readChest();
        hoopCenter = at ? { x: at.x, y: at.y, z: at.z } : { x: chest.x + vel.x * Number(ahead), y: chest.y + vel.y * Number(ahead), z: chest.z + vel.z * Number(ahead) };
        hoopArmed = true;
        hoopFade = 1;
        gemPop = -1;
        lastHoop = null;
      }
      if (isLive(phase) && active) place(phase);
    },
    drawObjects: () => env.tracked(),
  };
}
