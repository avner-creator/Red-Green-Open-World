/**
 * Dot-picture signs (kind `popOut`), on the booth kit (../booth/README.md).
 *
 * A game booth (marquee, demo, 5 lamps) stands behind-left of a big both-eye sign; in front of the
 * sign a pedestal with three big buttons, and behind them a glowing press pad. Stand on the pad and
 * press Use → 3-2-1-GO → the sign shows a red-green dot picture (the weak eye gets one dot pattern,
 * the strong eye another, exactly registered on the dark panel: each eye alone sees only random
 * dots, the hidden shape exists only between the two eyes) and the buttons show three shapes.
 * Press the one hidden in the dots (E / gamepad / touch through `ctx.interactions`) → ✓, a bright
 * lamp, the sign does a flourish; a wrong one → ✗, a dim lamp, a wobble, and the right button bobs.
 * 5 pictures a round, one straight after the other; 3 or more right → lamps chase, fanfare, the
 * prize flies out (5 of 5 is the jackpot). Finer pictures after 4 or 5 right, coarser after ≤ 2.
 *
 * Between rounds the sign is empty (dark panel) and the buttons are blank.
 * Draw calls: booth (1) + one merged both-eye mesh: sign, pedestal and buttons (1) + weak dots (1)
 * + strong dots (1) during a try (+ the kit's fx 2 during a round) ≤ 6.
 */
