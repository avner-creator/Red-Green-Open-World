/**
 * Half-symbol gates (kind `lineUp`), the booth kit's reference game (../booth/README.md).
 *
 * A game booth stands beside a glowing walk-in start pad; chevrons on the ground lead from the pad
 * to three striped finish arches, each with a big both-eye symbol plaque and a checkered ribbon.
 * Step on the pad (or press Use on it) → 3-2-1-GO → the sign between the pad and the arches shows
 * ONE half of the answer symbol to the weak eye and the OTHER half to the strong eye. Either half
 * alone fits two arches; both eyes together fit one. Run through the matching arch → ✓, a lamp
 * lights, the arch squashes, confetti; a wrong arch → ✗, a dim lamp, a wobble. Back to the pad
 * for the next run (3 runs a round). After 3 runs: lamps chase, fanfare, confetti, and the prize
 * flies out (2 of 3 or better). Each run reports `glasses:result`; the tier steps per round.
 *
 * Draw calls: the booth (1: marquee, pad, decals, lamps, demo, prompt) + one merged both-eye mesh
 * for the arches and the sign (1) + the weak half (1) + the strong half (1); during a round the
 * kit's fx quads (1) and confetti (1).
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier } from '../../../types';
import { createFullSymbolTexture, createHalfSymbol, TIERS, withChallenge } from '../../../vision/toolkit';
import type { HalfSymbolBlock } from '../../../vision/toolkit';
import type { BoothSpec } from '../booth/types';
import type { Mechanic, MechanicEnv } from '../types';
import { GATE_BOOTH, GATE_RULES, GATES } from './constants';
import { GATES_DEMO } from './demo';
import { boxGeo, createAtlas, createPartMesh, createSiteMaterial, crossesOpening, flatUv, pivotMatrix, quadGeo, siteFrame, squashCurve, wobbleCurve } from './kit';
import type { Opening } from './kit';
import { chooseLayout } from './layout';
import type { LayoutSpec } from './layout';
import { halvesFor, isGateRound, makeGateRound, otherSide } from './round';
import type { GateRound, Side } from './round';

const SWATCHES = {
  stone: { diffuse: '#ece4d0' },
  stoneDark: { diffuse: '#3c414d' },
  wood: { diffuse: '#a87a4c' },
  woodDark: { diffuse: '#5e3f24' },
  ink: { diffuse: '#121419' },
  // Dark neutral sign face: no diffuse, constant self-light (same grey in R and G whatever the sun).
  panel: { diffuse: '#000000', glow: '#2e2e2e' },
  gold: { diffuse: '#f2c14e' },
  // Arch stripes: dark in BOTH R and G against the bright stone.
  berry: { diffuse: '#5c0a24' },
  navy: { diffuse: '#18205e' },
};

const RIBBON_CELL = 3;

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

/** A checkered finish ribbon (both eyes: black and white). */
function drawRibbon(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#15171c';
  const n = 8;
  const s = 256 / n;
  for (let y = 0; y < 2; y++) for (let x = 0; x < n; x++) if ((x + y) % 2 === 0) g.fillRect(x * s, 64 + y * 64, s, 64);
  g.fillStyle = '#f2c14e';
  g.fillRect(0, 52, 256, 12);
  g.fillRect(0, 192, 256, 12);
}

