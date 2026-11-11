/**
 * A dot-picture prize code at the Gear Shack (popOut). A dark board hangs on the kiosk's free right
 * side wall and carries a red-green dot picture (toolkit pair: the weak eye gets one dot pattern,
 * the strong eye another, exactly registered): each eye alone sees noise, the hidden shape exists
 * only between the two eyes. Three identical gift boxes stand in front, each tagged with a shape
 * (the Phase 1 dot-sign button pictures). Use the box whose shape is hidden in the dots:
 *  - right → the lid pops open with confetti. The first full-pay win of a session gives a real
 *    prize: the cheapest shop item for sale the child does not own (unlocked as a gift: the usual
 *    unlock moment, nothing charged), or 10 gems if there is none; later wins pay 3 / 5 / 8 gems.
 *  - wrong → the box wobbles, the boxes nap (prompts off, the board blank), then a new picture.
 * Anti-guess: the Phase 1 guard (`../../gates/guard`): after a miss a hit pays 1 gem until two in a
 * row are right. Tier staircase like the dot signs.
 *
 * Draw calls while active (hero within 25 m): board + boxes (1 merged both-eye mesh) + weak dots (1)
 * + strong dots (1) + confetti while it flies (1) = 3..4. Nothing attached beyond 28 m.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../../types';
import type { GlassesTier, Interactable } from '../../../../types';
import { createDotPicturePair, DOT_BOARD_GREY, TIERS, withChallenge } from '../../../../vision/toolkit';
import type { DotPicturePair } from '../../../../vision/toolkit';
import { shapeButtonCanvas } from '../../dotsigns/picto';
import { answerShape, isDotRound, makeDotRound } from '../../dotsigns/round';
import type { DotRound } from '../../dotsigns/round';
import { freshGuard } from '../../gates/guard';
import { boxGeo, Confetti, createAtlas, createPartMesh, createSiteMaterial, flatUv, nextTier, remapUv, siteFrame, wobbleCurve } from '../../gates/kit';
import type { PartMesh, SiteFrame } from '../../gates/kit';
import type { WeaveEnv, WeavePart } from '../types';
import { payout, pickPrize, SHACK_DOTS, SHACK_GEMS, SHACK_WEAVE } from './logic';
import type { ShackState } from './logic';

const grey = Math.round(DOT_BOARD_GREY * 255).toString(16).padStart(2, '0');
const SWATCHES = {
  wood: { diffuse: '#a87a4c' },
  woodDark: { diffuse: '#5e3f24' },
  // The dot board: no diffuse, constant self-light at DOT_BOARD_GREY (equal R and G).
  panel: { diffuse: '#000000', glow: `#${grey}${grey}${grey}` },
  gold: { diffuse: '#f2c14e' },
  cream: { diffuse: '#f3ead6' },
  navy: { diffuse: '#1b2a6b' },
  ink: { diffuse: '#121419' },
};

export function create(env: WeaveEnv): WeavePart {
  const { ctx } = env;
  const D = SHACK_WEAVE;

  let ready = false;
  let frame: SiteFrame | null = null;
  let baseY = 0;
  let yaw = 0;
  let body: PartMesh | null = null;
  let atlas: ReturnType<typeof createAtlas> | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  const weakRoot = new THREE.Group();
  const strongRoot = new THREE.Group();
  weakRoot.name = 'glasses:weave:shack:weak';
  strongRoot.name = 'glasses:weave:shack:strong';
  let pair: DotPicturePair | null = null;
  let pairCells = 0;
  const confetti = new Confetti(80);
  confetti.mesh.name = 'glasses:weave:shack:confetti';
  const colliders: ReturnType<GameCtxPhysics['addStaticBox']>[] = [];
  const offs: (() => void)[] = [];
  const boxWorld: THREE.Vector3[] = [];

  let active = false;
  let round: DotRound = makeDotRound(env.rng);
  let roundNo = 0;
  let state: 'open' | 'done' = 'open';
  let tier: GlassesTier = 1;
  let doneT = 0;
  let wait: number = D.next;
  let chosen = -1;
  let hits = 0;
  let misses = 0;
  let gems = 0;
  let prizeItem: string | null = null;
  let lastResult: { tier: GlassesTier; hit: boolean; box: number; gems: number; prize: boolean } | null = null;
  let st: ShackState = { guard: freshGuard(), prizeGiven: false };
  const anim = [0, 1, 2].map(() => ({ open: 1, wobble: 1 }));
  let nap = 0;
  let fxSeed = 0x2545f491;
  const fxRng = (): number => {
    fxSeed = (fxSeed + 0x6d2b79f5) >>> 0;
    let t = fxSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function init(): boolean {
    if (ready) return true;
    const world = ctx.world as typeof ctx.world | undefined;
    const anchor = world?.anchors?.gearShack;
    if (!anchor || !ctx.player || !ctx.interactions || !ctx.physics) return false;
    yaw = anchor.yaw;
    frame = siteFrame({ x: anchor.position.x, z: anchor.position.z, yaw });
    baseY = world.heightAt(anchor.position.x, anchor.position.z);
    build();
    ready = true;
    return true;
  }

  function build(): void {
    const f = frame!;
    atlas = createAtlas(SWATCHES);
    material = createSiteMaterial(atlas);
    const U = (n: keyof typeof SWATCHES) => atlas!.swatchUv(n);
    const parts: Record<string, THREE.BufferGeometry[]> = {};
    // Board on the wall (local +X face): wood frame, dark panel, gold corner studs, a gift bow on top,
    // two dark brackets under it.
    const x0 = D.wallX;
    const zc = D.boardZ;
    const yc = D.boardY;
    parts.board = [
      boxGeo(0.1, D.frame, D.frame, x0 + 0.05, yc, zc, U('wood')),
      boxGeo(0.03, D.panel, D.panel, x0 + 0.115, yc, zc, U('panel')),
      ...[-1, 1].flatMap((sy) => [-1, 1].map((sz) => boxGeo(0.04, 0.12, 0.12, x0 + 0.12, yc + sy * (D.frame / 2 - 0.08), zc + sz * (D.frame / 2 - 0.08), U('gold')))),
      // Bow: a knot and two tilted loops over the frame.
      boxGeo(0.12, 0.16, 0.16, x0 + 0.08, yc + D.frame / 2 + 0.06, zc, U('gold')),
      ...[-1, 1].map((s) => boxGeo(0.08, 0.14, 0.34, x0 + 0.08, 0, 0, U('gold')).rotateX(s * 0.5).translate(0, yc + D.frame / 2 + 0.12, zc + s * 0.2)),
      ...[-1, 1].map((s) => boxGeo(0.16, 0.08, 0.1, x0 + 0.08, yc - D.frame / 2 - 0.04, zc + s * 0.6, U('woodDark'))),
    ];
    // Gift boxes: cream body with a navy ribbon cross, cream lid, gold bow, a shape tag on a stick
    // facing out from the wall (+X). Body and lid are separate parts (the lid pops open).
    D.boxZ.forEach((z, i) => {
      const b = D.box;
      const x = D.boxX;
      parts[`box${i}`] = [
        boxGeo(b, b, b, x, b / 2, z, U('cream')),
        boxGeo(b + 0.02, b + 0.005, 0.12, x, b / 2, z, U('navy')),
        boxGeo(0.12, b + 0.005, b + 0.02, x, b / 2, z, U('navy')),
      ];
      const lidY = b + 0.07;
      const rim = new THREE.CylinderGeometry(0.27, 0.27, 0.05, 32).rotateZ(Math.PI / 2);
      flatUv(rim, U('ink'));
      const face = new THREE.CircleGeometry(0.25, 32).rotateY(Math.PI / 2).translate(0.026, 0, 0);
      remapUv(face, atlas!.cellUv(i));
      const tagY = lidY + 0.47;
      for (const g of [rim, face]) g.translate(x + 0.02, tagY, z);
      parts[`lid${i}`] = [
        boxGeo(b + 0.08, 0.14, b + 0.08, x, lidY, z, U('cream')),
        boxGeo(b + 0.1, 0.145, 0.13, x, lidY, z, U('navy')),
        boxGeo(0.13, 0.145, b + 0.1, x, lidY, z, U('navy')),
        boxGeo(0.14, 0.12, 0.3, x, lidY + 0.12, z, U('gold')).rotateY(0),
        boxGeo(0.04, 0.24, 0.04, x - 0.02, lidY + 0.19, z, U('woodDark')),
        rim,
        face,
      ];
    });
    body = createPartMesh(parts, material, 'glasses:weave:shack');
    body.mesh.position.set(f.toWorld(0, 0).x, baseY, f.toWorld(0, 0).z);
    body.mesh.rotation.y = yaw;
    body.mesh.updateMatrixWorld(true);

    // Dot quads: 2.5 cm in front of the panel, facing local +X.
    const pw = f.toWorld(x0 + 0.13 + 0.025, zc);
    for (const r of [weakRoot, strongRoot]) {
      r.position.set(pw.x, baseY + yc, pw.z);
      r.rotation.set(0, yaw + Math.PI / 2, 0);
      r.updateMatrixWorld(true);
    }

    // Box colliders and the three identical prompts.
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    D.boxZ.forEach((z, i) => {
      const w = f.toWorld(D.boxX, z);
      colliders.push(ctx.physics.addStaticBox(new THREE.Vector3(w.x, baseY + D.box / 2 + 0.07, w.z), new THREE.Vector3(D.box / 2 + 0.04, D.box / 2 + 0.07, D.box / 2 + 0.04), rot));
      const p = new THREE.Vector3(w.x, baseY + D.promptY, w.z);
      boxWorld.push(p);
      const target: Interactable = {
        id: `glasses-weave-shack-${i}`,
        position: () => p,
        radius: D.reach,
        icon: 'hand',
        enabled: () => active && state === 'open',
        onUse: () => press(i),
      };
      offs.push(ctx.interactions.add(target));
    });
    drawTags();
    applyDots();
  }

  function drawTags(): void {
    if (!atlas) return;
    round.shapes.forEach((s, i) => {
      const src = shapeButtonCanvas(s);
      atlas!.drawCell(i, (g) => g.drawImage(src, 0, 0, 256, 256), 0.34);
    });
  }

  function applyDots(): void {
    const t = SHACK_DOTS[tier];
    const p = withChallenge(tier, env.challenge());
    const dotScale = Math.max(0.55, t.dotScale * Math.min(1, 0.6 + 0.4 * (p.size / TIERS[tier].size)));
    if (!pair || pairCells !== t.cells) {
      if (pair) {
        weakRoot.remove(pair.weak);
        strongRoot.remove(pair.strong);
        pair.dispose();
      }
      pair = createDotPicturePair({ shape: answerShape(round), seed: round.seed, size: D.picture, cells: t.cells, dotScale, level: p.level, opacity: p.opacity, facing: 'wall' });
      pair.weak.name = 'glasses:weave:shack:dots-weak';
      pair.strong.name = 'glasses:weave:shack:dots-strong';
      pairCells = t.cells;
      weakRoot.add(pair.weak);
      strongRoot.add(pair.strong);
      for (const r of [weakRoot, strongRoot]) r.updateMatrixWorld(true);
    } else {
      pair.setPicture(answerShape(round), round.seed);
      pair.set({ dotScale, level: p.level, opacity: p.opacity });
    }
    pair.setFade(1);
  }

  function applyRound(): void {
    state = 'open';
    chosen = -1;
    doneT = 0;
    drawTags();
    applyDots();
  }

  function newRound(): void {
    round = makeDotRound(env.rng);
    roundNo++;
    applyRound();
  }

  function clearAnims(): void {
    nap = 0;
    anim.forEach((a, i) => {
      a.open = a.wobble = 1;
      body?.setPart(`box${i}`, null);
      body?.setPart(`lid${i}`, null);
    });
  }

  function press(i: number): void {
    if (state !== 'open' || !active) return;
    const hit = i === round.answer;
    const t = tier;
    chosen = i;
    state = 'done';
    doneT = 0;
    const item = hit ? pickPrize(ctx.economy?.catalog ?? [], (id) => ctx.profile.owns(id)) : null;
    const pay = payout(st, hit, t, !!item);
    st = pay.state;
    wait = pay.wait;
    if (hit) {
      hits++;
      anim[i].open = 0;
      ctx.audio.play('chest');
      ctx.audio.play('fanfare');
      const w = frame!.toWorld(D.boxX, D.boxZ[i]);
      confetti.burst(w.x, baseY + D.box + 0.3, w.z, fxRng, 70, 5);
      if (pay.prize && item) {
        prizeItem = item.id;
        ctx.profile.unlock(item.id, 'chest');
      }
      if (pay.gems > 0) {
        gems += pay.gems;
        env.pay(pay.gems);
      }
    } else {
      misses++;
      anim[i].wobble = 0;
      ctx.audio.play('boing', { volume: 0.55, pitch: 0.8 });
    }
    lastResult = { tier: t, hit, box: i, gems: pay.gems, prize: pay.prize };
    env.result(t, hit);
    tier = nextTier(t, hit);
  }

  const m4 = new THREE.Matrix4();
  const m5 = new THREE.Matrix4();
  const m6 = new THREE.Matrix4();
  function animate(dt: number): void {
    if (!body) return;
    // Nap after a miss: the boxes lean over sleepily and the board goes blank.
    const napTo = state === 'done' && !lastResult?.hit && doneT > 0.8 && doneT < wait - 0.4 ? 1 : 0;
    const napWas = nap;
    nap += (napTo - nap) * Math.min(1, dt * 4);
    if (Math.abs(nap - napTo) < 1e-3) nap = napTo;
    pair?.setFade(1 - nap);
    const napping = nap !== napWas || nap > 0;
    anim.forEach((a, i) => {
      if (a.open >= 1 && a.wobble >= 1 && !napping) return;
      a.open = Math.min(1, a.open + dt / D.open);
      a.wobble = Math.min(1, a.wobble + dt / D.wobble);
      const z = D.boxZ[i];
      const roll = wobbleCurve(a.wobble) * 2.5 + nap * 0.12 * (i - 1 || 1);
      // Roll about the box's X axis (the axis towards the wall) through its base.
      m4.makeTranslation(D.boxX, 0, z).multiply(m5.makeRotationX(roll)).multiply(m6.makeTranslation(-D.boxX, 0, -z));
      if (a.open >= 1 && a.wobble >= 1 && nap === 0) {
        body!.setPart(`box${i}`, null);
        body!.setPart(`lid${i}`, null);
        return;
      }
      body!.setPart(`box${i}`, m4);
      if (a.open < 1) {
        // Lid: pops up, flips back towards the wall, settles half open, then closes at the end.
        const k = a.open;
        const up = Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * 0.45 * (k < 0.8 ? 1 : (1 - k) / 0.2);
        const tilt = Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * 0.9 * (k < 0.8 ? 1 : (1 - k) / 0.2);
        const hinge = D.box + 0.07;
        const lm = new THREE.Matrix4()
          .makeTranslation(D.boxX - D.box / 2, hinge + up, z)
          .multiply(m5.makeRotationZ(tilt))
          .multiply(new THREE.Matrix4().makeTranslation(-(D.boxX - D.box / 2), -hinge, -z));
        body!.setPart(`lid${i}`, m4.clone().multiply(lm));
      } else body!.setPart(`lid${i}`, m4);
    });
  }

  function attach(): void {
    if (!body) return;
    active = true;
    env.add(body.mesh, VisionLayer.Both);
    env.add(weakRoot, VisionLayer.WeakOnly);
    env.add(strongRoot, VisionLayer.StrongOnly);
    env.add(confetti.mesh, VisionLayer.Both);
  }

  function detach(): void {
    active = false;
    confetti.clear();
    clearAnims();
    if (state === 'done') newRound();
    pair?.setFade(1);
    for (const o of [body?.mesh, weakRoot, strongRoot, confetti.mesh]) if (o) env.remove(o);
  }

  function reset(): void {
    tier = 1;
    st = { guard: freshGuard(), prizeGiven: false };
    wait = D.next;
    hits = misses = gems = 0;
    roundNo = 0;
    prizeItem = null;
    lastResult = null;
    confetti.clear();
    clearAnims();
    if (active) detach();
    round = makeDotRound(env.rng);
    if (ready) applyRound();
  }

  return {
    id: env.id,
    kind: env.kind,
    reset,
    update(dt) {
      if (!init()) return;
      const a = ctx.world.anchors.gearShack.position;
      const p = ctx.player.position;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (!active) {
        if (d > D.on) return;
        attach();
      } else if (d > D.off) {
        detach();
        return;
      }
      animate(dt);
      confetti.update(dt);
      if (state === 'done') {
        doneT += dt;
        if (doneT >= wait) {
          clearAnims();
          newRound();
        }
      }
    },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      for (const c of colliders) ctx.physics.removeCollider(c);
      colliders.length = 0;
      for (const o of [body?.mesh, weakRoot, strongRoot, confetti.mesh]) if (o) env.remove(o);
      body?.dispose();
      material?.dispose();
      atlas?.dispose();
      pair?.dispose();
      confetti.dispose();
    },
    debug() {
      const f = frame;
      const pt = (lx: number, lz: number): { x: number; y: number; z: number } => {
        const w = f ? f.toWorld(lx, lz) : { x: 0, z: 0 };
        return { x: w.x, y: baseY, z: w.z };
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
        prizeGiven: st.prizeGiven,
        prizeItem,
        lastResult,
        guard: { ...st.guard },
        wait,
        nap,
        confetti: confetti.live,
        gemsPerTier: { ...SHACK_GEMS },
        yaw,
        boxes: boxWorld.map((b) => ({ x: b.x, y: b.y, z: b.z })),
        stand: D.boxZ.map((z) => pt(D.standX, z)),
        // The default camera view: the hero beside the right-hand box, facing the wall (board and boxes left of the hero).
        view: pt(D.standX + 1.2, D.boxZ[2] + 0.9),
        viewYaw: yaw - Math.PI / 2,
        board: { ...pt(D.wallX + 0.16, D.boardZ), y: baseY + D.boardY },
      };
    },
    force(params) {
      if (!init()) return;
      if (typeof params.tier === 'number') tier = Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier;
      if (params.resetPrize) st = { guard: freshGuard(), prizeGiven: false };
      if (params.newRound) {
        clearAnims();
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

type GameCtxPhysics = WeaveEnv['ctx']['physics'];
