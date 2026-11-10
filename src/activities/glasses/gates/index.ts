/**
 * Half-symbol gates (kind `lineUp`). Three chunky stone arches stand across the site, each topped
 * with a big both-eye symbol. A tall sign behind the middle arch shows ONE half of the answer
 * symbol to the weak eye and the OTHER half to the strong eye, exactly registered on its dark
 * panel. Either half alone fits two arches; both eyes together fit one. Run through the matching
 * arch (a segment test against each opening, so sprinting or jumping through counts) → happy
 * squash, confetti, fanfare, gems. A wrong arch → a soft boing and a wobble. Step back on the
 * start plate for the next round (new symbols, new order, the halves swap sides).
 *
 * Draw calls: the board (1) + one merged both-eye mesh for every static part, the arches, their
 * symbols and the plate (1) + the weak half (1) + the strong half (1) + confetti while it flies (1).
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier } from '../../../types';
import { createFullSymbolTexture, createHalfSymbol, TIERS, withChallenge } from '../../../vision/toolkit';
import type { HalfSymbolBlock } from '../../../vision/toolkit';
import type { Mechanic, MechanicEnv } from '../types';
import { GATE_GEMS, GATES } from './constants';
import {
  boxGeo,
  Confetti,
  createAtlas,
  createPartMesh,
  createSiteMaterial,
  crossesOpening,
  flatUv,
  nextTier,
  pivotMatrix,
  quadGeo,
  remapUv,
  siteFrame,
  squashCurve,
  wobbleCurve,
} from './kit';
import type { Opening } from './kit';
import { halvesFor, isGateRound, makeGateRound, otherSide } from './round';
import type { GateRound, Side } from './round';

const SWATCHES = {
  stone: { diffuse: '#ddd5c2' },
  stoneDark: { diffuse: '#3c414d' },
  wood: { diffuse: '#a87a4c' },
  woodDark: { diffuse: '#5e3f24' },
  ink: { diffuse: '#121419' },
  // Dark neutral sign face: no diffuse, constant self-light (same grey in R and G whatever the sun).
  panel: { diffuse: '#000000', glow: '#2e2e2e' },
  gold: { diffuse: '#f2c14e' },
};

const PLATE_CELL = 3;

/** Inverted-U arch outline (local XY, feet at y = -sink). */
function archShape(): THREE.Shape {
  const { innerHalf: ri, outerHalf: ro, straight: h, sink } = GATES;
  const s = new THREE.Shape();
  s.moveTo(-ro, -sink);
  s.lineTo(-ro, h);
  s.absarc(0, h, ro, Math.PI, 0, true);
  s.lineTo(ro, -sink);
  s.lineTo(ri, -sink);
  s.lineTo(ri, h);
  s.absarc(0, h, ri, 0, Math.PI, false);
  s.lineTo(-ri, -sink);
  s.closePath();
  return s;
}

