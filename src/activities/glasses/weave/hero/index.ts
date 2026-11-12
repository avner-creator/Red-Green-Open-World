/**
 * `hero` (onHero): weak-eye helpers that follow the hero, shown only on demand.
 *
 *  - A bold ground ring round the feet (`../bounce/boldRing.ts`: a solid two-tone band) shows the
 *    skill's recharge as a progress arc while the skill recharges, pops when it is ready and stays
 *    ~2 s, and shows again during a ring sparkle (1 draw).
 *  - A `×N` number floats above the head while the gem combo is ×2 or more (1 draw).
 *  - Lucky moments (`./logic.ts`): every 20–40 s of play one helper sparkles for 1.5 / 1.0 / 0.7 s
 *    (by tier), on the layer only. A ring sparkle needs a ready skill (the ring then shows for the
 *    window); a number sparkle needs the number on screen. Firing the skill during a ring sparkle,
 *    or collecting a gem during a number sparkle (the number turns into ★), is a hit: +2 gems and
 *    a weak-eye burst. Acting within 1.5 s after the window closed is a miss; else no result.
 *
 * Most of the time nothing is attached: 0 draw calls. No physics query: the ring lies on the
 * hero's own ground height (feet while grounded, else the last ground or the terrain height).
 * The HUD skill chip and combo badge are untouched. Nothing sounds when a sparkle starts;
 * `env.pay` chimes after a hit. Only in walk mode with the avatar visible. Draws ≤ 3.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GameContext } from '../../../../types';
import { PLAYER } from '../../../../config';
import { createGlyphSprite, createRing, withChallenge } from '../../../../vision/toolkit';
import type { GlyphSpriteBlock, RingBlock } from '../../../../vision/toolkit';
import { createBoldRing } from '../bounce/boldRing';
import type { BoldRingBlock } from '../bounce/boldRing';
import type { WeaveEnv, WeavePart } from '../types';
import { HERO_LUCK, HeroLuck } from './logic';
import type { SparkKind } from './logic';

const LOOK = {
  ringRadius: 0.95,
  ringWidth: 0.24,
  /** Lift of the ground ring above the ground under the hero (m). */
  lift: 0.06,
  /** Hide the ring when the feet are this far above the ground under them (m). */
  maxAbove: 6,
  /** The ring stays this long (s) after the skill became ready. */
  readyHold: 2,
  /** Number: ink height and height of its centre above the feet. */
  numberHeight: 0.55,
  numberY: PLAYER.height + 0.8,
  /** Follow rate (1/s) of the helpers. */
  follow: 22,
  fadeIn: 0.15,
  pop: 0.35,
  burstTime: 0.7,
} as const;