import * as THREE from 'three';
import { cellUv, KIT_CELL } from '../booth/cells';
import { MARQUEE, PAD_TOP } from '../booth/geometry';
import { padCamera, pickPromptSpot, screenRect } from '../booth/view';
import { VisionLayer } from '../../../types';
import type { GlassesTier, Interactable } from '../../../types';
import { createDotPicturePair, DOT_BOARD_GREY, FULL_SYMBOL_STYLE, TIERS, withChallenge } from '../../../vision/toolkit';
import type { DotPicturePair } from '../../../vision/toolkit';
import type { BoothSpec } from '../booth/types';
import { boxGeo, createAtlas, createPartMesh, createSiteMaterial, flatUv, pivotMatrix, remapUv, siteFrame, squashCurve, wobbleCurve } from '../gates/kit';
import { CAM_BACK, chooseLayout } from '../gates/layout';
import type { LayoutSpec } from '../gates/layout';
import type { Mechanic, MechanicEnv } from '../types';
import { DOT_BOOTH, DOT_RULES, DOT_TIERS, DOTSIGNS } from './constants';
import { DOT_DEMO } from './demo';
import { shapeButtonCanvas } from './picto';
import { answerShape, isDotRound, makeDotRound, standingButton } from './round';
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
  const mq = DOT_BOOTH.marquee;
  const mqPt = (lx: number, lz: number): { x: number; z: number } => ({
    x: mq.x + lx * Math.cos(mq.yaw) + lz * Math.sin(mq.yaw),
    z: mq.z - lx * Math.sin(mq.yaw) + lz * Math.cos(mq.yaw),
  });
  // Children come from the plaza (Pip leads them along the east road): the site's own frozen
  // heading (`FIXED_SITES`, +Z towards the approach) points there. QA r7 M3: turned to the park
  // path's trail end instead, the pad sat behind the booth for everyone coming from the plaza.
  // The booth, the sign's front and the pad face this point; the trail end from the park path
  // reaches the pad round the side (round-ended colliders, gaps between the pedestals).
  const approach = { x: site.x + Math.sin(site.yaw) * 20, z: site.z + Math.cos(site.yaw) * 20 };
  const spec: LayoutSpec = {
    // In line with the pad (between the middle and the right button): from there the default
    // camera shows all three buttons beside the hero.
    hero: { x: D.pad.x, z: D.heroZ },
    targets: [
      ...[-1, 0, 1].flatMap((sx) => [-1, 0, 1].map((sy) => ({ x: sx * 1.15, z: D.signZ + 0.15, y: D.signY + sy * 1.15 }))),
      ...D.buttonX.map((x) => ({ x, z: D.pedZ, y: D.pedH + 0.12 })),
      // The booth's lamp row.
      ...[-0.6, 0.6].map((lx) => ({ ...mqPt(lx, 0), y: MARQUEE.lampY })),
    ],
    footprint: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: (sx * D.pedW) / 2, z: D.pedZ + (sz * D.pedD) / 2 }))),
      ...[-1, 1].map((sx) => ({ x: (sx * D.frameW) / 2, z: D.signZ })),
      { x: 0, z: D.signZ },
      { x: 0, z: D.heroZ },
      // The start pad and the booth's poles and counter.
      ...[-1, 1].map((sx) => ({ x: D.pad.x + sx * D.pad.r, z: D.pad.z })),
      { x: D.pad.x, z: D.pad.z + D.pad.r },
      ...[-1.6, 1.6].flatMap((lx) => [0.1, -0.5].map((lz) => mqPt(lx, lz))),
    ],
    radius: site.radius + 0.4,
    // The four picture corners must be clear of canopies from the play spot and the approach.
    canopyTargets: [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * 1.25, z: D.signZ + 0.15, y: D.signY + sy * 1.25 }))),
    // The approach (~7 m from the sign): the clearest of a few spots, kept in `lay.view`.
    views: [[0, 7], [-2.5, 6.6], [2.5, 6.6], [-4, 5.8], [4, 5.8]].map(([x, dz]) => ({ x, z: D.signZ + dz })),
    foreground: 1.5,
    // The booth and the sign's front face where children arrive (the end of the stepping-stone trail).
    arrival: approach,
    arrivalTargets: [
      { ...mqPt(0, 0.2), y: MARQUEE.lampY },
      { ...mqPt(0, 0.2), y: MARQUEE.bannerY },
      { ...mqPt(-0.8, 0.2), y: MARQUEE.boardY },
      { x: D.pad.x, z: D.pad.z, y: 0.5 },
    ],
  };
  // A booth game has no pictogram board, so the board checks are moved out of the way.
  const searchSite = { ...site, board: { x: site.x + 5000, z: site.z } };
  const lay = chooseLayout(ctx, searchSite, spec, { refreshDecor: true });
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
    // One pedestal per button, with room to walk between them (QA r7 m9).
    parts.pedestal = D.buttonX.flatMap((x) => [
      boxGeo(D.pedEach, h, D.pedD, x, pedBase - sink + h / 2, D.pedZ, U('stone')),
      boxGeo(D.pedEach + 0.12, 0.1, D.pedD + 0.12, x, pedBase + D.pedH + 0.0, D.pedZ, U('stoneDark')),
      boxGeo(D.pedEach + 0.1, 0.22, D.pedD + 0.1, x, pedBase + 0.11, D.pedZ, U('stoneDark')),
    ]);
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

  // Pip's lead spot (QA r7 M3): in front of the start pad on the approach side, a straight clear
  // walk to the pad. An empty marker the buddy reads by name; no draw call.
  const leadMarker = new THREE.Object3D();
  leadMarker.name = 'glasses:dotsigns:lead';
  {
    const w = frame.toWorld(D.pad.x, D.pad.z + D.leadOut);
    leadMarker.position.set(w.x, env.groundAt(w.x, w.z), w.z);
  }
  ctx.scene.add(leadMarker);

  // ───────────── colliders ─────────────
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lay.yaw);
  const colliders: ReturnType<typeof ctx.physics.addStaticBox>[] = [];
  const addBox = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
    const w = frame.toWorld(lx, lz);
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(w.x, site.y + ly, w.z), new THREE.Vector3(hx, hy, hz), rot));
  };
  /**
   * A block along local X with ROUND ends (a box between two upright cylinders): the hero slides
   * round its corners instead of sticking on them (QA r7 M3: stuck 11–21 s at the pedestal corner).
   */
  const addRounded = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
    const core = Math.max(0.01, hx - hz);
    addBox(lx, ly, lz, core, hy, hz);
    for (const sx of [-1, 1]) {
      const w = frame.toWorld(lx + sx * core, lz);
      colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(w.x, site.y + ly, w.z), hy, hz));
    }
  };
  // The sign as one solid block (no squeezing under it; turned with the sign) and the pedestals.
  {
    const hx = D.frameW / 2 + 0.05;
    const hz = 0.24;
    const hy = (signTop - signBase + sink) / 2;
    const ly = (signBase - sink + signTop) / 2;
    const core = hx - hz;
    const c = new THREE.Vector3(0, 0, D.signZ - 0.1).applyMatrix4(signTurn);
    const sRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lay.yaw + signYaw);
    const w = frame.toWorld(c.x, c.z);
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(w.x, site.y + ly, w.z), new THREE.Vector3(core, hy, hz), sRot));
    for (const sx of [-1, 1]) {
      const e = new THREE.Vector3(sx * core, 0, D.signZ - 0.1).applyMatrix4(signTurn);
      const we = frame.toWorld(e.x, e.z);
      colliders.push(ctx.physics.addStaticCylinder(new THREE.Vector3(we.x, site.y + ly, we.z), hy, hz));
    }
  }
  // The narrow slot between the sign and the pedestals' backs is filled (no one fits there), round
  // the sign's ends too: from behind the sign the hero slides along one smooth rounded block to the
  // front, never wedged between the sign's end and a pedestal.
  {
    // From the back of the (turned) sign to the pedestals' centre line: the sign's ends lie inside.
    const z0 = D.signZ - 0.1 - 0.24 - 0.3;
    const z1 = D.pedZ;
    addRounded(0, pedBase - sink / 2 + D.pedH / 2, (z0 + z1) / 2, D.pedW / 2 + 0.05, (D.pedH + sink) / 2, (z1 - z0) / 2 + 0.05);
  }
  for (const x of D.buttonX) addRounded(x, pedBase - sink / 2 + D.pedH / 2, D.pedZ, D.pedEach / 2 + 0.05, (D.pedH + sink) / 2, D.pedD / 2 + 0.05);

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

  // ───────────── state ─────────────
  let round: DotRound = makeDotRound(env.rng);
  let roundNo = 0;
  /** 'idle': no picture (booth idle, countdown, celebration); 'open': a try asks; 'done': answered. */
  let state: 'idle' | 'open' | 'done' = 'idle';
  let tier: GlassesTier = 1;
  let chosen = -1;
  let hits = 0;
  let misses = 0;
  let active = false;
  let lastResult: { tier: GlassesTier; hit: boolean; button: number } | null = null;
  let flourish = 1;
  const btnAnim = D.buttonX.map(() => ({ press: 1, wobble: 1, bob: 1 }));

  /** A blank button face (between rounds): the same dark disc and rim as the shape faces. */
  function drawBlank(g: CanvasRenderingContext2D): void {
    g.fillStyle = FULL_SYMBOL_STYLE.rim;
    g.fillRect(0, 0, 256, 256);
    g.beginPath();
    g.arc(128, 128, 116, 0, Math.PI * 2);
    g.fillStyle = FULL_SYMBOL_STYLE.board;
    g.fill();
  }

  function drawButtons(): void {
    if (state === 'idle') {
      for (let i = 0; i < 3; i++) atlas.drawCell(i, drawBlank, 0.2);
      return;
    }
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

  /** Show the current picture (a try is on). */
  function applyRound(): void {
    state = 'open';
    chosen = -1;
    drawButtons();
    applyDots();
    weakRoot.visible = strongRoot.visible = true;
  }

  function newRound(): void {
    round = makeDotRound(env.rng);
    roundNo++;
    applyRound();
  }

  function goIdle(): void {
    state = 'idle';
    chosen = -1;
    weakRoot.visible = strongRoot.visible = false;
    drawButtons();
  }

  function clearAnims(): void {
    flourish = 1;
    body.setPart('sign', null);
    placeRoots(null);
    btnAnim.forEach((a, i) => {
      a.press = a.wobble = a.bob = 1;
      body.setPart(`btn${i}`, null);
    });
  }

  // Booth spec heights are relative to the site's y: the countdown at the picture's height.
  // The play prompt (the device's Use button) floats beside the sign, in clear view from the pad's
  // camera: in the central safe area (never under the HUD), off the hero, the picture and the
  // buttons. Picked once from the layout; it never depends on the answer.
  const look = { x: D.pad.x, z: D.signZ };
  const promptPick = (() => {
    const padP = { x: D.pad.x, y: ground(D.pad.x, D.pad.z) + PAD_TOP, z: D.pad.z };
    const keepClear = [
      { p: { x: 0, y: signY, z: D.signZ }, size: D.panel + 0.1 },
      ...D.buttonX.map((x) => ({ p: { x, y: btnY, z: btnZ }, size: D.buttonR * 2 + 0.2 })),
    ];
    const cands: { x: number; y: number; z: number }[] = [];
    for (const z of [0.6, 1.0, 0.2]) {
      for (const x of [2.5, 2.8, -2.5, 3.1, -2.8, 2.2]) {
        for (const h of [2.4, 2.1, 1.8, 2.8, 1.5, 3.2]) cands.push({ x, y: ground(x, z) + h, z });
      }
    }
    // The Fun Pass chip reaches further in than `PROMPT_SAFE` on a small 16:9 screen (its left edge
    // at ≈0.6 of the width, down to ≈0.38): keep the prompt out of that corner too.
    const cam = padCamera(padP, look, 16 / 9);
    const offChip = cands.filter((c) => {
      const r = screenRect(c, D.promptSize + 0.3, cam);
      return !!r && (r.x1 < 0.58 || r.y0 > 0.4);
    });
    return pickPromptSpot(offChip.length ? offChip : cands, { pad: padP, look, size: D.promptSize + 0.3, keepClear });
  })();

  // The back of the sign is dressed (candy stripes and the magic-glasses mark, merged into the
  // booth's one draw), so it never reads as a blank wall from behind.
  const backDressing = ((): THREE.BufferGeometry[] => {
    const quad = (w: number, h: number, z: number, rect: readonly [number, number, number, number]): THREE.BufferGeometry => {
      const g = new THREE.PlaneGeometry(w, h).rotateY(Math.PI);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
      g.translate(0, signY, z);
      g.applyMatrix4(signTurn);
      return g;
    };
    const back = D.signZ - 0.085;
    return [
      quad(D.frameW - 0.12, D.frameH - 0.12, back, cellUv(KIT_CELL.stripes)),
      quad(1.7, 1.7, back - 0.02, cellUv(KIT_CELL.mark)),
    ];
  })();

  const boothSpec: BoothSpec = {
    ...DOT_BOOTH,
    playPromptAt: promptPick.at,
    playPromptSize: D.promptSize,
    countdown: DOT_BOOTH.countdown && { ...DOT_BOOTH.countdown, y: signY },
  };
  const kit = env.booth({
    frame: { x: lay.x, z: lay.z, yaw: lay.yaw },
    ground,
    spec: boothSpec,
    demo: DOT_DEMO,
    rules: DOT_RULES,
    look,
    extra: backDressing,
    hooks: {
      onTry(_i, t) {
        tier = t;
        clearAnims();
        newRound();
      },
      onIdle() {
        clearAnims();
        goIdle();
      },
    },
  });

  function press(i: number): void {
    if (state !== 'open' || kit.phase() !== 'play') return;
    const hit = i === round.answer;
    chosen = i;
    state = 'done';
    lastResult = { tier, hit, button: i };
    btnAnim[i].press = 0;
    ctx.audio.play('click');
    if (hit) {
      hits++;
      flourish = 0;
    } else {
      misses++;
      btnAnim[i].wobble = 0;
      // After the answer: the right button bobs to show which one it was.
      btnAnim[round.answer].bob = 0;
    }
    kit.report(hit, { x: D.buttonX[i], y: btnY + 0.75, z: btnZ + 0.15 });
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
    btnAnim.forEach((a, i) => {
      if (a.press >= 1 && a.wobble >= 1 && a.bob >= 1) return;
      a.press = Math.min(1, a.press + dt / D.press);
      a.wobble = Math.min(1, a.wobble + dt / D.wobble);
      a.bob = Math.min(1, a.bob + dt / 1.2);
      if (a.press >= 1 && a.wobble >= 1 && a.bob >= 1) {
        body.setPart(`btn${i}`, null);
        return;
      }
      const down = a.press < 1 ? -Math.sin(a.press * Math.PI) * 0.07 : 0;
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
  /** The button E would answer now (`standingButton` in the layout frame), or -1. */
  const heroButton = (): number => {
    const h = frame.toLocal(ctx.player.position.x, ctx.player.position.z);
    return standingButton(h.x, h.z, ctx.player.yaw - lay.yaw);
  };
  const offs = btnWorld.map((p, i) => {
    const target: Interactable = {
      id: `glasses-dotsigns-${i}`,
      position: () => p.clone(),
      radius: D.reach,
      icon: 'hand',
      // Only the pedestal the hero stands at and faces (QA r7 m9): never one walked past.
      enabled: () => state === 'open' && kit.phase() === 'play' && active && heroButton() === i,
      onUse: () => press(i),
    };
    return ctx.interactions.add(target);
  });

  function reset(): void {
    tier = 1;
    hits = 0;
    misses = 0;
    roundNo = 0;
    lastResult = null;
    clearAnims();
    kit.reset();
    goIdle();
  }

  reset();

  return {
    id: env.id,
    kind: env.kind,
    reset,
    setActive(on) {
      active = on;
      kit.setActive(on);
      if (!on) clearAnims();
    },
    update(dt) {
      kit.update(dt);
      animate(dt);
    },
    dispose() {
      for (const off of offs) off();
      for (const c of colliders) ctx.physics.removeCollider(c);
      colliders.length = 0;
      leadMarker.removeFromParent();
      kit.dispose();
      for (const o of [body.mesh, weakRoot, strongRoot]) env.remove(o);
      body.dispose();
      material.dispose();
      atlas.dispose();
      pair?.dispose();
    },
    debug() {
      const pt = (lx: number, lz: number): { x: number; y: number; z: number } => {
        const w = frame.toWorld(lx, lz);
        return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
      };
      return {
        active,
        state,
        phase: kit.phase(),
        tier,
        roundTier: kit.tier(),
        round: roundNo,
        answer: round.answer,
        answerShape: answerShape(round),
        shapes: [...round.shapes],
        seed: round.seed,
        cells: pairCells,
        dotsShown: weakRoot.visible,
        chosen,
        hits,
        misses,
        gems: kit.round.totalGems,
        lastResult,
        kit: kit.debug(),
        yaw: lay.yaw,
        buttons: btnWorld.map((b) => ({ x: b.x, y: b.y, z: b.z })),
        // Where to stand to press each button (in front of the pedestal).
        stand: D.buttonX.map((x) => pt(x, D.heroZ)),
        // The viewing spot the layout was chosen for (between the middle and the right button).
        view: pt(D.buttonX[2] / 2, D.heroZ),
        pad: pt(D.pad.x, D.pad.z),
        /** Pip's best lead point: 3.5 m out from the pad on the approach (pad, sign and booth ahead). */
        lead: pt(D.pad.x, D.pad.z + D.leadOut),
        /** A spot 2.6 m behind the pad (the camera then shows the pad, the sign and the booth). */
        padBack: pt(D.pad.x, D.pad.z + 2.6),
        /** A spot 7 m behind the sign (its dressed back: stripes and the magic-glasses mark). */
        behind: pt(0.5, D.signZ - 7),
        booth: (() => {
          const b = kit.booth.build.marqueeBox;
          return pt((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
        })(),
        /** A spot ~30 m out on the approach, facing the booth and the sign. */
        far: (() => {
          const p = pt(D.pad.x, D.pad.z + 28);
          const t = frame.toWorld(-1.5, D.signZ);
          return { ...p, yaw: Math.atan2(t.x - p.x, t.z - p.z) };
        })(),
        /** A spot ~7 m behind the pad facing the booth and the sign (the whole booth in view). */
        celebrateView: (() => {
          const p = pt(D.pad.x - 1, D.pad.z + 7);
          const t = frame.toWorld(-2.2, -0.4);
          return { ...p, yaw: Math.atan2(t.x - p.x, t.z - p.z) };
        })(),
        // The approach spot the layout keeps clear (the sign seen from ~7 m).
        approach: pt(lay.view?.x ?? 0, lay.view?.z ?? D.signZ + 7),
        approachYaw: (() => {
          const a = frame.toWorld(lay.view?.x ?? 0, lay.view?.z ?? D.signZ + 7);
          const t = frame.toWorld(0, D.signZ);
          return Math.atan2(t.x - a.x, t.z - a.z);
        })(),
        layout: { shift: lay.shift, turn: lay.turn, problems: lay.problems, notes: lay.notes, ms: lay.ms },
        promptFits: promptPick.fits,
        promptAt: promptPick.at,
        sign: { ...pt(0, D.signZ), y: site.y + signY },
      };
    },
    force(params) {
      if (params.play) kit.forcePlay(typeof params.tier === 'number' ? (Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier) : undefined);
      else if (typeof params.tier === 'number' && state !== 'idle') {
        tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
      }
      if (params.start) kit.start();
      if (typeof params.pin === 'number') kit.pin(params.pin);
      if (state === 'idle') return;
      if (params.newRound) {
        newRound();
        return;
      }
      const r = { shapes: params.shapes ?? round.shapes, answer: params.answer ?? round.answer, seed: params.seed ?? round.seed };
      if (isDotRound(r)) round = { shapes: [...r.shapes], answer: r.answer, seed: r.seed };
      if (params.shapes !== undefined || params.answer !== undefined || params.seed !== undefined || typeof params.tier === 'number') {
        clearAnims();
        applyRound();
      }
    },
    drawObjects: () => env.tracked(),
  };
}
