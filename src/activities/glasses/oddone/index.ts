/**
 * Odd one out pedestals (kind `tellApart`).
 *
 * Three chunky both-eye pedestals in a gentle arc, each with the same big round button (E). Above
 * each floats a weak-eye shape: two alike, one different. Press the button under the different one:
 * the button squashes, the pedestal flashes, confetti, gems. A wrong button wobbles with a boing.
 * Either way a new round with a reshuffled answer follows. A per-session staircase (./logic.ts)
 * makes the difference finer after hits and coarser after misses.
 *
 * Red-green rule: the shapes are the ONLY place the answer lives (WeakOnly layer). The pedestals,
 * buttons and prompts are identical for every answer; the flash, wobble and confetti happen only
 * after the press. Draw calls: board 1 + pedestals 1 + buttons 1 + shapes 1 + confetti 1 (while
 * flying) = 5.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { TIERS, withChallenge } from '../../../vision/toolkit';
import type { Mechanic, MechanicEnv } from '../types';
import { GlassesConfetti } from './confetti';
import { ODD } from './constants';
import { gemsForTier, makeRound, nextLevel, shapesOf, withAnswer } from './logic';
import type { Round } from './logic';
import { createPedestals, panelFrame, PANEL_FACE } from './pedestals';
import { createShapeBatch } from './shapes';

type Phase = 'ask' | 'feedback';

export function create(env: MechanicEnv): Mechanic {
  const { ctx } = env;
  const site = env.site;
  const facing = site.yaw; // pedestals face the approach (+Z local)

  // ── build ──
  const base = ODD.pedestals.map(([lx, lz]) => {
    const p = env.local(lx, lz);
    return new THREE.Vector3(p.x, env.groundAt(p.x, p.z), p.z);
  });
  const set = createPedestals(base, facing);
  env.add(set.pedestals, VisionLayer.Both);
  env.add(set.buttons, VisionLayer.Both);
  const frame = panelFrame(facing);
  const panelQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ODD.panelTilt, facing, 0, 'YXZ'));
  const colliders = base.flatMap((b) => {
    const h = (ODD.capBottom + ODD.capHeight) / 2;
    const top = ODD.capBottom + ODD.capHeight;
    const poleH = (ODD.shapeHeight - top) / 2;
    return [
      ctx.physics.addStaticCylinder(new THREE.Vector3(b.x, b.y + h, b.z), h, ODD.capRadius),
      ctx.physics.addStaticCylinder(new THREE.Vector3(b.x, b.y + top + poleH, b.z), poleH, ODD.poleRadius * 1.3),
      ctx.physics.addStaticBox(new THREE.Vector3(b.x, b.y + ODD.shapeHeight, b.z), new THREE.Vector3(ODD.rimRadius, ODD.rimRadius, ODD.panelDepth / 2 + 0.01), panelQ),
    ];
  });

  // Each shape lies flat on its panel, a few centimetres in front of the dark face.
  const shapes = createShapeBatch(frame);
  const shapeAt = base.map((b) =>
    new THREE.Vector3(b.x, b.y + ODD.shapeHeight, b.z).addScaledVector(frame.normal, PANEL_FACE + ODD.shapeLift),
  );
  shapeAt.forEach((p, i) => shapes.setCenter(i, p));
  env.add(shapes.mesh, VisionLayer.WeakOnly);

  const confetti = new GlassesConfetti(56, 11);
  env.add(confetti.mesh, VisionLayer.Both);

  // ── state ──
  let level = 0;
  let round: Round = makeRound(0, env.rng);
  let phase: Phase = 'ask';
  let phaseT = 0;
  let fade = 1;
  let time = 0;
  let pressed = -1;
  let lastHit = false;
  let hits = 0;
  let misses = 0;
  let gems = 0;
  const squash = [0, 0, 0];
  const wobble = [0, 0, 0];
  const flash = [0, 0, 0];

  const tierLook = (tier: GlassesTier): { level: number; opacity: number; size: number } => {
    const p = withChallenge(tier, env.challenge());
    const k = Math.max(ODD.minChallengeSize, Math.min(1, p.size / TIERS[tier].size));
    return { level: p.level, opacity: p.opacity, size: k };
  };

  function applyRound(): void {
    const look = tierLook(round.tier);
    shapes.setShapes(shapesOf(round), round.detail, look.size);
    shapes.setLook(look.level, look.opacity);
    for (let i = 0; i < 3; i++) shapes.setWin(i, 0);
    shapes.setFade(fade);
    shapes.commit();
  }

  function newRound(atOnce: boolean): void {
    round = makeRound(level, env.rng);
    phase = 'ask';
    phaseT = 0;
    pressed = -1;
    fade = atOnce ? 1 : 0;
    applyRound();
  }

  function clearFx(): void {
    for (let i = 0; i < 3; i++) {
      squash[i] = 0;
      wobble[i] = 0;
      flash[i] = 0;
      set.pose(i, 0, 0, 0, time);
    }
    set.commit();
    confetti.clear();
  }

  function press(i: number): void {
    if (phase !== 'ask' || !env.isActive()) return;
    const hit = i === round.answer;
    const tier = round.tier;
    pressed = i;
    lastHit = hit;
    phase = 'feedback';
    phaseT = 0;
    squash[i] = 1;
    ctx.audio.play('click');
    env.result(tier, hit);
    if (hit) {
      hits++;
      const n = gemsForTier(tier);
      gems += n;
      flash[i] = 1;
      const b = base[i];
      confetti.burst(new THREE.Vector3(b.x, b.y + ODD.capBottom + ODD.capHeight + 0.2, b.z), 40, 1);
      env.pay(n);
    } else {
      misses++;
      wobble[i] = 1;
      ctx.audio.play('boing', { pitch: 0.8 });
    }
    level = nextLevel(level, hit);
  }

  const promptAt = base.map((b) => new THREE.Vector3(b.x, b.y + ODD.capBottom + ODD.capHeight + 0.1, b.z));

  const prompts: Interactable[] = promptAt.map((_, i) => ({
    id: `glasses-oddone-${i}`,
    position: () => promptAt[i],
    radius: ODD.promptRadius,
    icon: 'hand',
    // The same rule for all three: never depends on which one is odd.
    enabled: () => phase === 'ask' && env.isActive(),
    onUse: () => press(i),
  }));
  const offs = prompts.map((p) => ctx.interactions.add(p));

  applyRound();

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      level = 0;
      hits = 0;
      misses = 0;
      gems = 0;
      time = 0;
      clearFx();
      newRound(true);
    },
    setActive(on) {
      if (!on) {
        // Drop transient state: a pending feedback becomes a fresh round next time.
        clearFx();
        if (phase === 'feedback') newRound(true);
      }
    },
    update(dt) {
      time += dt;
      phaseT += dt;
      // Weak-eye look follows the challenge modifiers (size scale) live.
      if (phase === 'ask') {
        if (fade < 1) {
          fade = Math.min(1, fade + dt / ODD.fadeInSeconds);
          shapes.setFade(fade);
        }
      } else {
        // Burst ring on the odd one (both after a hit and after a miss: the answer is given).
        const w = Math.min(1, phaseT / 0.9);
        shapes.setWin(round.answer, w >= 1 ? 0 : w);
        if (phaseT > ODD.feedbackSeconds - 0.25) shapes.setFade(Math.max(0, (ODD.feedbackSeconds - phaseT) / 0.25));
        if (phaseT >= ODD.feedbackSeconds) newRound(false);
      }
      shapes.commit();
      for (let i = 0; i < 3; i++) {
        squash[i] = Math.max(0, squash[i] - dt * 2.6);
        wobble[i] = Math.max(0, wobble[i] - dt * 1.2);
        flash[i] = Math.max(0, flash[i] - dt * 1.4);
        const sq = squash[i] > 0 ? Math.sin(Math.min(1, squash[i]) * Math.PI * 0.5) : 0;
        set.pose(i, sq, wobble[i], flash[i], time);
      }
      set.commit();
      confetti.update(dt);
    },
    dispose() {
      for (const off of offs) off();
      for (const c of colliders) ctx.physics.removeCollider(c);
      for (const o of [set.pedestals, set.buttons, shapes.mesh, confetti.mesh]) env.remove(o);
      set.dispose();
      shapes.dispose();
      confetti.dispose();
    },
    debug: () => ({
      active: env.isActive(),
      phase,
      level,
      tier: round.tier,
      roundLevel: round.level,
      answer: round.answer,
      common: { ...round.common },
      odd: { ...round.odd },
      detail: { ...round.detail },
      pressed,
      lastHit,
      hits,
      misses,
      gems,
      fade,
      buttons: base.map((b) => [b.x, b.y + ODD.capBottom + ODD.capHeight, b.z]),
      shapes: shapeAt.map((p) => [p.x, p.y, p.z]),
      facing,
    }),
    force(params) {
      if (typeof params.level === 'number') {
        level = Math.max(0, Math.min(ODD.maxLevel, Math.round(params.level)));
        round = makeRound(level, env.rng, typeof params.answer === 'number' ? params.answer : undefined);
      } else if (typeof params.answer === 'number') {
        round = withAnswer(round, params.answer);
      }
      phase = 'ask';
      phaseT = 0;
      pressed = -1;
      fade = 1;
      clearFx();
      applyRound();
    },
    drawObjects: () => env.tracked(),
  };
}