const UP = new THREE.Vector3(0, 1, 0);

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  const luck = new HeroLuck(env.rng);
  let ring: BoldRingBlock | null = null;
  let num: GlyphSpriteBlock | null = null;
  let burst: { block: RingBlock; left: number; kind: SparkKind } | null = null;
  const bursts: Partial<Record<SparkKind, RingBlock>> = {};
  let ringOn = false;
  let numOn = false;
  let ringFade = 0;
  let ringPop = 0;
  let numPop = 0;
  let wasReady = true;
  /** Seconds since the skill became ready (Infinity = no recent recharge to show). */
  let readyFor = Infinity;
  let maxCd = 0;
  let snapRing = true;
  let lastGroundY = Number.NaN;
  let groundOk = false;
  let time = 0;
  let comboShown = 1;
  /** Test hook: show this combo multiplier instead of the economy's (null = live). */
  let forcedCombo: number | null = null;
  const feet = new THREE.Vector3();
  const ground = new THREE.Vector3();
  const normal = new THREE.Vector3(0, 1, 0);
  const tmpQ = new THREE.Quaternion();
  let hits = 0;
  let misses = 0;
  let lastResult: string | null = null;

  const eligible = (): boolean => {
    // `player` is always there in the game; the weave registry unit test runs without one.
    const pl = ctx.player as GameContext['player'] | undefined;
    return pl !== undefined && pl.mode === 'walk' && pl.object.visible;
  };
  const comboNow = (): number => forcedCombo ?? ctx.economy.combo.multiplier;

  const ringBlock = (): BoldRingBlock => {
    if (!ring) {
      ring = createBoldRing({ maxRadius: LOOK.ringRadius * 1.4, facing: 'ground' });
      ring.object.name = 'weave-hero-ring';
      ring.set({ target: LOOK.ringRadius, targetWidth: LOOK.ringWidth, closing: 0, ticks: 0, level: 0.95 });
    }
    return ring;
  };

  const numBlock = (): GlyphSpriteBlock => {
    if (!num) {
      num = createGlyphSprite({ text: '×2', height: LOOK.numberHeight, maxChars: 3, level: 0.95 });
      num.object.name = 'weave-hero-number';
    }
    return num;
  };

  const burstBlock = (kind: SparkKind): RingBlock => {
    let b = bursts[kind];
    if (!b) {
      b = createRing({
        radius: kind === 'skill' ? LOOK.ringRadius : 0.42,
        thickness: kind === 'skill' ? 0.18 : 0.1,
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

  const showRing = (on: boolean): void => {
    if (on === ringOn) return;
    ringOn = on;
    const r = ringBlock();
    if (on) {
      snapRing = true;
      ringFade = 0;
      env.add(r.object, VisionLayer.WeakOnly);
    } else {
      env.remove(r.object);
    }
  };

  const showNum = (on: boolean): void => {
    if (on === numOn) return;
    numOn = on;
    const n = numBlock();
    if (on) {
      numPop = LOOK.pop;
      env.add(n.object, VisionLayer.WeakOnly);
    } else {
      env.remove(n.object);
    }
  };

  const detachAll = (): void => {
    showRing(false);
    showNum(false);
    if (burst) env.remove(burst.block.object);
    burst = null;
  };

  /** The ground under the hero, without a physics query. */
  const groundUnder = (): void => {
    const p = ctx.player.position;
    const w = ctx.world;
    if (ctx.player.grounded) lastGroundY = p.y;
    const h = w.heightAt(p.x, p.z);
    const gy = ctx.player.grounded ? p.y : Number.isFinite(lastGroundY) && p.y >= lastGroundY - 0.1 ? lastGroundY : h;
    groundOk = p.y - gy <= LOOK.maxAbove;
    ground.set(p.x, gy, p.z);
    if (Math.abs(gy - h) < 0.3) {
      const e = 0.6;
      normal.set(w.heightAt(p.x - e, p.z) - w.heightAt(p.x + e, p.z), 2 * e, w.heightAt(p.x, p.z - e) - w.heightAt(p.x, p.z + e)).normalize();
      if (normal.y < 0.5) normal.copy(UP);
    } else {
      normal.copy(UP);
    }
  };

  /** Follow the hero and apply the looks (progress, pops, sparkles, fades, burst). */
  const look = (dt: number): void => {
    const p = ctx.player.position;
    const tp = withChallenge(1, env.challenge());
    const sparkTier = withChallenge(luck.spark?.tier ?? luck.tier, env.challenge());
    const k = 1 - Math.exp(-LOOK.follow * dt);
    if (ringOn && ring) {
      groundUnder();
      const snap = snapRing;
      snapRing = false;
      if (snap) feet.copy(p);
      else feet.lerp(p, k);
      const gy = ground.y + LOOK.lift;
      const ry = snap ? gy : ring.object.position.y + (gy - ring.object.position.y) * k;
      ring.object.position.set(feet.x, ry, feet.z);
      tmpQ.setFromUnitVectors(UP, normal);
      ring.object.quaternion.slerp(tmpQ, snap ? 1 : k);
      const sk = ctx.player.skill;
      const spark = luck.spark?.kind === 'skill';
      const progress = sk.ready ? 1 : maxCd > 0 ? 1 - sk.cooldown / maxCd : 0;
      ring.set({
        progress: spark ? 1 : progress,
        ticks: spark ? 8 : 0,
        rotation: (time * 0.9) % 1,
        near: spark ? 0.5 + 0.5 * Math.sin(time * Math.PI * 2 * 3) : 0,
        level: spark ? sparkTier.level : 0.95,
      });
      ringPop = Math.max(0, ringPop - dt);
      const popK = ringPop > 0 ? Math.sin((ringPop / LOOK.pop) * Math.PI) : 0;
      ring.object.scale.setScalar(tp.size * (1 + 0.28 * popK));
      ringFade = Math.min(1, ringFade + dt / LOOK.fadeIn);
      ring.setFade(groundOk ? (dt === 0 ? Math.max(ringFade, 1) : ringFade) : 0);
    }
    if (numOn && num) {
      const numSpark = luck.spark?.kind === 'combo';
      const text = numSpark ? '★' : `×${Math.min(9, Math.round(comboShown))}`;
      if (text !== num.text) numPop = LOOK.pop;
      num.setText(text);
      num.object.position.set(p.x, p.y + LOOK.numberY, p.z);
      numPop = Math.max(0, numPop - dt);
      const nPop = numPop > 0 ? Math.sin((numPop / LOOK.pop) * Math.PI) : 0;
      const twinkle = numSpark ? 0.18 * Math.sin(time * Math.PI * 2 * 4) : 0;
      num.object.scale.setScalar(tp.size * (1 + 0.35 * nPop + twinkle) * (numSpark ? 1.25 : 1));
      num.set({ level: numSpark ? sparkTier.level : 0.95 });
    }
    if (burst) {
      burst.left = Math.max(0, burst.left - dt);
      const kk = 1 - burst.left / LOOK.burstTime;
      const b = burst.block;
      b.update(dt);
      if (burst.kind === 'skill') b.object.position.set(p.x, (ringOn && ring ? ring.object.position.y : p.y + LOOK.lift) + 0.01, p.z);
      else b.object.position.set(p.x, p.y + LOOK.numberY, p.z);
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
    if (!eligible()) return;
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

  const offs: (() => void)[] = [ctx.events.on('player:skill', () => onAct('skill')), ctx.events.on('gem:collected', () => onAct('combo'))];

  /** Decide what shows (cheap: no placement work unless something is attached). */
  const wants = (dt: number): void => {
    const sk = ctx.player.skill;
    if (sk.cooldown > maxCd) maxCd = sk.cooldown;
    if (sk.ready) {
      if (!wasReady) {
        readyFor = 0;
        ringPop = LOOK.pop;
      } else readyFor += dt;
      maxCd = 0;
    }
    wasReady = sk.ready;
    comboShown = comboNow();
    luck.update(dt, { skill: sk.ready, combo: comboShown >= 2 });
    showRing(!sk.ready || readyFor < LOOK.readyHold || luck.spark?.kind === 'skill');
    showNum(comboShown >= 2);
  };

  const reset = (): void => {
    detachAll();
    luck.reset();
    forcedCombo = null;
    hits = misses = 0;
    lastResult = null;
    time = 0;
    readyFor = Infinity;
    wasReady = true;
    maxCd = 0;
    lastGroundY = Number.NaN;
  };

  return {
    id: env.id,
    kind: env.kind,
    reset,
    update(dt) {
      if (!eligible()) {
        if (!ringOn && !numOn && !burst && !luck.spark && !luck.late && !luck.gone) return;
        // Leaving walk mode: the sparkle and its late window end without a result.
        luck.spark = null;
        luck.late = null;
        luck.gone = null;
        detachAll();
        return;
      }
      wants(dt);
      if (!ringOn && !numOn && !burst) return;
      time += dt;
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
        active: ringOn || numOn || burst !== null,
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
        ring: ringOn && ring ? { x: ring.object.position.x, y: ring.object.position.y, z: ring.object.position.z } : null,
        number: numOn && num ? { text: num.text, y: num.object.position.y } : null,
        readyFor: Number.isFinite(readyFor) ? readyFor : null,
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
      if (params.readyHold === false) readyFor = Infinity;
      // Show the forced state at once (no time passes).
      if (eligible()) {
        wants(0);
        if (ringOn || numOn || burst) look(0);
      }
    },
    drawObjects: () => env.tracked(),
  };
}
