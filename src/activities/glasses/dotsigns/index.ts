/**
 * Dot-picture signs (kind `popOut`). A big both-eye sign carries a red-green dot picture: the
 * weak eye gets one dot pattern, the strong eye another (toolkit pair, exactly registered on the
 * dark panel). Each eye alone sees only random dots; the hidden shape exists only between the two
 * eyes. In front, a pedestal with three identical big buttons shows three shapes. Press the one
 * that is hidden in the dots (E / gamepad / touch through `ctx.interactions`) → confetti, a
 * flourish of the sign, fanfare, gems; a wrong one → wobble and boing. A new picture follows.
 *
 * Draw calls: the board (1) + one merged both-eye mesh: sign, pedestal and buttons (1) + weak dots
 * (1) + strong dots (1) + confetti while it flies (1).
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { createDotPicturePair, DOT_BOARD_GREY, TIERS, withChallenge } from '../../../vision/toolkit';
import type { DotPicturePair } from '../../../vision/toolkit';
import {
  boxGeo,
  Confetti,
  createAtlas,
  createPartMesh,
  createSiteMaterial,
  flatUv,
  nextTier,
  pivotMatrix,
  remapUv,
  siteFrame,
  squashCurve,
  wobbleCurve,
} from '../gates/kit';
import { CAM_BACK, chooseLayout } from '../gates/layout';
import type { LayoutSpec } from '../gates/layout';
import type { Mechanic, MechanicEnv } from '../types';
import { freshGuard, settle } from '../gates/guard';
import type { Guard } from '../gates/guard';
import { DOT_GEMS, DOT_TIERS, DOTSIGNS } from './constants';
import { shapeButtonCanvas } from './picto';
import { answerShape, isDotRound, makeDotRound } from './round';
import type { DotRound } from './round';

const grey = Math.round(DOT_BOARD_GREY * 255).toString(16).padStart(2, '0');
const SWATCHES = {
  stone: { diffuse: '#d8d0bd' },
  stoneDark: { diffuse: '#3a3f4b' },
  wood: { diffuse: '#a87a4c' },
  woodDark: { diffuse: '#5e3f24' },
  ink: { diffuse: '#121419' },
  // The dot board: no diffuse, constant self-light at the toolkit's DOT_BOARD_GREY (equal R and G).
  panel: { diffuse: '#000000', glow: `#${grey}${grey}${grey}` },
  gold: { diffuse: '#f2c14e' },
};

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const D = DOTSIGNS;
  const spec: LayoutSpec = {
    // Between two buttons: the default camera then shows all three beside the hero.
    hero: { x: D.buttonX[2] / 2, z: D.heroZ },
    targets: [
      ...[-1, 0, 1].flatMap((sx) => [-1, 0, 1].map((sy) => ({ x: sx * 1.15, z: D.signZ + 0.15, y: D.signY + sy * 1.15 }))),
      ...D.buttonX.map((x) => ({ x, z: D.pedZ, y: D.pedH + 0.12 })),
    ],
    footprint: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: (sx * D.pedW) / 2, z: D.pedZ + (sz * D.pedD) / 2 }))),
      ...[-1, 1].map((sx) => ({ x: (sx * D.frameW) / 2, z: D.signZ })),
      { x: 0, z: D.signZ },
      { x: 0, z: D.heroZ },
    ],
    radius: site.radius + 0.4,
    // The four picture corners must be clear of canopies from the play spot and the approach.
    canopyTargets: [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * 1.25, z: D.signZ + 0.15, y: D.signY + sy * 1.25 }))),
    // The approach (~7 m from the sign): the clearest of a few spots, kept in `lay.view`.
    views: [[0, 7], [-2.5, 6.6], [2.5, 6.6], [-4, 5.8], [4, 5.8]].map(([x, dz]) => ({ x, z: D.signZ + dz })),
    foreground: 1.5,
  };
  const lay = chooseLayout(ctx, site, spec, { refreshDecor: true });
  // The sign turns to face the default camera at the play spot squarely.
  const signYaw = Math.atan2(spec.hero.x, spec.hero.z + CAM_BACK - D.signZ);
  const signTurn = new THREE.Matrix4()
    .makeTranslation(0, 0, D.signZ)
    .multiply(new THREE.Matrix4().makeRotationY(signYaw))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -D.signZ));
  const frame = siteFrame(lay);
  const ground = (lx: number, lz: number): number => {
    const w = frame.toWorld(lx, lz);
    return env.groundAt(w.x, w.z) - site.y;
  };

  // ───────────── both-eye mesh (one draw call) ─────────────
  const atlas = createAtlas(SWATCHES);
  const material = createSiteMaterial(atlas);
  const U = (n: keyof typeof SWATCHES) => atlas.swatchUv(n);
  const signBase = Math.min(ground(-D.legX, D.signZ), ground(D.legX, D.signZ), ground(0, D.signZ));
  const pedBase = Math.min(ground(-D.pedW / 2, D.pedZ), ground(D.pedW / 2, D.pedZ), ground(0, D.pedZ));
  const signY = ground(0, D.heroZ) + D.signY;
  const signTop = signY + D.frameH / 2;
  const sink = 0.7;
  // Button centre (top of the pedestal) and face normal, site-local.
  const btnY = pedBase + D.pedH + 0.06;
  const btnZ = D.pedZ - 0.02;

  const parts: Record<string, THREE.BufferGeometry[]> = {};
  {
    const z = D.signZ;
    const list: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const h = signTop - signBase + sink;
      list.push(boxGeo(0.3, h, 0.3, sx * D.legX, signBase - sink + h / 2, z - 0.22, U('woodDark')));
      list.push(boxGeo(0.5, 0.45, 0.5, sx * D.legX, signBase + 0.08, z - 0.22, U('stoneDark')));
    }
    list.push(boxGeo(D.frameW, D.frameH, 0.16, 0, signY, z, U('wood')));
    list.push(boxGeo(D.panel, D.panel, 0.04, 0, signY, z + 0.09, U('panel')));
    list.push(boxGeo(D.frameW + 0.4, 0.16, 0.56, 0, signTop + 0.08, z - 0.05, U('woodDark')));
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      list.push(boxGeo(0.13, 0.13, 0.05, cx * (D.frameW / 2 - 0.08), signY + cy * (D.frameH / 2 - 0.08), z + 0.1, U('gold')));
    }
    for (const g of list) g.applyMatrix4(signTurn);
    parts.sign = list;
  }
  {
    const h = D.pedH + sink;
    parts.pedestal = [
      boxGeo(D.pedW, h, D.pedD, 0, pedBase - sink + h / 2, D.pedZ, U('stone')),
      boxGeo(D.pedW + 0.12, 0.1, D.pedD + 0.12, 0, pedBase + D.pedH + 0.0, D.pedZ, U('stoneDark')),
      boxGeo(D.pedW + 0.1, 0.22, D.pedD + 0.1, 0, pedBase + 0.11, D.pedZ, U('stoneDark')),
    ];
  }
  D.buttonX.forEach((x, i) => {
    const rim = new THREE.CylinderGeometry(D.buttonR + 0.05, D.buttonR + 0.09, 0.16, 36);
    flatUv(rim, U('ink'));
    const face = new THREE.CircleGeometry(D.buttonR, 36).rotateX(-Math.PI / 2).translate(0, 0.081, 0);
    remapUv(face, atlas.cellUv(i));
    for (const g of [rim, face]) g.rotateX(D.tilt).translate(x, btnY, btnZ);
    parts[`btn${i}`] = [rim, face];
  });
  const body = createPartMesh(parts, material, 'glasses:dotsigns');
  body.mesh.position.set(lay.x, site.y, lay.z);
  body.mesh.rotation.y = lay.yaw;
  body.mesh.updateMatrixWorld(true);
  env.add(body.mesh, VisionLayer.Both);

  // ───────────── colliders ─────────────
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lay.yaw);
  const colliders: ReturnType<typeof ctx.physics.addStaticBox>[] = [];
  const addBox = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
    const w = frame.toWorld(lx, lz);
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(w.x, site.y + ly, w.z), new THREE.Vector3(hx, hy, hz), rot));
  };
  // The sign as one solid block (no squeezing under it) and the pedestal.
  addBox(0, (signBase - sink + signTop) / 2, D.signZ - 0.1, D.frameW / 2 + 0.05, (signTop - signBase + sink) / 2, 0.24);
  addBox(0, pedBase - sink / 2 + D.pedH / 2, D.pedZ, D.pedW / 2 + 0.05, (D.pedH + sink) / 2, D.pedD / 2 + 0.05);

  // ───────────── the dot picture (weak quad + strong quad, exactly registered) ─────────────
  const dotsAt = { lx: 0, ly: signY, lz: D.signZ + 0.11 + 0.025 };
  const weakRoot = new THREE.Group();
  const strongRoot = new THREE.Group();
  weakRoot.name = 'glasses:dotsigns:weak';
  strongRoot.name = 'glasses:dotsigns:strong';
  for (const r of [weakRoot, strongRoot]) r.matrixAutoUpdate = false;
  env.add(weakRoot, VisionLayer.WeakOnly);
  env.add(strongRoot, VisionLayer.StrongOnly);
  let pair: DotPicturePair | null = null;
  let pairCells = 0;

  const flourishM = new THREE.Matrix4();
  const rootM = new THREE.Matrix4();
  const offM = signTurn.clone().multiply(new THREE.Matrix4().makeTranslation(dotsAt.lx, dotsAt.ly, dotsAt.lz));
  /** Layer roots = site frame × sign animation × the picture's spot (keeps both quads on the panel). */
  function placeRoots(anim: THREE.Matrix4 | null): void {
    rootM.copy(body.mesh.matrixWorld);
    if (anim) rootM.multiply(anim);
    rootM.multiply(offM);
    for (const r of [weakRoot, strongRoot]) {
      r.matrix.copy(rootM);
      r.matrixWorldNeedsUpdate = true;
      r.updateMatrixWorld(true);
    }
  }
  placeRoots(null);

  const confetti = new Confetti(90);
  env.add(confetti.mesh, VisionLayer.Both);
  let fxSeed = 0x85ebca6b;
  const fxRng = (): number => {
    fxSeed = (fxSeed + 0x6d2b79f5) >>> 0;
    let t = fxSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ───────────── state ─────────────
  let round: DotRound = makeDotRound(env.rng);
  let roundNo = 0;
  let state: 'open' | 'done' = 'open';
  let tier: GlassesTier = 1;
  let doneT = 0;
  let chosen = -1;
  let hits = 0;
  let misses = 0;
  let gems = 0;
  let active = false;
  let lastResult: { tier: GlassesTier; hit: boolean; button: number } | null = null;
  let flourish = 1;
  let guard: Guard = freshGuard();
  /** Seconds from the answer to the next picture (D.next after a hit, the nap after a miss). */
  let wait: number = D.next;
  /** Buttons sunk into the pedestal during a nap (0..1, eased). */
  let btnSink = 0;
  const btnAnim = D.buttonX.map(() => ({ press: 1, wobble: 1, bob: 1 }));

  function drawButtons(): void {
    round.shapes.forEach((s, i) => {
      const src = shapeButtonCanvas(s);
      atlas.drawCell(i, (g) => g.drawImage(src, 0, 0, 256, 256), 0.34);
    });
  }

  function applyDots(): void {
    const t = DOT_TIERS[tier];
    const p = withChallenge(tier, env.challenge());
    // Smaller dots with the challenge's size factor, never below 0.55 of a cell.
    const dotScale = Math.max(0.55, t.dotScale * Math.min(1, 0.6 + 0.4 * (p.size / TIERS[tier].size)));
    if (!pair || pairCells !== t.cells) {
      if (pair) {
        weakRoot.remove(pair.weak);
        strongRoot.remove(pair.strong);
        pair.dispose();
      }
      pair = createDotPicturePair({ shape: answerShape(round), seed: round.seed, size: D.picture, cells: t.cells, dotScale, level: p.level, opacity: p.opacity, facing: 'wall' });
      pairCells = t.cells;
      weakRoot.add(pair.weak);
      strongRoot.add(pair.strong);
    } else {
      pair.setPicture(answerShape(round), round.seed);
      pair.set({ dotScale, level: p.level, opacity: p.opacity });
    }
    placeRoots(null);
  }

  function applyRound(): void {
    state = 'open';
    chosen = -1;
    doneT = 0;
    drawButtons();
    applyDots();
  }

  function newRound(): void {
    round = makeDotRound(env.rng);
    roundNo++;
    applyRound();
  }

  function clearAnims(): void {
    flourish = 1;
    btnSink = 0;
    body.setPart('sign', null);
    placeRoots(null);
    btnAnim.forEach((a, i) => {
      a.press = a.wobble = a.bob = 1;
      body.setPart(`btn${i}`, null);
    });
  }

  function press(i: number): void {
    if (state !== 'open') return;
    const hit = i === round.answer;
    const t = tier;
    chosen = i;
    state = 'done';
    doneT = 0;
    lastResult = { tier: t, hit, button: i };
    btnAnim[i].press = 0;
    const settled = settle(guard, hit, DOT_GEMS[t], D.nap);
    guard = settled.guard;
    wait = hit ? D.next : settled.nap;
    if (hit) {
      hits++;
      gems += settled.gems;
      env.pay(settled.gems);
      ctx.audio.play('click');
      ctx.audio.play('fanfare');
      flourish = 0;
      const top = frame.toWorld(0, D.signZ + 0.3);
      confetti.burst(top.x, site.y + signTop + 0.2, top.z, fxRng, 70, 5);
    } else {
      misses++;
      btnAnim[i].wobble = 0;
      ctx.audio.play('boing', { volume: 0.55, pitch: 0.8 });
      // After the answer: the right button bobs to show which one it was.
      btnAnim[round.answer].bob = 0;
    }
    env.result(t, hit);
    tier = nextTier(t, hit);
  }

  const m4 = new THREE.Matrix4();
  function animate(dt: number): void {
    if (flourish < 1) {
      flourish = Math.min(1, flourish + dt / D.flourish);
      if (flourish >= 1) {
        body.setPart('sign', null);
        placeRoots(null);
      } else {
        const s = squashCurve(flourish);
        const lift = Math.sin(flourish * Math.PI) * 0.25;
        const roll = Math.sin(flourish * Math.PI * 4) * (1 - flourish) * 0.05;
        pivotMatrix(0, signBase, D.signZ, s.sxz, s.sy, 1, roll, lift, flourishM);
        body.setPart('sign', flourishM);
        placeRoots(flourishM);
      }
    }
    // Nap after a miss: the buttons sink into the pedestal (prompts are off while state is done).
    const sinkTo = state === 'done' && !lastResult?.hit && doneT > 0.9 && doneT < wait - 0.4 ? 1 : 0;
    const sinkWas = btnSink;
    btnSink += (sinkTo - btnSink) * Math.min(1, dt * 5);
    if (Math.abs(btnSink - sinkTo) < 1e-3) btnSink = sinkTo;
    const sinking = btnSink !== sinkWas || btnSink > 0;
    btnAnim.forEach((a, i) => {
      if (a.press >= 1 && a.wobble >= 1 && a.bob >= 1 && !sinking) {
        return;
      }
      a.press = Math.min(1, a.press + dt / D.press);
      a.wobble = Math.min(1, a.wobble + dt / D.wobble);
      a.bob = Math.min(1, a.bob + dt / 1.2);
      if (a.press >= 1 && a.wobble >= 1 && a.bob >= 1 && btnSink === 0) {
        body.setPart(`btn${i}`, null);
        return;
      }
      const down = (a.press < 1 ? -Math.sin(a.press * Math.PI) * 0.07 : 0) - btnSink * 0.16;
      const bob = a.bob < 1 ? Math.abs(Math.sin(a.bob * Math.PI * 3)) * (1 - a.bob) * 0.22 : 0;
      const k = a.press < 1 ? 1 + Math.sin(a.press * Math.PI) * 0.12 : 1;
      pivotMatrix(D.buttonX[i], btnY, btnZ, k, 1 / k, k, wobbleCurve(a.wobble) * 2.5, down + bob, m4);
      body.setPart(`btn${i}`, m4);
    });
  }

  // ───────────── the three E prompts (identical: same radius, icon and enabled state) ─────────────
  const btnWorld = D.buttonX.map((x) => {
    const w = frame.toWorld(x, btnZ);
    return new THREE.Vector3(w.x, site.y + btnY, w.z);
  });
  const offs = btnWorld.map((p, i) => {
    const target: Interactable = {
      id: `glasses-dotsigns-${i}`,
      position: () => p.clone(),
      radius: D.reach,
      icon: 'hand',
      enabled: () => state === 'open',
      onUse: () => press(i),
    };
    return ctx.interactions.add(target);
  });

  function reset(): void {
    tier = 1;
    guard = freshGuard();
    wait = D.next;
    hits = 0;
    misses = 0;
    gems = 0;
    roundNo = 0;
    lastResult = null;
    confetti.clear();
    clearAnims();
    newRound();
  }

  reset();

  return {
    id: env.id,
    kind: env.kind,
    reset,
    setActive(on) {
      active = on;
      if (!on) {
        confetti.clear();
        clearAnims();
        if (state === 'done') newRound();
      }
    },
    update(dt) {
      animate(dt);
      confetti.update(dt);
      if (state === 'done') {
        doneT += dt;
        if (doneT >= wait) newRound();
      }
    },
    dispose() {
      for (const off of offs) off();
      for (const c of colliders) ctx.physics.removeCollider(c);
      colliders.length = 0;
      for (const o of [body.mesh, weakRoot, strongRoot, confetti.mesh]) env.remove(o);
      body.dispose();
      material.dispose();
      atlas.dispose();
      pair?.dispose();
      confetti.dispose();
    },
    debug() {
      const pt = (lx: number, lz: number): { x: number; y: number; z: number } => {
        const w = frame.toWorld(lx, lz);
        return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
      };
      return {
        active,
        state,
        tier,
        round: roundNo,
        answer: round.answer,
        answerShape: answerShape(round),
        shapes: [...round.shapes],
        seed: round.seed,
        cells: pairCells,
        chosen,
        hits,
        misses,
        gems,
        lastResult,
        guard: { ...guard },
        wait,
        sink: btnSink,
        confetti: confetti.live,
        gemsPerTier: { ...DOT_GEMS },
        yaw: lay.yaw,
        buttons: btnWorld.map((b) => ({ x: b.x, y: b.y, z: b.z })),
        // Where to stand to press each button (in front of the pedestal).
        stand: D.buttonX.map((x) => pt(x, D.heroZ)),
        // The viewing spot the layout was chosen for (between the middle and the right button).
        view: pt(D.buttonX[2] / 2, D.heroZ),
        // The approach spot the layout keeps clear (the sign seen from ~7 m).
        approach: pt(lay.view?.x ?? 0, lay.view?.z ?? D.signZ + 7),
        approachYaw: (() => {
          const a = frame.toWorld(lay.view?.x ?? 0, lay.view?.z ?? D.signZ + 7);
          const t = frame.toWorld(0, D.signZ);
          return Math.atan2(t.x - a.x, t.z - a.z);
        })(),
        layout: { shift: lay.shift, turn: lay.turn, problems: lay.problems, notes: lay.notes, ms: lay.ms },
        sign: { ...pt(0, D.signZ), y: site.y + signY },
      };
    },
    force(params) {
      if (typeof params.tier === 'number') tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
      if (params.newRound) {
        newRound();
        return;
      }
      const r = { shapes: params.shapes ?? round.shapes, answer: params.answer ?? round.answer, seed: params.seed ?? round.seed };
      if (isDotRound(r)) round = { shapes: [...r.shapes], answer: r.answer, seed: r.seed };
      clearAnims();
      confetti.clear();
      applyRound();
    },
    drawObjects: () => env.tracked(),
  };
}