function drawPlate(g: CanvasRenderingContext2D, ready: boolean): void {
  const c = 128;
  g.fillStyle = '#2b2f38';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = ready ? '#ffe9a8' : '#cfc7b2';
  g.beginPath();
  g.arc(c, c, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#20242c';
  g.beginPath();
  g.arc(c, c, ready ? 100 : 106, 0, Math.PI * 2);
  g.fill();
  // Two footprints and a big arrow towards the arches (texture up = towards the arches).
  g.fillStyle = ready ? '#ffffff' : '#e8e1cf';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(c + sx * 26, 170, 15, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(c + sx * 26, 134, 11, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.moveTo(c, 34);
  g.lineTo(c + 40, 82);
  g.lineTo(c + 16, 82);
  g.lineTo(c + 16, 112);
  g.lineTo(c - 16, 112);
  g.lineTo(c - 16, 82);
  g.lineTo(c - 40, 82);
  g.closePath();
  g.fill();
}

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const frame = siteFrame(site);
  const ground = (lx: number, lz: number): number => {
    const w = frame.toWorld(lx, lz);
    return env.groundAt(w.x, w.z) - site.y;
  };

  // ───────────── both-eye mesh (one draw call) ─────────────
  const atlas = createAtlas(SWATCHES);
  const material = createSiteMaterial(atlas);
  const U = (n: keyof typeof SWATCHES) => atlas.swatchUv(n);
  const archBase = GATES.archX.map((x) => Math.min(ground(x - GATES.outerHalf + 0.2, GATES.archZ), ground(x + GATES.outerHalf - 0.2, GATES.archZ)));
  const signBase = Math.min(ground(-GATES.signLegX, GATES.signZ), ground(GATES.signLegX, GATES.signZ));
  const plateBase = ground(0, GATES.plateZ);
  const apex = GATES.straight + GATES.outerHalf;

  const parts: Record<string, THREE.BufferGeometry[]> = {};
  GATES.archX.forEach((x, i) => {
    const y0 = archBase[i];
    const z = GATES.archZ;
    const arch = new THREE.ExtrudeGeometry(archShape(), { depth: GATES.depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 18 });
    arch.translate(x, y0, z - GATES.depth / 2);
    flatUv(arch, U('stone'));
    const list: THREE.BufferGeometry[] = [arch];
    // Dark plinths and a dark band under the curve (reads as an outline in R-only and G-only).
    for (const sx of [-1, 1]) {
      const px = x + sx * (GATES.innerHalf + GATES.outerHalf) / 2;
      list.push(boxGeo(0.56, 0.45 + GATES.sink, GATES.depth + 0.2, px, y0 + (0.45 - GATES.sink) / 2, z, U('stoneDark')));
      list.push(boxGeo(0.5, 0.12, GATES.depth + 0.14, px, y0 + GATES.straight - 0.06, z, U('stoneDark')));
    }
    // Symbol plaque on top: dark frame + the symbol on both faces.
    const py = y0 + GATES.plaqueY;
    list.push(boxGeo(0.22, GATES.plaqueY - apex + 0.1, 0.22, x, y0 + (apex + GATES.plaqueY - GATES.plaque / 2) / 2, z, U('stoneDark')));
    list.push(boxGeo(GATES.plaque + 0.14, GATES.plaque + 0.14, 0.16, x, py, z, U('ink')));
    list.push(quadGeo(GATES.plaque, GATES.plaque, x, py, z + 0.085, atlas.cellUv(i)));
    list.push(quadGeo(GATES.plaque, GATES.plaque, x, py, z - 0.085, atlas.cellUv(i), true));
    parts[`arch${i}`] = list;
  });
  // The sign: two legs, a wooden frame, the dark panel, a roof cap.
  {
    const z = GATES.signZ;
    const y = signBase + GATES.signY;
    const top = y + GATES.signFrame / 2;
    const list: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const legH = top - signBase + GATES.sink;
      list.push(boxGeo(0.26, legH, 0.26, sx * GATES.signLegX, signBase - GATES.sink + legH / 2, z - 0.2, U('woodDark')));
      list.push(boxGeo(0.44, 0.5, 0.44, sx * GATES.signLegX, signBase + 0.1, z - 0.2, U('stoneDark')));
    }
    list.push(boxGeo(GATES.signFrame, GATES.signFrame, 0.16, 0, y, z, U('wood')));
    list.push(boxGeo(GATES.signPanel, GATES.signPanel, 0.04, 0, y, z + 0.09, U('panel')));
    list.push(boxGeo(GATES.signFrame + 0.36, 0.14, 0.5, 0, top + 0.07, z - 0.05, U('woodDark')));
    // Small gold studs at the frame corners.
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      list.push(boxGeo(0.12, 0.12, 0.05, cx * (GATES.signFrame / 2 - 0.09), y + cy * (GATES.signFrame / 2 - 0.09), z + 0.1, U('gold')));
    }
    parts.sign = list;
  }
  // The start plate: a dark rim and a round face with feet and an arrow.
  {
    const rim = new THREE.CylinderGeometry(GATES.plateR + 0.08, GATES.plateR + 0.14, 0.3, 32).translate(0, plateBase - 0.1, GATES.plateZ);
    flatUv(rim, U('stoneDark'));
    const face = new THREE.CircleGeometry(GATES.plateR, 32).rotateX(-Math.PI / 2).translate(0, plateBase + 0.055, GATES.plateZ);
    remapUv(face, atlas.cellUv(PLATE_CELL));
    parts.plate = [rim, face];
  }
  const body = createPartMesh(parts, material, 'glasses:gates');
  body.mesh.position.set(site.x, site.y, site.z);
  body.mesh.rotation.y = site.yaw;
  body.mesh.updateMatrixWorld(true);
  env.add(body.mesh, VisionLayer.Both);

  // ───────────── colliders ─────────────
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.yaw);
  const colliders: ReturnType<typeof ctx.physics.addStaticBox>[] = [];
  const addBox = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
    const w = frame.toWorld(lx, lz);
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(w.x, site.y + ly, w.z), new THREE.Vector3(hx, hy, hz), rot));
  };
  const postHalf = (GATES.outerHalf - GATES.innerHalf) / 2;
  GATES.archX.forEach((x, i) => {
    const y0 = archBase[i];
    const h = GATES.straight + 0.6 + GATES.sink;
    for (const sx of [-1, 1]) addBox(x + sx * (GATES.innerHalf + postHalf), y0 - GATES.sink + h / 2, GATES.archZ, postHalf + 0.06, h / 2, GATES.depth / 2 + 0.05);
    // The top: from just above the opening's apex to the plaque.
    const y1 = y0 + GATES.straight + GATES.innerHalf + 0.05;
    const y2 = y0 + GATES.plaqueY + GATES.plaque / 2;
    addBox(x, (y1 + y2) / 2, GATES.archZ, GATES.outerHalf, (y2 - y1) / 2, GATES.depth / 2 + 0.05);
  });
  {
    const y = signBase + GATES.signY;
    const top = y + GATES.signFrame / 2;
    for (const sx of [-1, 1]) addBox(sx * GATES.signLegX, (signBase - GATES.sink + top) / 2, GATES.signZ - 0.2, 0.15, (top - signBase + GATES.sink) / 2, 0.15);
    addBox(0, y, GATES.signZ, GATES.signFrame / 2, GATES.signFrame / 2, 0.12);
  }

  // ───────────── the two halves (weak layer + strong layer, exactly registered) ─────────────
  const signPos = frame.toWorld(0, GATES.signZ + 0.08 + 0.02 + 0.03);
  const signY = site.y + signBase + GATES.signY;
  const makeRoot = (): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(signPos.x, signY, signPos.z);
    g.rotation.y = site.yaw;
    return g;
  };
  const weakRoot = makeRoot();
  const strongRoot = makeRoot();
  weakRoot.name = 'glasses:gates:weak';
  strongRoot.name = 'glasses:gates:strong';
  // Both blocks are LEFT halves; a half on the right is the mirror image (scale.x = −1).
  const weakHalf: HalfSymbolBlock = createHalfSymbol({ shape: 'round', side: 'left', size: 1, facing: 'wall' });
  const strongHalf: HalfSymbolBlock = createHalfSymbol({ shape: 'round', side: 'left', size: 1, facing: 'wall' });
  weakRoot.add(weakHalf.object);
  strongRoot.add(strongHalf.object);
  env.add(weakRoot, VisionLayer.WeakOnly);
  env.add(strongRoot, VisionLayer.StrongOnly);

  const confetti = new Confetti(90);
  env.add(confetti.mesh, VisionLayer.Both);
  // Celebration randomness is local, so it never shifts the round sequence.
  let fxSeed = 0x9e3779b9;
  const fxRng = (): number => {
    fxSeed = (fxSeed + 0x6d2b79f5) >>> 0;
    let t = fxSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ───────────── state ─────────────
  let round: GateRound = makeGateRound(env.rng, 'left');
  let roundNo = 0;
  let state: 'open' | 'done' = 'open';
  let tier: GlassesTier = 1;
  let doneT = 0;
  let chosen = -1;
  let hits = 0;
  let misses = 0;
  let gems = 0;
  let active = false;
  let lastResult: { tier: GlassesTier; hit: boolean; arch: number } | null = null;
  const anim = GATES.archX.map(() => ({ squash: 1, wobble: 1 }));
  let prev: { x: number; y: number; z: number } | null = null;
  let plateReady = false;

  const openings: Opening[] = GATES.archX.map((cx) => ({ cx, z: GATES.archZ, halfWidth: GATES.innerHalf - 0.05, height: GATES.passHeight }));

  function drawSymbols(): void {
    round.candidates.forEach((sym, i) => {
      const tex = createFullSymbolTexture(sym, 256);
      const dim = state === 'done' && i !== round.answer;
      const shine = state === 'done' && i === round.answer;
      atlas.drawCell(i, (g) => {
        g.drawImage(tex.image as CanvasImageSource, 0, 0, 256, 256);
        if (dim) {
          g.fillStyle = 'rgba(8,10,16,0.62)';
          g.fillRect(0, 0, 256, 256);
        }
        if (shine) {
          g.strokeStyle = '#fff6c8';
          g.lineWidth = 14;
          g.strokeRect(7, 7, 242, 242);
        }
      }, shine ? 0.6 : 0.32);
      tex.dispose();
    });
  }

  function drawPlateCell(ready: boolean): void {
    plateReady = ready;
    atlas.drawCell(PLATE_CELL, (g) => drawPlate(g, ready), ready ? 0.55 : 0.3);
  }

  function applyHalves(): void {
    const h = halvesFor(round);
    weakHalf.setShape(h.weak);
    strongHalf.setShape(h.strong);
    const p = withChallenge(tier, env.challenge());
    const size = GATES.halfSize * p.size;
    // Mirror the half that sits on the right of the axis.
    weakRoot.scale.set(round.weakSide === 'right' ? -size : size, size, 1);
    strongRoot.scale.set(otherSide(round.weakSide) === 'right' ? -size : size, size, 1);
    weakHalf.set({ level: p.level, opacity: p.opacity });
    strongHalf.set({ level: p.level, opacity: p.opacity });
    weakRoot.updateMatrixWorld(true);
    strongRoot.updateMatrixWorld(true);
  }

  function applyRound(): void {
    state = 'open';
    chosen = -1;
    doneT = 0;
    drawSymbols();
    drawPlateCell(false);
    applyHalves();
  }

  function newRound(): void {
    const side: Side = roundNo === 0 ? 'left' : otherSide(round.weakSide);
    round = makeGateRound(env.rng, side);
    roundNo++;
    applyRound();
  }

  function clearAnims(): void {
    for (let i = 0; i < anim.length; i++) {
      anim[i].squash = 1;
      anim[i].wobble = 1;
      body.setPart(`arch${i}`, null);
    }
  }

  function choose(i: number): void {
    const hit = i === round.answer;
    const t = tier;
    chosen = i;
    state = 'done';
    doneT = 0;
    lastResult = { tier: t, hit, arch: i };
    const top = frame.toWorld(GATES.archX[i], GATES.archZ);
    if (hit) {
      hits++;
      anim[i].squash = 0;
      gems += GATE_GEMS[t];
      env.pay(GATE_GEMS[t]);
      ctx.audio.play('fanfare');
      confetti.burst(top.x, site.y + archBase[i] + GATES.plaqueY, top.z, fxRng, 60, 5.5);
    } else {
      misses++;
      anim[i].wobble = 0;
      ctx.audio.play('boing', { volume: 0.55, pitch: 0.8 });
    }
    env.result(t, hit);
    tier = nextTier(t, hit);
    drawSymbols();
    drawPlateCell(true);
  }

  const m4 = new THREE.Matrix4();
  function animate(dt: number): void {
    anim.forEach((a, i) => {
      if (a.squash >= 1 && a.wobble >= 1) return;
      a.squash = Math.min(1, a.squash + dt / GATES.squash);
      a.wobble = Math.min(1, a.wobble + dt / GATES.wobble);
      if (a.squash >= 1 && a.wobble >= 1) {
        body.setPart(`arch${i}`, null);
        return;
      }
      const s = squashCurve(a.squash);
      const roll = wobbleCurve(a.wobble);
      body.setPart(`arch${i}`, pivotMatrix(GATES.archX[i], archBase[i], GATES.archZ, s.sxz, s.sy, s.sxz, roll, 0, m4));
    });
  }

  function localPlayer(): { x: number; y: number; z: number } {
    const p = ctx.player.position;
    const l = frame.toLocal(p.x, p.z);
    return { x: l.x, y: p.y - site.y, z: l.z };
  }

  function onPlate(p: { x: number; y: number; z: number }): boolean {
    return Math.hypot(p.x, p.z - GATES.plateZ) < GATES.plateR + 0.15 && Math.abs(p.y - plateBase) < 0.8;
  }

  function reset(): void {
    tier = 1;
    hits = 0;
    misses = 0;
    gems = 0;
    roundNo = 0;
    lastResult = null;
    prev = null;
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
      prev = null;
      if (!on) {
        confetti.clear();
        clearAnims();
      }
    },
    update(dt) {
      animate(dt);
      confetti.update(dt);
      const cur = localPlayer();
      if (state === 'open' && prev && ctx.player.mode === 'walk') {
        for (let i = 0; i < openings.length; i++) {
          const o = openings[i];
          const g = archBase[i];
          if (crossesOpening({ x: prev.x, y: prev.y - g, z: prev.z }, { x: cur.x, y: cur.y - g, z: cur.z }, o)) {
            choose(i);
            break;
          }
        }
      } else if (state === 'done') {
        doneT += dt;
        if (doneT >= GATES.rearm && onPlate(cur)) newRound();
      }
      prev = cur;
    },
    dispose() {
      for (const c of colliders) ctx.physics.removeCollider(c);
      colliders.length = 0;
      for (const o of [body.mesh, weakRoot, strongRoot, confetti.mesh]) env.remove(o);
      body.dispose();
      material.dispose();
      atlas.dispose();
      weakHalf.dispose();
      strongHalf.dispose();
      confetti.dispose();
    },
    debug() {
      const h = halvesFor(round);
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
        candidates: round.candidates.map((c) => ({ ...c })),
        weakSide: round.weakSide,
        weakHalf: h.weak,
        strongHalf: h.strong,
        chosen,
        hits,
        misses,
        gems,
        lastResult,
        plateReady,
        confetti: confetti.live,
        gemsPerTier: { ...GATE_GEMS },
        tierPreset: { ...TIERS[tier] },
        yaw: site.yaw,
        plate: pt(0, GATES.plateZ),
        // Points just in front of / behind each opening (world), for tests.
        arches: GATES.archX.map((x) => ({ front: pt(x, GATES.archZ + 0.7), back: pt(x, GATES.archZ - 0.7), around: pt(x + GATES.outerHalf + 0.6, GATES.archZ - 0.7) })),
        sign: { ...pt(0, GATES.signZ), y: signY },
      };
    },
    force(params) {
      if (typeof params.tier === 'number') tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
      const r = { candidates: params.candidates ?? round.candidates, answer: params.answer ?? round.answer, weakSide: params.weakSide ?? round.weakSide };
      if (isGateRound(r)) round = { candidates: r.candidates.map((c) => ({ ...c })), answer: r.answer, weakSide: r.weakSide };
      if (params.newRound) {
        newRound();
        return;
      }
      clearAnims();
      confetti.clear();
      applyRound();
    },
    drawObjects: () => env.tracked(),
  };
}
