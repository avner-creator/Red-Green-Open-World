/**
 * Odd one out (kind `tellApart`), on the booth kit (../booth/README.md).
 *
 * A game booth (marquee, demo, 5 lamps) stands left of three chunky both-eye pedestals; in front of
 * them a glowing press pad. Stand on the pad and press Use → 3-2-1-GO → the three dark panels show a
 * weak-eye shape each: two alike, one different. Press the button under the different one → ✓, a
 * bright lamp, the button squashes, the pedestal flashes; a wrong one → ✗, a dim lamp, a wobble.
 * 5 tries a round, straight one after the other; 3 or more right → lamps chase, fanfare, the prize
 * flies out (5 of 5 is the jackpot). A staircase runs through every try of the session: finer after
 * a hit, coarser after a miss (other shape → arrow direction → ring gap side → narrower gap,
 * smaller shape); the try's tier follows it (./logic.ts).
 *
 * The layout is shifted/turned inside the site at build time (`../gates/layout.ts`) so the default
 * camera behind a hero on the pad sees the three panels and the booth's lamps.
 *
 * Red-green rule: the shapes are the ONLY place the answer lives (WeakOnly layer). Booth, pad,
 * pedestals, panels, buttons, prompts and lamps are identical for every answer; flash, wobble, the
 * ✓ / ✗ pop and the burst ring (weak layer) come only after a press. Between rounds the panels show
 * the same soft circle on all three (weak eye only), so the magic pictures are there to find.
 * Draw calls: booth 1 + pedestals 1 + buttons 1 + shapes 1 (+ the kit's fx 2 during a round) ≤ 6.
 */
import * as THREE from 'three';
import { MARQUEE, PAD_TOP } from '../booth/geometry';
import { pickPromptSpot } from '../booth/view';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { TIERS, withChallenge } from '../../../vision/toolkit';
import type { BoothSpec } from '../booth/types';
import { siteFrame } from '../gates/kit';
import { chooseLayout } from '../gates/layout';
import type { LayoutSpec } from '../gates/layout';
import type { Mechanic, MechanicEnv } from '../types';
import { ODD, ODD_BOOTH, ODD_RULES } from './constants';
import { ODD_DEMO } from './demo';
import { makeRound, OddStaircase, shapesOf, withAnswer } from './logic';
import type { Round, ShapeSpec } from './logic';
import { createPedestals, panelFrame, PANEL_FACE } from './pedestals';
import { createShapeBatch } from './shapes';

