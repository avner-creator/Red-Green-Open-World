/**
 * `hero` (onHero): weak-eye helpers that follow the hero.
 *
 *  - A ground ring round the feet shows the skill's recharge as a progress arc and pops when the
 *    skill is ready (1 draw).
 *  - A `×N` number floats above the head while the gem combo is ×2 or more (1 draw).
 *  - Lucky moments (`./logic.ts`): every 20–40 s of play one helper sparkles for 1.5 / 1.0 / 0.7 s
 *    (by tier), on the layer only. Firing the skill during a ring sparkle, or collecting a gem
 *    during a number sparkle (the number turns into ★), is a hit: +2 gems and a weak-eye burst.
 *    Acting within 1.5 s after the window closed is a miss; anything else is no result.
 *
 * The HUD skill chip and combo badge are untouched (these add to them). Nothing sounds when a
 * sparkle starts; `env.pay` chimes after a hit. Only in walk mode with the avatar visible: in a
 * vehicle, on a ride, in a trampoline flight or a flop nothing is attached and `update` returns
 * early. Draws: ring + number + one burst ≤ 3.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GameEvents } from '../../../../types';
import { PLAYER } from '../../../../config';
import { createGlyphSprite, createRing, withChallenge } from '../../../../vision/toolkit';
import type { GlyphSpriteBlock, RingBlock } from '../../../../vision/toolkit';
import type { WeaveEnv, WeavePart } from '../types';
import { HERO_LUCK, HeroLuck } from './logic';
import type { SparkKind } from './logic';

const LOOK = {
  ringRadius: 0.95,
  ringThickness: 0.13,
  /** Lift of the ground ring above the ground under the hero (m). */
  lift: 0.06,
  /** Ground probe: from this high above the feet, this far down. */
  probeUp: 0.4,
  probeDown: 8,
  /** Number: ink height and height of its centre above the feet. */
  numberHeight: 0.55,
  numberY: PLAYER.height + 0.5,
  /** Follow rate (1/s) of the helpers. */
  follow: 22,
  fadeIn: 0.2,
  pop: 0.35,
  burstTime: 0.7,
} as const;

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  const luck = new HeroLuck(env.rng);
  let ring: RingBlock | null = null;
  let num: GlyphSpriteBlock | null = null;
  let burst: { block: RingBlock; left: number; kind: SparkKind } | null = null;
  const bursts: Partial<Record<SparkKind, RingBlock>> = {};
  let active = false;
  let fadeIn = 0;
  let ringPop = 0;
  let numPop = 0;
  let wasReady = true;
  let maxCd = 0;
  let snap = true;
  let groundOk = false;
  let time = 0;
  let comboShown = 1;
  let ringSparkShown = false;
  let ringLevelShown = 0.9;
  let numLevelShown = 0.95;
  let numAttached = false;
  /** Test hook: show this combo multiplier instead of the economy's (null = live). */
  let forcedCombo: number | null = null;
  const feet = new THREE.Vector3();
  const ground = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  const probe = new THREE.Vector3();
  let hits = 0;
  let misses = 0;
  let lastResult: string | null = null;

  const eligible = (): boolean => ctx.player.mode === 'walk' && ctx.player.object.visible;
  const comboNow = (): number => forcedCombo ?? ctx.economy?.combo.multiplier ?? 1;
  const ringShowing = (): boolean => active && groundOk;
  const numberShowing = (): boolean => active && comboNow() >= 2;

  const ensure = (): { ring: RingBlock; num: GlyphSpriteBlock } => {
    if (!ring) {
      ring = createRing({ radius: LOOK.ringRadius, thickness: LOOK.ringThickness, trackAlpha: 0.3, level: 0.9, facing: 'ground' });
      ring.object.name = 'weave-hero-ring';
    }
    if (!num) {
      num = createGlyphSprite({ text: '×2', height: LOOK.numberHeight, maxChars: 3, level: 0.95 });
      num.object.name = 'weave-hero-number';
    }
    return { ring, num };
  };

  const burstBlock = (kind: SparkKind): RingBlock => {
    let b = bursts[kind];
    if (!b) {
      b = createRing({
        radius: kind === 'skill' ? LOOK.ringRadius : 0.42,
        thickness: kind === 'skill' ? 0.16 : 0.1,
        segments: 10,
        segmentFill: 0.42,
        spin: 0.7,
        facing: kind === 'skill' ? 'ground' : 'billboard',
      });
      b.object.name = `weave-hero-burst-${kind}`;
      bursts[kind] = b;
    }
    return b;
  };

  const deactivate = (): void => {
    if (ring) env.remove(ring.object);
    if (num) env.remove(num.object);
    numAttached = false;
    if (burst) env.remove(burst.block.object);
    burst = null;
    active = false;
    snap = true;
  };

  /**
   * The ground under the hero (the ring lies on it, tilted to its slope): the first collider below
   * the feet, or the terrain height where no collider is hit; the feet themselves while grounded.
   */
  const probeGround = (): void => {
    const p = ctx.player.position;
    const w = ctx.world;
    const h = w.heightAt(p.x, p.z);
    const hit = ctx.physics.raycast(probe.set(p.x, p.y + LOOK.probeUp, p.z), DOWN, LOOK.probeUp + LOOK.probeDown);
    const onCollider = hit !== null && hit.point.y >= h - 0.05;
    const gy = ctx.player.grounded ? p.y : onCollider ? hit.point.y : h;
    groundOk = p.y - gy <= LOOK.probeDown && p.y - gy >= -1;
    if (!groundOk) return;
    ground.set(p.x, gy, p.z);
    if (onCollider && hit.normal.y > 0.5) {
      normal.copy(hit.normal);
    } else if (!onCollider) {
      const e = 0.6;
      normal.set(w.heightAt(p.x - e, p.z) - w.heightAt(p.x + e, p.z), 2 * e, w.heightAt(p.x, p.z - e) - w.heightAt(p.x, p.z + e)).normalize();
      if (normal.y < 0.5) normal.copy(UP);
    } else {
      normal.copy(UP);
    }
  };

  const place = (dt: number): void => {
    if (!ring || !num) return;
    const p = ctx.player.position;
    const k = snap ? 1 : 1 - Math.exp(-LOOK.follow * dt);
    feet.lerp(p, k);
    if (snap) feet.copy(p);
    if (groundOk) {
      const gy = ground.y + LOOK.lift;
      const ry = snap ? gy : ring.object.position.y + (gy - ring.object.position.y) * k;
      ring.object.position.set(feet.x, ry, feet.z);
      tmpQ.setFromUnitVectors(UP, normal);
      ring.object.quaternion.slerp(tmpQ, snap ? 1 : k);
    }
    num.object.position.set(feet.x, feet.y + LOOK.numberY, feet.z);
    snap = false;
  };

  /** Apply looks: progress, pops, sparkles, fades. */
  const look = (dt: number): void => {
    if (!ring || !num) return;
    const sk = ctx.player.skill;
    const tp = withChallenge(1, env.challenge());
    const sparkTier = withChallenge(luck.spark?.tier ?? luck.tier, env.challenge());
    // Ring: recharge arc, pop when ready, sparkle in a lucky window.
    if (sk.cooldown > maxCd) maxCd = sk.cooldown;
    const ready = sk.ready;
    if (ready && !wasReady) ringPop = LOOK.pop;
    wasReady = ready;
    if (ready) maxCd = 0;
    const progress = ready ? 1 : maxCd > 0 ? 1 - sk.cooldown / maxCd : 0;
    const ringSpark = luck.spark?.kind === 'skill';
    const ringLevel = ringSpark ? sparkTier.level : 0.9;
    if (ringSpark !== ringSparkShown || ringLevel !== ringLevelShown) {
      ringSparkShown = ringSpark;
      ringLevelShown = ringLevel;
      ring.set({ segments: ringSpark ? 12 : 0, segmentFill: 0.55, spin: ringSpark ? 0.9 : 0, pulse: ringSpark ? 0.9 : 0, pulseSpeed: 4, level: ringLevel });
    }
    ring.setProgress(progress);
    ring.update(dt);
    ringPop = Math.max(0, ringPop - dt);
    const popK = ringPop > 0 ? Math.sin((ringPop / LOOK.pop) * Math.PI) : 0;
    ring.object.scale.setScalar(tp.size * (1 + 0.28 * popK));
    ring.setFade(groundOk ? fadeIn : 0);

    // Number: ×N while the combo is ×2+, ★ in a lucky window.
    const combo = comboNow();
    const numSpark = luck.spark?.kind === 'combo';
    if (combo >= 2) {
      const text = numSpark ? '★' : `×${Math.min(9, Math.round(combo))}`;
      if (text !== num.text) numPop = LOOK.pop;
      num.setText(text);
      if (!numAttached) env.add(num.object, VisionLayer.WeakOnly);
      numAttached = true;
    } else if (numAttached) {
      env.remove(num.object);
      numAttached = false;
    }
    comboShown = combo;
    numPop = Math.max(0, numPop - dt);
    const nPop = numPop > 0 ? Math.sin((numPop / LOOK.pop) * Math.PI) : 0;
    const twinkle = numSpark ? 0.18 * Math.sin(time * Math.PI * 2 * 4) : 0;
    num.object.scale.setScalar(tp.size * (1 + 0.35 * nPop + twinkle) * (numSpark ? 1.25 : 1));
    const numLevel = numSpark ? sparkTier.level : 0.95;
    if (numLevel !== numLevelShown) {
      numLevelShown = numLevel;
      num.set({ level: numLevel });
    }
    num.setFade(fadeIn);

    // Burst after a hit.
    if (burst) {
      burst.left = Math.max(0, burst.left - dt);
      const kk = 1 - burst.left / LOOK.burstTime;
      const b = burst.block;
      b.update(dt);
      if (burst.kind === 'skill') b.object.position.copy(ring.object.position);
      else b.object.position.copy(num.object.position);
      b.object.scale.setScalar(tp.size * (1 + 2.2 * (1 - (1 - kk) ** 2)));
      b.setFade((1 - kk) ** 0.7);
      if (burst.left <= 0) {
        env.remove(b.object);
        burst = null;
      }
    }
  };

  const celebrate = (kind: SparkKind): void => {
    if (burst) env.remove(burst.block.object);
    const b = burstBlock(kind);
    burst = { block: b, left: LOOK.burstTime, kind };
    if (kind === 'skill') ringPop = LOOK.pop;
    else numPop = LOOK.pop;
    env.add(b.object, VisionLayer.WeakOnly);
  };

  const onAct = (kind: SparkKind): void => {
    if (!active) return;
    const r = luck.act(kind);
    if (!r) return;
    lastResult = `${r.kind}:${r.grade}`;
    env.result(r.tier, r.grade === 'hit');
    if (r.grade === 'hit') {
      hits++;
      env.pay(HERO_LUCK.gems);
      celebrate(r.kind);
    } else {
      misses++;
    }
  };

  const offs: (() => void)[] = [
    ctx.events.on('player:skill', () => onAct('skill')),
    ctx.events.on('gem:collected', (_e: GameEvents['gem:collected']) => onAct('combo')),
  ];

  const activate = (): void => {
    const b = ensure();
    active = true;
    snap = true;
    fadeIn = 0;
    wasReady = ctx.player.skill.ready;
    maxCd = 0;
    probeGround();
    env.add(b.ring.object, VisionLayer.WeakOnly);
  };

  const reset = (): void => {
    deactivate();
    luck.reset();
    forcedCombo = null;
    hits = misses = 0;
    lastResult = null;
    time = 0;
  };

  return {
    id: env.id,
    kind: env.kind,
    reset,
    update(dt) {
      const ok = eligible();
      if (!ok) {
        if (!active) return;
        // Leaving walk mode: the sparkle and its late window end without a result.
        luck.update(0, { skill: false, combo: false });
        luck.late = null;
        deactivate();
        return;
      }
      if (!active) activate();
      time += dt;
      fadeIn = Math.min(1, fadeIn + dt / LOOK.fadeIn);
      probeGround();
      place(dt);
      luck.update(dt, { skill: ringShowing() && ctx.player.skill.ready, combo: numberShowing() });
      look(dt);
    },
    dispose() {
      reset();
      for (const off of offs) off();
      ring?.dispose();
      num?.dispose();
      bursts.skill?.dispose();
      bursts.combo?.dispose();
      ring = null;
      num = null;
    },
    debug() {
      return {
        active,
        tracked: env.tracked().length,
        tier: luck.tier,
        spark: luck.spark ? { ...luck.spark } : null,
        late: luck.late ? { ...luck.late } : null,
        nextIn: luck.nextIn,
        sinceSkill: Number.isFinite(luck.sinceSkill) ? luck.sinceSkill : null,
        opened: luck.opened,
        spoiled: luck.spoiled,
        cancelled: luck.cancelled,
        hits,
        misses,
        lastResult,
        ring: ring ? { x: ring.object.position.x, y: ring.object.position.y, z: ring.object.position.z, attached: env.tracked().includes(ring.object) } : null,
        number: num && env.tracked().includes(num.object) ? { text: num.text, y: num.object.position.y } : null,
        combo: comboShown,
        groundOk,
      };
    },
    force(params) {
      if ('combo' in params) {
        const c = params.combo;
        forcedCombo = typeof c === 'number' ? c : null;
      }
      if (typeof params.tier === 'number') {
        const t = Math.round(params.tier);
        luck.tier = t >= 3 ? 3 : t <= 1 ? 1 : 2;
        luck.hitsInRow = 0;
      }
      if ('spark' in params) {
        const s = params.spark;
        if (s === 'skill' || s === 'combo') luck.open(s, typeof params.age === 'number' ? params.age : 0);
        else luck.spark = null;
        luck.late = null;
      }
      if (typeof params.nextIn === 'number') luck.nextIn = params.nextIn;
      // Show the forced state at once (no time passes).
      if (active) look(0);
    },
    drawObjects: () => env.tracked(),
  };
}
