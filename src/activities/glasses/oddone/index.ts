/**
 * Odd one out pedestals (kind `tellApart`).
 *
 * Three chunky both-eye pedestals in a gentle arc, each with the same big round button (E) and the
 * same dark round panel on a pole. On each panel lies a weak-eye shape: two alike, one different.
 * Press the button under the different one: the button squashes, the pedestal flashes, confetti,
 * gems. A wrong button wobbles with a boing, then the pedestals take a friendly nap (buttons sink,
 * no prompt) so random pressing does not pay (./logic.ts `OddOneGame`). A per-session staircase
 * makes the difference finer after hits and coarser after misses.
 *
 * The layout is shifted/turned inside the site at build time (`../gates/layout.ts`) so the
 * default camera behind a hero at the buttons sees all three panels, with no board or tree between.
 *
 * Red-green rule: the shapes are the ONLY place the answer lives (WeakOnly layer). Pedestals,
 * panels, buttons and prompts are identical for every answer; flash, wobble, nap and confetti come
 * only after a press. Draw calls: board 1 + pedestals 1 + buttons 1 + shapes 1 + confetti 1 = 5.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { TIERS, withChallenge } from '../../../vision/toolkit';
import { siteFrame } from '../gates/kit';
import { chooseLayout } from '../gates/layout';
import type { LayoutSpec } from '../gates/layout';
import type { Mechanic, MechanicEnv } from '../types';
import { GlassesConfetti } from './confetti';
import { ODD } from './constants';
import { makeRound, OddOneGame, shapesOf, withAnswer } from './logic';
import { createPedestals, panelFrame, PANEL_FACE } from './pedestals';
import { createShapeBatch } from './shapes';

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const P = ODD.pedestals;
  const heroZ = P[1][1] + ODD.standOff;

  // ── layout: where in the site the default camera sees all three panels ──
  const spec: LayoutSpec = {
    hero: { x: 0, z: heroZ },
    targets: P.flatMap(([x, z]) => [
      { x: x - ODD.panelRadius, z, y: ODD.shapeHeight },
      { x: x + ODD.panelRadius, z, y: ODD.shapeHeight },
      { x, z, y: ODD.shapeHeight + ODD.panelRadius },
      { x, z, y: ODD.shapeHeight - ODD.panelRadius },
    ]),
    footprint: [...P.flatMap(([x, z]) => [-1, 1].map((s) => ({ x: x + s * 0.6, z }))), { x: 0, z: heroZ }],
    radius: site.radius + 0.4,
  };
  // Prefer a layout that is also clear from a few metres further back (the approach); fall back
  // to the one that is clear from the buttons.
  const far = chooseLayout(ctx, site, { ...spec, hero: { x: 0, z: heroZ + ODD.approachBack } });
  const lay = far.problems === 0 ? far : chooseLayout(ctx, site, spec);
  const lf = siteFrame(lay);
  const facing = lay.yaw; // pedestals face the hero spot (layout +Z)

  // ── build ──
  const base = P.map(([lx, lz]) => {
    const p = lf.toWorld(lx, lz);
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
  const shapeAt = base.map((b) => new THREE.Vector3(b.x, b.y + ODD.shapeHeight, b.z).addScaledVector(frame.normal, PANEL_FACE + ODD.shapeLift));
  shapeAt.forEach((p, i) => shapes.setCenter(i, p));
  env.add(shapes.mesh, VisionLayer.WeakOnly);

  const confetti = new GlassesConfetti(48, 11);
  env.add(confetti.mesh, VisionLayer.Both);

  // ── state ──
  const game = new OddOneGame(env.rng);
  let fade = 1;
  let time = 0;
  let sleep = 0; // 0..1 eased nap pose of the buttons
  const squash = [0, 0, 0];
  const wobble = [0, 0, 0];
  const flash = [0, 0, 0];

  const tierLook = (tier: GlassesTier): { level: number; opacity: number; size: number } => {
    const p = withChallenge(tier, env.challenge());
    const k = Math.max(ODD.minChallengeSize, Math.min(1, p.size / TIERS[tier].size));
    return { level: p.level, opacity: p.opacity, size: k };
  };

  function applyRound(): void {
    const r = game.round;
    const look = tierLook(r.tier);
    shapes.setShapes(shapesOf(r), r.detail, look.size);
    shapes.setLook(look.level, look.opacity);
    for (let i = 0; i < 3; i++) shapes.setWin(i, 0);
    shapes.setFade(fade);
    shapes.commit();
  }

  function pose(): void {
    for (let i = 0; i < 3; i++) {
      const sq = squash[i] > 0 ? Math.sin(Math.min(1, squash[i]) * Math.PI * 0.5) : 0;
      set.pose(i, Math.max(sq, sleep * 0.85), wobble[i], flash[i] - sleep * 0.35, time);
    }
    set.commit();
  }

  function clearFx(): void {
    for (let i = 0; i < 3; i++) squash[i] = wobble[i] = flash[i] = 0;
    sleep = game.nap > 0 ? 1 : 0;
    pose();
    confetti.clear();
  }

  function press(i: number): void {
    if (!env.isActive()) return;
    const r = game.press(i);
    if (!r) return;
    squash[i] = 1;
    ctx.audio.play('click');
    env.result(r.tier, r.hit);
    if (r.hit) {
      flash[i] = 1;
      const b = base[i];
      confetti.burst(new THREE.Vector3(b.x, b.y + ODD.capBottom + ODD.capHeight + 0.2, b.z), 36, 1);
      env.pay(r.gems);
    } else {
      wobble[i] = 1;
      ctx.audio.play('boing', { pitch: 0.8 });
    }
  }

  const promptAt = base.map((b) => new THREE.Vector3(b.x, b.y + ODD.capBottom + ODD.capHeight + 0.1, b.z));
  const prompts: Interactable[] = promptAt.map((_, i) => ({
    id: `glasses-oddone-${i}`,
    position: () => promptAt[i],
    radius: ODD.promptRadius,
    icon: 'hand',
    // The same rule for all three: never depends on which one is odd.
    enabled: () => game.canPress() && env.isActive(),
    onUse: () => press(i),
  }));
  const offs = prompts.map((p) => ctx.interactions.add(p));

  applyRound();

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      game.reset();
      time = 0;
      fade = 1;
      clearFx();
      applyRound();
    },
    setActive(on) {
      if (!on) {
        // Drop transient state: a pending feedback becomes a fresh round next time.
        if (game.phase === 'feedback') {
          game.newRound();
          fade = 1;
          applyRound();
        }
        clearFx();
      }
    },
    update(dt) {
      time += dt;
      const before = game.round;
      game.step(dt);
      if (game.round !== before) {
        fade = 0;
        applyRound();
      }
      if (game.phase === 'ask') {
        if (fade < 1) {
          fade = Math.min(1, fade + dt / ODD.fadeInSeconds);
          shapes.setFade(fade);
        }
      } else {
        // Burst ring on the odd one (both after a hit and after a miss: the answer is given).
        const w = Math.min(1, game.phaseT / 0.9);
        shapes.setWin(game.round.answer, w >= 1 ? 0 : w);
        if (game.phaseT > ODD.feedbackSeconds - 0.25) shapes.setFade(Math.max(0, (ODD.feedbackSeconds - game.phaseT) / 0.25));
      }
      shapes.commit();
      // Nap pose: the buttons sink once the feedback is over, and wake up when the nap ends.
      const napping = game.nap > 0 && game.phase === 'ask';
      sleep = Math.max(0, Math.min(1, sleep + (napping ? dt * 3 : -dt * 4)));
      for (let i = 0; i < 3; i++) {
        squash[i] = Math.max(0, squash[i] - dt * 2.6);
        wobble[i] = Math.max(0, wobble[i] - dt * 1.2);
        flash[i] = Math.max(0, flash[i] - dt * 1.4);
      }
      pose();
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
    debug: () => {
      const hero = lf.toWorld(0, heroZ);
      return {
        active: env.isActive(),
        phase: game.phase,
        level: game.level,
        tier: game.round.tier,
        roundLevel: game.round.level,
        answer: game.round.answer,
        common: { ...game.round.common },
        odd: { ...game.round.odd },
        detail: { ...game.round.detail },
        pressed: game.pressed,
        lastHit: game.lastHit,
        nap: game.nap,
        missStreak: game.missStreak,
        hits: game.hits,
        misses: game.misses,
        gems: game.gems,
        fade,
        buttons: base.map((b) => [b.x, b.y + ODD.capBottom + ODD.capHeight, b.z]),
        shapes: shapeAt.map((p) => [p.x, p.y, p.z]),
        /** Where a child stands to press the middle button (layout +Z of it), facing the pedestals. */
        stand: [hero.x, env.groundAt(hero.x, hero.z), hero.z],
        facing,
        layout: { shift: lay.shift, turn: lay.turn, problems: lay.problems },
      };
    },
    force(params) {
      if (typeof params.level === 'number') {
        game.level = Math.max(0, Math.min(ODD.maxLevel, Math.round(params.level)));
        game.round = makeRound(game.level, env.rng, typeof params.answer === 'number' ? params.answer : undefined);
      } else if (typeof params.answer === 'number') {
        game.round = withAnswer(game.round, params.answer);
      }
      if (typeof params.nap === 'number') game.nap = Math.max(0, params.nap);
      game.phase = 'ask';
      game.phaseT = 0;
      game.pressed = -1;
      fade = 1;
      clearFx();
      applyRound();
    },
    drawObjects: () => env.tracked(),
  };
}