/** The plaque at rest: a big bright "?" on the dark plate (same on all three arches). */
function drawMystery(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#15171c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#f7f4ec';
  g.lineWidth = 12;
  g.strokeRect(14, 14, 228, 228);
  g.fillStyle = '#ffd23a';
  g.font = '900 170px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 128, 140);
}

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const G = GATES;
  const B = GATE_BOOTH;
  const mq = B.marquee;
  const mqPt = (lx: number, lz: number): { x: number; z: number } => ({
    x: mq.x + lx * Math.cos(mq.yaw) + lz * Math.sin(mq.yaw),
    z: mq.z - lx * Math.sin(mq.yaw) + lz * Math.cos(mq.yaw),
  });
  const spec: LayoutSpec = {
    hero: { x: 0, z: G.padZ },
    targets: [
      ...[-1, 0, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * 0.7, z: G.signZ, y: G.signY + sy * 0.7 }))),
      ...G.archX.flatMap((x) => [{ x, z: G.archZ, y: G.plaqueY }, { x, z: G.archZ, y: G.plaqueY + 0.5 }]),
      // The booth's lamp row.
      ...[-0.5, 0.5].map((lx) => ({ ...mqPt(lx, 0), y: 3.2 })),
    ],
    footprint: [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * (G.archX[2] + G.outerHalf), z: G.archZ + sz * 0.35 }))),
      ...G.archX.map((x) => ({ x, z: G.archZ })),
      { x: 0, z: G.signZ },
      { x: -G.padR, z: G.padZ },
      { x: G.padR, z: G.padZ },
      { x: 0, z: G.padZ + G.padR },
      // The booth's poles and counter.
      ...[-1.6, 1.6].flatMap((lx) => [0.1, -0.5].map((lz) => mqPt(lx, lz))),
    ],
    radius: site.radius + 0.4,
    canopyTargets: [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: sx * 0.8, z: G.signZ, y: G.signY + sy * 0.8 }))),
    // The approach (~7 m from the sign): the clearest of a few spots, kept in `lay.view`.
    views: [[0, 7], [-2.5, 6.6], [2.5, 6.6], [-4, 5.8], [4, 5.8]].map(([x, dz]) => ({ x, z: G.signZ + dz })),
    foreground: 1.5,
  };
  const lay = chooseLayout(ctx, site, spec, { refreshDecor: true });
  const frame = siteFrame(lay);
  const ground = (lx: number, lz: number): number => {
    const w = frame.toWorld(lx, lz);
    return env.groundAt(w.x, w.z) - site.y;
  };

  // ───────────── both-eye mesh: the arches and the sign (one draw call) ─────────────
  const atlas = createAtlas(SWATCHES);
  const material = createSiteMaterial(atlas);
  const U = (n: keyof typeof SWATCHES) => atlas.swatchUv(n);
  const archBase = G.archX.map((x) => Math.min(ground(x - G.outerHalf + 0.2, G.archZ), ground(x + G.outerHalf - 0.2, G.archZ)));
  const signBase = ground(0, G.signZ);
  const padBase = ground(0, G.padZ);
  const apex = G.straight + G.outerHalf;
  const mid = (G.innerHalf + G.outerHalf) / 2;
  // The extruded arch is 0.1 m fatter than its outline (bevel): bands wrap round that.
  const band = G.outerHalf - G.innerHalf + 0.2;

  const parts: Record<string, THREE.BufferGeometry[]> = {};
  G.archX.forEach((x, i) => {
    const y0 = archBase[i];
    const z = G.archZ;
    const arch = new THREE.ExtrudeGeometry(archShape(), { depth: G.depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 18 });
    arch.translate(x, y0, z - G.depth / 2);
    flatUv(arch, U('stone'));
    const list: THREE.BufferGeometry[] = [arch];
    // Dark plinths, candy bands round the legs and the curve (bright stone, dark bands: reads in
    // R-only and G-only), alternating berry / navy.
    for (const sx of [-1, 1]) {
      const px = x + sx * mid;
      list.push(boxGeo(0.56, 0.45 + G.sink, G.depth + 0.2, px, y0 + (0.45 - G.sink) / 2, z, U('stoneDark')));
      [0.62, 1.22].forEach((by, k) => list.push(boxGeo(band, 0.34, G.depth + 0.2, px, y0 + by, z, U(k % 2 ? 'navy' : 'berry'))));
    }
    [0.12, 0.36, 0.64, 0.88].forEach((f, k) => {
      const a = Math.PI * (1 - f);
      const b = boxGeo(band, 0.3, G.depth + 0.2, 0, 0, 0, U(k % 2 ? 'navy' : 'berry'));
      b.rotateZ(a - Math.PI / 2);
      b.translate(x + Math.cos(a) * mid, y0 + G.straight + Math.sin(a) * mid, z);
      list.push(b);
    });
    // Finish ribbon across the top of the opening (both faces).
    list.push(quadGeo(G.innerHalf * 2, G.ribbonH, x, y0 + G.ribbonY + G.ribbonH / 2, z + 0.03, atlas.cellUv(RIBBON_CELL)));
    list.push(quadGeo(G.innerHalf * 2, G.ribbonH, x, y0 + G.ribbonY + G.ribbonH / 2, z - 0.03, atlas.cellUv(RIBBON_CELL), true));
    // Symbol plaque on top: gold frame + the symbol on both faces.
    const py = y0 + G.plaqueY;
    list.push(boxGeo(0.22, G.plaqueY - apex + 0.1, 0.22, x, y0 + (apex + G.plaqueY - G.plaque / 2) / 2, z, U('stoneDark')));
    list.push(boxGeo(G.plaque + 0.2, G.plaque + 0.2, 0.16, x, py, z, U('gold')));
    list.push(quadGeo(G.plaque, G.plaque, x, py, z + 0.085, atlas.cellUv(i)));
    list.push(quadGeo(G.plaque, G.plaque, x, py, z - 0.085, atlas.cellUv(i), true));
    parts[`arch${i}`] = list;
  });
  // The sign: a lectern in front of the pad (one stout post, a wooden frame, the dark panel,
  // a roof cap), leaning back a little so it faces the camera that looks down over the hero.
  const signCentre = new THREE.Vector3(0, padBase + G.signY, G.signZ);
  {
    const z = G.signZ;
    const tilted = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.rotateX(-G.signTilt).translate(0, signCentre.y, z);
    const half = G.signFrame / 2;
    const postH = signCentre.y - signBase + G.sink;
    parts.sign = [
      boxGeo(0.3, postH, 0.3, 0, signBase - G.sink + postH / 2, z - 0.12, U('woodDark')),
      boxGeo(0.62, 0.4, 0.62, 0, signBase + 0.08, z - 0.12, U('stoneDark')),
      tilted(boxGeo(G.signFrame, G.signFrame, 0.16, 0, 0, 0, U('gold'))),
      tilted(boxGeo(G.signPanel, G.signPanel, 0.04, 0, 0, 0.09, U('panel'))),
      tilted(boxGeo(G.signFrame + 0.3, 0.13, 0.46, 0, half + 0.065, -0.05, U('woodDark'))),
    ];
  }
  const body = createPartMesh(parts, material, 'glasses:gates');
  body.mesh.position.set(lay.x, site.y, lay.z);
  body.mesh.rotation.y = lay.yaw;
  body.mesh.updateMatrixWorld(true);
  env.add(body.mesh, VisionLayer.Both);
  atlas.drawCell(RIBBON_CELL, drawRibbon, 0.4);

  // ───────────── colliders ─────────────
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), lay.yaw);
  const colliders: ReturnType<typeof ctx.physics.addStaticBox>[] = [];
  const addBox = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
    const w = frame.toWorld(lx, lz);
    colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(w.x, site.y + ly, w.z), new THREE.Vector3(hx, hy, hz), rot));
  };
  const postHalf = (G.outerHalf - G.innerHalf) / 2;
  G.archX.forEach((x, i) => {
    const y0 = archBase[i];
    const h = G.straight + 0.6 + G.sink;
    for (const sx of [-1, 1]) addBox(x + sx * (G.innerHalf + postHalf), y0 - G.sink + h / 2, G.archZ, postHalf + 0.06, h / 2, G.depth / 2 + 0.05);
    const y1 = y0 + G.straight + G.innerHalf + 0.05;
    const y2 = y0 + G.plaqueY + G.plaque / 2;
    addBox(x, (y1 + y2) / 2, G.archZ, G.outerHalf, (y2 - y1) / 2, G.depth / 2 + 0.05);
  });
  addBox(0, (signBase - G.sink + signCentre.y + G.signFrame / 2) / 2, G.signZ - 0.05, G.signFrame / 2, (signCentre.y + G.signFrame / 2 - signBase + G.sink) / 2, 0.2);

  // ───────────── the two halves (weak layer + strong layer, exactly registered) ─────────────
  const signPos = frame.toWorld(0, G.signZ);
  const signY = site.y + signCentre.y;
  const makeRoot = (): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(signPos.x, signY, signPos.z);
    g.rotation.set(-G.signTilt, lay.yaw, 0, 'YXZ');
    return g;
  };
  const weakRoot = makeRoot();
  const strongRoot = makeRoot();
  weakRoot.name = 'glasses:gates:weak';
  strongRoot.name = 'glasses:gates:strong';
  // Both blocks are LEFT halves; a half on the right is the mirror image (scale.x = −1).
  const weakHalf: HalfSymbolBlock = createHalfSymbol({ shape: 'round', side: 'left', size: 1, facing: 'wall' });
  const strongHalf: HalfSymbolBlock = createHalfSymbol({ shape: 'round', side: 'left', size: 1, facing: 'wall' });
  weakHalf.object.position.z = 0.13;
  strongHalf.object.position.z = 0.13;
  weakRoot.add(weakHalf.object);
  strongRoot.add(strongHalf.object);
  env.add(weakRoot, VisionLayer.WeakOnly);
  env.add(strongRoot, VisionLayer.StrongOnly);

  // ───────────── state ─────────────
  let round: GateRound = makeGateRound(env.rng, 'left');
  let tries = 0;
  /** 'idle': no question (booth idle, countdown, celebration); 'open': a run is on; 'done': answered. */
  let state: 'idle' | 'open' | 'done' = 'idle';
  let tier: GlassesTier = 1;
  let chosen = -1;
  let hits = 0;
  let misses = 0;
  let active = false;
  let lastResult: { tier: GlassesTier; hit: boolean; arch: number } | null = null;
  const anim = G.archX.map(() => ({ squash: 1, wobble: 1 }));
  let prev: { x: number; y: number; z: number } | null = null;

  const openings: Opening[] = G.archX.map((cx) => ({ cx, z: G.archZ, halfWidth: G.innerHalf - 0.05, height: G.passHeight }));

  function drawSymbols(): void {
    if (state === 'idle') {
      for (let i = 0; i < 3; i++) atlas.drawCell(i, drawMystery, 0.4);
      return;
    }
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

  function applyHalves(): void {
    const h = halvesFor(round);
    weakHalf.setShape(h.weak);
    strongHalf.setShape(h.strong);
    const p = withChallenge(tier, env.challenge());
    const size = G.halfSize * p.size;
    weakRoot.scale.set(round.weakSide === 'right' ? -size : size, size, 1);
    strongRoot.scale.set(otherSide(round.weakSide) === 'right' ? -size : size, size, 1);
    weakHalf.set({ level: p.level, opacity: p.opacity });
    strongHalf.set({ level: p.level, opacity: p.opacity });
    weakRoot.updateMatrixWorld(true);
    strongRoot.updateMatrixWorld(true);
  }

  /** Show the current round (a run is on). */
  function applyRound(): void {
    state = 'open';
    chosen = -1;
    drawSymbols();
    weakRoot.visible = strongRoot.visible = true;
    applyHalves();
  }

  function newRound(): void {
    const side: Side = tries === 0 ? 'left' : otherSide(round.weakSide);
    round = makeGateRound(env.rng, side);
    tries++;
    applyRound();
  }

  function goIdle(): void {
    state = 'idle';
    chosen = -1;
    weakRoot.visible = strongRoot.visible = false;
    drawSymbols();
  }

  function clearAnims(): void {
    for (let i = 0; i < anim.length; i++) {
      anim[i].squash = 1;
      anim[i].wobble = 1;
      body.setPart(`arch${i}`, null);
    }
  }

  // Booth spec heights are relative to the site's y: lift them onto the pad's ground.
  const lift = (p: { x: number; y: number; z: number } | undefined) => (p ? { ...p, y: p.y + padBase } : undefined);
  const boothSpec: BoothSpec = { ...B, prompt: lift(B.prompt), playPromptAt: lift(B.playPromptAt), countdown: lift(B.countdown) };
  const kit = env.booth({
    frame: { x: lay.x, z: lay.z, yaw: lay.yaw },
    ground,
    spec: boothSpec,
    demo: GATES_DEMO,
    rules: GATE_RULES,
    hooks: {
      onTry(_i, t) {
        tier = t;
        newRound();
      },
      onIdle() {
        goIdle();
      },
    },
    waitPromptAt: () => {
      // After a run the child stands beyond the arch, facing away: the "back to the pad" prompt
      // floats ahead of them, over the arch they just ran through (the answer is already given).
      const x = chosen >= 0 ? G.archX[chosen] : 0;
      return { x, y: archBase[Math.max(0, chosen)] + 2.6, z: G.archZ - 2.4 };
    },
  });

  function choose(i: number): void {
    const hit = i === round.answer;
    chosen = i;
    state = 'done';
    lastResult = { tier, hit, arch: i };
    if (hit) {
      hits++;
      anim[i].squash = 0;
    } else {
      misses++;
      anim[i].wobble = 0;
    }
    drawSymbols();
    // The sign goes quiet once the run is answered.
    weakRoot.visible = strongRoot.visible = false;
    kit.report(hit, { x: G.archX[i], y: archBase[i] + G.plaqueY + 0.95, z: G.archZ + 0.3 });
  }

  const m4 = new THREE.Matrix4();
  function animate(dt: number): void {
    anim.forEach((a, i) => {
      if (a.squash >= 1 && a.wobble >= 1) return;
      a.squash = Math.min(1, a.squash + dt / G.squash);
      a.wobble = Math.min(1, a.wobble + dt / G.wobble);
      if (a.squash >= 1 && a.wobble >= 1) {
        body.setPart(`arch${i}`, null);
        return;
      }
      const s = squashCurve(a.squash);
      const roll = wobbleCurve(a.wobble);
      body.setPart(`arch${i}`, pivotMatrix(G.archX[i], archBase[i], G.archZ, s.sxz, s.sy, s.sxz, roll, 0, m4));
    });
  }

  function localPlayer(): { x: number; y: number; z: number } {
    const p = ctx.player.position;
    const l = frame.toLocal(p.x, p.z);
    return { x: l.x, y: p.y - site.y, z: l.z };
  }

  function reset(): void {
    tier = 1;
    hits = 0;
    misses = 0;
    tries = 0;
    lastResult = null;
    prev = null;
    clearAnims();
    kit.reset();
  }

  reset();

  return {
    id: env.id,
    kind: env.kind,
    reset,
    setActive(on) {
      active = on;
      prev = null;
      if (!on) clearAnims();
      kit.setActive(on);
    },
    update(dt) {
      kit.update(dt);
      animate(dt);
      const cur = localPlayer();
      if (state === 'open' && kit.phase() === 'play' && prev && ctx.player.mode === 'walk') {
        for (let i = 0; i < openings.length; i++) {
          const g = archBase[i];
          if (crossesOpening({ x: prev.x, y: prev.y - g, z: prev.z }, { x: cur.x, y: cur.y - g, z: cur.z }, openings[i])) {
            choose(i);
            break;
          }
        }
      }
      prev = cur;
    },
    dispose() {
      for (const c of colliders) ctx.physics.removeCollider(c);
      colliders.length = 0;
      kit.dispose();
      for (const o of [body.mesh, weakRoot, strongRoot]) env.remove(o);
      body.dispose();
      material.dispose();
      atlas.dispose();
      weakHalf.dispose();
      strongHalf.dispose();
    },
    debug() {
      const h = halvesFor(round);
      const pt = (lx: number, lz: number): { x: number; y: number; z: number } => {
        const w = frame.toWorld(lx, lz);
        return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
      };
      const k = kit.debug();
      return {
        active,
        state,
        phase: kit.phase(),
        tier: kit.tier(),
        runTier: tier,
        round: tries,
        answer: round.answer,
        candidates: round.candidates.map((c) => ({ ...c })),
        weakSide: round.weakSide,
        weakHalf: h.weak,
        strongHalf: h.strong,
        halvesShown: weakRoot.visible,
        chosen,
        hits,
        misses,
        gems: kit.round.totalGems,
        lastResult,
        kit: k,
        tierPreset: { ...TIERS[tier] },
        yaw: lay.yaw,
        layout: { shift: lay.shift, turn: lay.turn, problems: lay.problems, notes: lay.notes, ms: lay.ms },
        pad: pt(0, G.padZ),
        // Kept for older callers: the pad is where the plate was.
        plate: pt(0, G.padZ),
        approach: pt(lay.view?.x ?? 0, lay.view?.z ?? G.signZ + 7),
        approachYaw: (() => {
          const a = frame.toWorld(lay.view?.x ?? 0, lay.view?.z ?? G.signZ + 7);
          const t = frame.toWorld(0, G.signZ);
          return Math.atan2(t.x - a.x, t.z - a.z);
        })(),
        /** A spot ~30 m out on the approach, facing the booth and the arches. */
        far: (() => {
          const p = pt(0, G.padZ + 28);
          const t = frame.toWorld(-1.5, G.signZ);
          return { ...p, yaw: Math.atan2(t.x - p.x, t.z - p.z) };
        })(),
        arches: G.archX.map((x) => ({ front: pt(x, G.archZ + 0.7), back: pt(x, G.archZ - 0.7), around: pt(x + G.outerHalf + 0.6, G.archZ - 0.7) })),
        sign: { ...pt(0, G.signZ), y: signY },
        /** The booth's marquee (world, on the ground) and a spot 1.6 m behind the pad. */
        booth: (() => {
          const b = kit.booth.build.marqueeBox;
          return pt((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2);
        })(),
        padBack: pt(0, G.padZ + 1.7),
      };
    },
    force(params) {
      if (params.play) kit.forcePlay(typeof params.tier === 'number' ? (Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier) : undefined);
      else if (typeof params.tier === 'number') tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
      if (params.start) kit.start();
      if (typeof params.pin === 'number') kit.pin(params.pin);
      const r = { candidates: params.candidates ?? round.candidates, answer: params.answer ?? round.answer, weakSide: params.weakSide ?? round.weakSide };
      if (isGateRound(r)) round = { candidates: r.candidates.map((c) => ({ ...c })), answer: r.answer, weakSide: r.weakSide };
      if (params.candidates !== undefined || params.answer !== undefined || params.weakSide !== undefined) {
        clearAnims();
        if (state !== 'idle') applyRound();
      }
    },
    drawObjects: () => env.tracked(),
  };
}