/** The idle look: the same soft circle on all three panels. */
const IDLE_SHAPES: readonly ShapeSpec[] = [0, 1, 2].map(() => ({ kind: 'circle', dir: 0 }));

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const P = ODD.pedestals;
  const mq = ODD_BOOTH.marquee;
  const mqPt = (lx: number, lz: number): { x: number; z: number } => ({
    x: mq.x + lx * Math.cos(mq.yaw) + lz * Math.sin(mq.yaw),
    z: mq.z - lx * Math.sin(mq.yaw) + lz * Math.cos(mq.yaw),
  });
  const pad = ODD.pad;

  // ── layout: where in the site the default camera from the pad sees the panels and the lamps ──
  const spec: LayoutSpec = {
    hero: { x: pad.x, z: pad.z },
    targets: [
      ...P.flatMap(([x, z]) => [
        { x: x - ODD.panelRadius, z, y: ODD.shapeHeight },
        { x: x + ODD.panelRadius, z, y: ODD.shapeHeight },
        { x, z, y: ODD.shapeHeight + ODD.panelRadius },
        { x, z, y: ODD.shapeHeight - ODD.panelRadius },
      ]),
      // The booth's lamp row.
      ...[-0.6, 0.6].map((lx) => ({ ...mqPt(lx, 0), y: MARQUEE.lampY })),
    ],
    footprint: [
      ...P.flatMap(([x, z]) => [-1, 1].map((s) => ({ x: x + s * 0.6, z }))),
      ...[-1, 1].map((s) => ({ x: pad.x + s * pad.r, z: pad.z })),
      { x: pad.x, z: pad.z + pad.r },
      // The booth's poles and counter.
      ...[-1.6, 1.6].flatMap((lx) => [0.1, -0.5].map((lz) => mqPt(lx, lz))),
    ],
    radius: site.radius + 0.4,
    canopyTargets: [P[0], P[2]].flatMap(([x, z]) => [-1, 1].map((sy) => ({ x, z, y: ODD.shapeHeight + sy * ODD.panelRadius }))),
    // The approach (~6–7 m in front of the pad): the clearest of a few spots, kept in `lay.view`.
    views: [[0, 6.5], [-2.5, 6], [2.5, 6], [-4, 5.2], [4, 5.2]].map(([x, dz]) => ({ x: pad.x + x, z: pad.z + dz })),
    foreground: 1.5,
    // The booth faces where children arrive (the end of the world's stepping-stone trail).
    arrival: site.arrival,
    arrivalTargets: [
      { ...mqPt(0, 0.2), y: MARQUEE.lampY },
      { ...mqPt(0, 0.2), y: MARQUEE.bannerY },
      { ...mqPt(-0.8, 0.2), y: MARQUEE.boardY },
      { x: pad.x, z: pad.z, y: 0.5 },
    ],
  };
  const lay = chooseLayout(ctx, site, spec, { refreshDecor: true });
  const lf = siteFrame(lay);
  const facing = lay.yaw; // pedestals face the pad (layout +Z)
  const ground = (lx: number, lz: number): number => {
    const w = lf.toWorld(lx, lz);
    return env.groundAt(w.x, w.z) - site.y;
  };

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

  // ── state ──
  const stairs = new OddStaircase();
  let round: Round = makeRound(0, env.rng);
  /** 'idle': no question (booth idle, countdown, celebration); 'open': a try asks; 'done': answered. */
  let state: 'idle' | 'open' | 'done' = 'idle';
  let fade: number = ODD.idleFade;
  let doneT = 0;
  let time = 0;
  let sleep = 1; // 0..1 eased "resting" pose of the buttons (between rounds)
  let pressed = -1;
  let lastHit = false;
  let hits = 0;
  let misses = 0;
  let lastResult: { tier: GlassesTier; hit: boolean; button: number } | null = null;
  const squash = [0, 0, 0];
  const wobble = [0, 0, 0];
  const flash = [0, 0, 0];

  const tierLook = (tier: GlassesTier): { level: number; opacity: number; size: number } => {
    const p = withChallenge(tier, env.challenge());
    const k = Math.max(ODD.minChallengeSize, Math.min(1, p.size / TIERS[tier].size));
    return { level: p.level, opacity: p.opacity, size: k };
  };

  /** Put the current state on the shapes (the round's shapes, or the idle look). */
  function applyShapes(): void {
    if (state === 'idle') {
      const look = tierLook(1);
      shapes.setShapes(IDLE_SHAPES, makeRound(0, () => 0).detail, 0.72);
      shapes.setLook(look.level, look.opacity);
    } else {
      const look = tierLook(round.tier);
      shapes.setShapes(shapesOf(round), round.detail, look.size);
      shapes.setLook(look.level, look.opacity);
    }
    for (let i = 0; i < 3; i++) shapes.setWin(i, 0);
    shapes.setFade(fade);
    shapes.commit();
  }

  function pose(): void {
    for (let i = 0; i < 3; i++) {
      const sq = squash[i] > 0 ? Math.sin(Math.min(1, squash[i]) * Math.PI * 0.5) : 0;
      set.pose(i, Math.max(sq, sleep * 0.6), wobble[i], flash[i] - sleep * 0.3, time);
    }
    set.commit();
  }

  function clearFx(): void {
    for (let i = 0; i < 3; i++) squash[i] = wobble[i] = flash[i] = 0;
    pose();
  }

  function ask(): void {
    round = makeRound(stairs.current(), env.rng);
    state = 'open';
    pressed = -1;
    doneT = 0;
    fade = 0;
    applyShapes();
  }

  function goIdle(): void {
    state = 'idle';
    pressed = -1;
    // After a round (celebration) the circles come back once the booth is at rest again.
    fade = kit.phase() === 'idle' ? ODD.idleFade : 0;
    applyShapes();
  }

  // The play prompt (the Use button of the device in use) floats near the pedestals, in clear view
  // from the pad's camera: in the central safe area (never under the HUD), off the hero and off
  // the three panels. Picked once from the layout; it never depends on the answer.
  const look = { x: P[1][0], z: P[1][1] };
  const promptPick = (() => {
    const padP = { x: pad.x, y: ground(pad.x, pad.z) + PAD_TOP, z: pad.z };
    const keepClear = P.map(([x, z]) => ({ p: { x, y: ground(x, z) + ODD.shapeHeight, z }, size: ODD.rimRadius * 2 + 0.3 }));
    const cands: { x: number; y: number; z: number }[] = [];
    for (const z of [-2.6, -2.2, -3.0]) {
      for (const x of [P[0][0] + 1.2, P[1][0] + 1.2, P[0][0] - 1.0, P[2][0] + 1.0, P[1][0] - 1.2]) {
        for (const h of [1.6, 1.9, 1.3, 2.2, 2.6]) cands.push({ x, y: ground(x, z) + h, z });
      }
    }
    return pickPromptSpot(cands, { pad: padP, look, size: ODD.promptSize + 0.3, keepClear });
  })();
  // Booth spec heights are relative to the site's y: put the countdown on the middle panel's height.
  const boothSpec: BoothSpec = {
    ...ODD_BOOTH,
    playPromptAt: promptPick.at,
    playPromptSize: ODD.promptSize,
    countdown: ODD_BOOTH.countdown && { ...ODD_BOOTH.countdown, y: ODD_BOOTH.countdown.y + ground(P[1][0], P[1][1]) },
  };
  const kit = env.booth({
    frame: { x: lay.x, z: lay.z, yaw: lay.yaw },
    ground,
    spec: boothSpec,
    demo: ODD_DEMO,
    rules: ODD_RULES,
    look,
    hooks: {
      onTry() {
        ask();
      },
      onIdle() {
        goIdle();
      },
    },
  });

  function press(i: number): void {
    if (!env.isActive() || state !== 'open' || kit.phase() !== 'play') return;
    const hit = i === round.answer;
    pressed = i;
    lastHit = hit;
    state = 'done';
    doneT = 0;
    squash[i] = 1;
    lastResult = { tier: round.tier, hit, button: i };
    ctx.audio.play('click');
    if (hit) {
      hits++;
      flash[i] = 1;
    } else {
      misses++;
      wobble[i] = 1;
    }
    // The try's result carries the staircase's tier; the round's prize uses the kit's round tier.
    stairs.answer(hit);
    const [lx, lz] = P[i];
    kit.report(hit, { x: lx, y: ground(lx, lz) + ODD.capBottom + ODD.capHeight + 0.75, z: lz + 0.25 }, round.tier);
  }

  const promptAt = base.map((b) => new THREE.Vector3(b.x, b.y + ODD.capBottom + ODD.capHeight + 0.1, b.z));
  const prompts: Interactable[] = promptAt.map((_, i) => ({
    id: `glasses-oddone-${i}`,
    position: () => promptAt[i],
    radius: ODD.promptRadius,
    icon: 'hand',
    // The same rule for all three: never depends on which one is odd.
    enabled: () => state === 'open' && kit.phase() === 'play' && env.isActive(),
    onUse: () => press(i),
  }));
  const offs = prompts.map((p) => ctx.interactions.add(p));

  function reset(): void {
    stairs.reset();
    time = 0;
    hits = 0;
    misses = 0;
    lastResult = null;
    lastHit = false;
    clearFx();
    kit.reset();
    goIdle();
  }

  reset();

  const pt = (lx: number, lz: number): { x: number; y: number; z: number } => {
    const w = lf.toWorld(lx, lz);
    return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
  };

  return {
    id: env.id,
    kind: env.kind,
    reset,
    setActive(on) {
      kit.setActive(on);
      if (!on) clearFx();
    },
    update(dt) {
      time += dt;
      kit.update(dt);
      if (state === 'idle') {
        // The idle circles fade away while a round runs (countdown, celebration), back at rest.
        const to = kit.phase() === 'idle' ? ODD.idleFade : 0;
        if (fade !== to) {
          fade = to > fade ? Math.min(to, fade + dt * 2) : Math.max(to, fade - dt * 4);
          shapes.setFade(fade);
        }
      } else if (state === 'open') {
        if (fade < 1) {
          fade = Math.min(1, fade + dt / ODD.fadeInSeconds);
          shapes.setFade(fade);
        }
      } else if (state === 'done') {
        doneT += dt;
        // Burst ring on the odd one (after a hit and after a miss: the answer is given).
        const w = Math.min(1, doneT / 0.9);
        shapes.setWin(round.answer, w >= 1 ? 0 : w);
        const beat = kit.round.rules.beat;
        if (doneT > beat - ODD.fadeOutSeconds) shapes.setFade(Math.max(0, (beat - doneT) / ODD.fadeOutSeconds));
      }
      shapes.commit();
      // Buttons rest (sunk a little, dimmed) between rounds and pop up for play.
      const phase = kit.phase();
      const resting = !(phase === 'play' || phase === 'beat');
      sleep = Math.max(0, Math.min(1, sleep + (resting ? dt * 3 : -dt * 5)));
      for (let i = 0; i < 3; i++) {
        squash[i] = Math.max(0, squash[i] - dt * 2.6);
        wobble[i] = Math.max(0, wobble[i] - dt * 1.2);
        flash[i] = Math.max(0, flash[i] - dt * 1.4);
      }
      pose();
    },
    dispose() {
      for (const off of offs) off();
      for (const c of colliders) ctx.physics.removeCollider(c);
      kit.dispose();
      for (const o of [set.pedestals, set.buttons, shapes.mesh]) env.remove(o);
      set.dispose();
      shapes.dispose();
    },
    debug: () => {
      const stands = P.map(([x, z]) => pt(x, z + ODD.standOff));
      const k = kit.debug();
      return {
        active: env.isActive(),
        state,
        phase: kit.phase(),
        level: stairs.level,
        tier: round.tier,
        roundLevel: round.level,
        answer: round.answer,
        common: { ...round.common },
        odd: { ...round.odd },
        detail: { ...round.detail },
        pressed,
        lastHit,
        lastResult,
        hits,
        misses,
        gems: kit.round.totalGems,
        fade,
        sleep,
        kit: k,
        buttons: base.map((b) => [b.x, b.y + ODD.capBottom + ODD.capHeight, b.z]),
        shapes: shapeAt.map((p) => [p.x, p.y, p.z]),
        /** Where a child stands to press each button, and the middle one as [x, y, z] (older callers). */
        stands,
        stand: [stands[1].x, stands[1].y, stands[1].z],
        facing,
        pad: pt(pad.x, pad.z),
        /** A spot 2.6 m behind the pad (the camera then shows the pad, the panels and the booth). */
        padBack: pt(pad.x, pad.z + 2.6),
        booth: (() => {
          const b = kit.booth.build.marqueeBox;
          return pt((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
        })(),
        approach: pt(lay.view?.x ?? pad.x, lay.view?.z ?? pad.z + 6.5),
        /** A spot ~7 m behind the pad facing the booth and the pedestals (the whole booth in view). */
        celebrateView: (() => {
          const p = pt(pad.x - 1, pad.z + 7);
          const t = lf.toWorld(-1.4, -2.9);
          return { ...p, yaw: Math.atan2(t.x - p.x, t.z - p.z) };
        })(),
        /** A spot ~30 m out on the approach, facing the booth and the pedestals. */
        far: (() => {
          const p = pt(pad.x, pad.z + 28);
          const t = lf.toWorld(-1, -2.5);
          return { ...p, yaw: Math.atan2(t.x - p.x, t.z - p.z) };
        })(),
        layout: { shift: lay.shift, turn: lay.turn, problems: lay.problems, notes: lay.notes, ms: lay.ms },
        promptFits: promptPick.fits,
        promptAt: promptPick.at,
      };
    },
    force(params) {
      if (params.play) kit.forcePlay();
      if (params.start) kit.start();
      if (typeof params.pin === 'number') kit.pin(params.pin);
      if (typeof params.level === 'number') {
        stairs.level = Math.max(0, Math.min(ODD.maxLevel, Math.round(params.level)));
        if (state !== 'idle') {
          round = makeRound(stairs.level, env.rng, typeof params.answer === 'number' ? params.answer : undefined);
          state = 'open';
        }
      } else if (typeof params.answer === 'number' && state !== 'idle') {
        round = withAnswer(round, params.answer);
        state = 'open';
      }
      if (state !== 'idle' && (typeof params.level === 'number' || typeof params.answer === 'number')) {
        pressed = -1;
        doneT = 0;
        fade = 1;
        clearFx();
        applyShapes();
      }
    },
    drawObjects: () => env.tracked(),
  };
}
