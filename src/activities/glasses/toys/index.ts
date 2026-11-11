/**
 * Pip's lost toys (kind `follow`) on the booth kit (../booth/README.md).
 *
 * A carnival booth stands beside Pip's big dog basket, which has three empty toy places. Press Use
 * on the glowing pad behind the basket → 3-2-1-GO → a weak-eye paw-print trail lights up, starting
 * right at the pad. Only the next few prints glow, so it has to be followed. At the last print the
 * toy pops out of the ground (both eyes: it is found now) → ✓, confetti, a squeak; it hops up and
 * flies into its place in the basket, its lamp lights and its prize flies out. No toy within 75 s
 * → ✗ (a miss; the same toy waits for the next round on a new trail). One round = one trail = one
 * toy; trails get harder with each toy (tier 1 → 3). The third toy fills the basket: a big
 * celebration and a bonus. After that the booth shows "all done" (lamps lit, basket full) and a
 * free-play trail still pays a little (its toy lands on top of the pile).
 *
 * Draw calls: the booth with the basket and bowl merged into it (1) + prints (1, weak) + upright
 * paw markers (1, weak, during a trail) + toys (1, once one is found) + the kit's fx and confetti
 * (2, during a round) ≤ 6.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import type { GlassesTier } from '../../../types';
import { ROADS } from '../../../world/layout'; // read-only pure data: keeps the trail off the roads
import { withChallenge } from '../../../vision/toolkit/tiers';
import { createGlowInstances } from '../glowflies/fx';
import type { Mechanic, MechanicEnv } from '../types';
import { BASKET, LAND_AT, livePrize, SPOT, TOY_BOOTH, TOYS, toyRules, TRAIL } from './constants';
import { TOYS_DEMO } from './demo';
import { appendToBooth, basketGeometry, buildToys, poseRange } from './models';
import { ToySession } from './session';
import { makeTrail, printGlow } from './trail';
import type { TrailWorld } from './trail';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

const easeOutBack = (k: number): number => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
/** Rest yaw of each toy kind in the basket (faces the pad; the duck in three-quarter view). */
const TOY_YAW = [0.4, 0.15, -Math.PI / 2 + 0.55, 0.9] as const;

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const ground = (lx: number, lz: number): number => {
    const w = env.local(lx, lz);
    return env.groundAt(w.x, w.z) - site.y;
  };

  // ── the session and the booth ──
  let session: ToySession | null = null;
  const prize = livePrize(() => session?.prize ?? 0);
  let trailShown = false;
  const kit = env.booth({
    ground,
    spec: TOY_BOOTH,
    demo: TOYS_DEMO,
    rules: toyRules(prize),
    hooks: {
      onTry() {
        beginTrail();
      },
      onIdle() {
        // The round is over or cancelled: the trail goes; a toy already flying keeps flying.
        trailShown = false;
        session?.stop();
      },
    },
  });

  // ── Pip's basket and bowl, merged into the booth's single mesh ──
  const bk = SPOT.basket;
  const basketY = Math.min(ground(bk.x, bk.z), ground(bk.x - 0.6, bk.z), ground(bk.x + 0.6, bk.z), ground(bk.x, bk.z + 0.5), ground(bk.x, bk.z - 0.5)) - 0.02;
  const bowlRel = { x: SPOT.bowl.x - bk.x, y: ground(SPOT.bowl.x, SPOT.bowl.z) - basketY - 0.02, z: SPOT.bowl.z - bk.z };
  const bgeo = basketGeometry(bowlRel);
  bgeo.translate(bk.x, basketY, bk.z);
  const boothGeo = kit.booth.mesh.geometry;
  const basketRange = appendToBooth(boothGeo, bgeo);
  bgeo.dispose();
  const basketLocal = new THREE.Vector3(bk.x, basketY, bk.z);
  const toWorld = (lx: number, ly: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 => kit.toWorld({ x: lx, y: ly, z: lz }, out);
  const basketWorld = toWorld(bk.x, basketY, bk.z);
  const bowlWorld = toWorld(SPOT.bowl.x, ground(SPOT.bowl.x, SPOT.bowl.z), SPOT.bowl.z);
  const colliders = [
    ctx.physics.addStaticCylinder(new THREE.Vector3(basketWorld.x, basketWorld.y + 0.4, basketWorld.z), 0.42, 0.88),
    ctx.physics.addStaticCylinder(new THREE.Vector3(bowlWorld.x, bowlWorld.y + 0.08, bowlWorld.z), 0.08, 0.3),
  ];

  // ── both eyes: the toys (in the basket and the one flying) ──
  const toys = buildToys(BASKET.slots.length + 1);
  env.add(toys.mesh, VisionLayer.Both);

  // ── weak eye: the paw prints ──
  const prints = createGlowInstances(TRAIL.maxPrints, 'paw', 'toys-prints');
  env.add(prints.mesh, VisionLayer.WeakOnly);
  // Upright paw glyphs over the prints that are next: the trail reads at grazing angles too.
  const markers = createGlowInstances(TRAIL.glow.length, 'paw', 'toys-markers', { billboard: true });
  env.add(markers.mesh, VisionLayer.WeakOnly);
  /** Test hook: hide the weak-eye trail (coverage baseline). */
  let hideTrail = false;

  // ── the trail's world probes ──
  const pad = toWorld(SPOT.pad.x, ground(SPOT.pad.x, SPOT.pad.z), SPOT.pad.z);
  const mqBox = kit.booth.build.marqueeBox;
  const marquee = toWorld((mqBox.min.x + mqBox.max.x) / 2, 0, (mqBox.min.z + mqBox.max.z) / 2);
  const tmp = new THREE.Vector3();
  const sky = new THREE.Vector3();
  const world: TrailWorld = {
    heightAt: (x, z) => ctx.world.heightAt(x, z),
    isLand: (x, z) => ctx.world.isLand(x, z),
    waterLevel: ctx.world.waterLevel,
    roads: ROADS,
    anchors: ctx.world.anchors,
    obstacles: [
      { x: marquee.x, z: marquee.z, r: SPOT.marqueeClear },
      { x: basketWorld.x, z: basketWorld.z, r: SPOT.basketClear },
      { x: bowlWorld.x, z: bowlWorld.z, r: SPOT.bowlClear },
    ],
    surfaceAt(x, z) {
      const gy = ctx.world.heightAt(x, z);
      const hit = ctx.physics.raycast(tmp.set(x, gy + 6, z), DOWN, 12);
      if (hit && hit.point.y > gy + 0.3) return null;
      return hit ? Math.max(gy, hit.point.y) : gy;
    },
    openSky(x, z) {
      const gy = ctx.world.heightAt(x, z);
      if (ctx.physics.raycast(tmp.set(x, gy + 0.6, z), UP, 30)) return false;
      // Canopies have no colliders: keep clear of every trunk (or wall) we can detect.
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const hit = ctx.physics.raycast(tmp.set(x, gy + 1.2, z), sky.set(Math.sin(a), 0, Math.cos(a)), TRAIL.skyClear);
        if (hit && hit.normal.y < 0.7) return false;
      }
      return true;
    },
    blockedBetween(ax, az, bx, bz) {
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) return false;
      const dir = new THREE.Vector3(dx / len, 0, dz / len);
      const gy = ctx.world.heightAt(ax, az);
      for (const h of [0.5, 1.2]) {
        const hit = ctx.physics.raycast(tmp.set(ax, gy + h, az), dir, len);
        if (hit && hit.normal.y < 0.7) return true;
      }
      return false;
    },
  };
  // On the pad the child looks along site −Z (over the basket, towards the booth's side).
  const forward = site.yaw + Math.PI;
  const s = new ToySession((seed, tier) => makeTrail(world, pad, seed, tier, { forward }));
  session = s;

  let active = false;
  let time = 0;
  /** Seconds since each print was passed (-1 = not passed). */
  const passT = new Float32Array(TRAIL.maxPrints).fill(-1);
  let celebrate = -1;
  /** Seconds since the last toy landed (squash), and which slot. */
  let landedT = -1;
  let landedSlot = -1;
  const m = new THREE.Matrix4();
  const hopM = new THREE.Matrix4();
  const hopOut = new THREE.Matrix4();
  const hopBack = new THREE.Matrix4().makeTranslation(-basketLocal.x, -basketLocal.y, -basketLocal.z);
  const hopV = new THREE.Vector3();
  const hopQ = new THREE.Quaternion();
  const hopE = new THREE.Euler();
  const hopS = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = new THREE.Euler();
  const head = new THREE.Vector3();

  function beginTrail(): void {
    s.begin();
    passT.fill(-1);
    trailShown = true;
  }

  /** The basket's hop (booth-mesh-local), or null at rest. */
  function hop(): THREE.Matrix4 | null {
    if (celebrate < 0) return null;
    const k = celebrate / TOYS.celebrateSeconds;
    const up = Math.abs(Math.sin(k * Math.PI * 3)) * 0.4 * (1 - k);
    const sq = 1 + Math.sin(k * Math.PI * 6) * 0.08 * (1 - k);
    const roll = Math.sin(celebrate * 9) * 0.1 * (1 - k);
    hopM.compose(hopV.set(0, up, 0), hopQ.setFromEuler(hopE.set(0, roll, 0)), hopS.set(sq, 2 - sq, sq));
    return hopOut.makeTranslation(basketLocal.x, basketLocal.y, basketLocal.z).multiply(hopM).multiply(hopBack);
  }

  /** World centre of basket place `i` (with the basket's hop). */
  function slotWorld(i: number, h: THREE.Matrix4 | null, out: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = BASKET.slots[Math.min(i, BASKET.slots.length - 1)];
    out.set(basketLocal.x + x, basketLocal.y + y, basketLocal.z + z);
    if (h) out.applyMatrix4(h);
    return kit.booth.mesh.localToWorld(out);
  }

  function drawBasket(h: THREE.Matrix4 | null): void {
    poseRange(boothGeo, basketRange, h);
  }

  function restToy(count: number, slot: number, kind: number, h: THREE.Matrix4 | null): number {
    slotWorld(slot, h, p);
    let sx = 1;
    let sy = 1;
    if (landedSlot === slot && landedT >= 0 && landedT < TOYS.settleSeconds) {
      const k = landedT / TOYS.settleSeconds;
      sy = 1 - Math.sin(k * Math.PI) * 0.25;
      sx = 1 + Math.sin(k * Math.PI) * 0.15;
    }
    m.compose(p, q.setFromEuler(e.set(0, site.yaw + TOY_YAW[Math.min(kind, 3)], 0)), sc.set(sx, sy, sx));
    toys.set(count, m, kind);
    return count + 1;
  }

  function drawToys(h: THREE.Matrix4 | null): void {
    let count = 0;
    for (let i = 0; i < Math.min(s.inBasket, TOYS.perSession); i++) count = restToy(count, i, i, h);
    if (s.topToy >= 0) count = restToy(count, 3, s.topToy, h);
    if (s.state === 'show') {
      const end = s.trail().end;
      const t = s.clock;
      const S = TOYS.showScale;
      const base = end.y + 0.32 * S; // toy centre resting on the ground
      const t1 = TOYS.popSeconds;
      const t2 = t1 + TOYS.launchSeconds;
      const t3 = t2 + TOYS.holdSeconds;
      let spin = 0;
      let tumble = 0;
      let sx = 1;
      let sy = 1;
      let size = S;
      if (t < t1) {
        // Bursts out of the ground: squashed, then stretched.
        const k = t / t1;
        p.set(end.x, base - 0.5 * S + 0.5 * S * easeOutBack(k), end.z);
        sy = 0.55 + 0.7 * k;
        sx = 1.3 - 0.4 * k;
      } else if (t < t2) {
        // Launch 2.8 m up with a spin, stretched along the way.
        const k = (t - t1) / TOYS.launchSeconds;
        p.set(end.x, base + TOYS.launchHeight * (1 - (1 - k) * (1 - k)), end.z);
        sy = 1.25 - 0.25 * k;
        sx = 0.88 + 0.12 * k;
        spin = k * Math.PI * 3;
        tumble = Math.sin(k * Math.PI) * 0.5;
      } else if (t < t3) {
        // Hold at the top for a beat: a happy wobble.
        const k = (t - t2) / TOYS.holdSeconds;
        p.set(end.x, base + TOYS.launchHeight + Math.sin(k * Math.PI * 2) * 0.08, end.z);
        sy = 1 + Math.sin(k * Math.PI * 4) * 0.07;
        sx = 1 - Math.sin(k * Math.PI * 4) * 0.05;
        spin = Math.PI * 3 + k * 0.8;
      } else {
        // Arc home into its place in the basket (the pile top in free play).
        const k = Math.min(1, (t - t3) / TOYS.flightSeconds);
        const ke = k * k * (3 - 2 * k);
        slotWorld(s.free ? 3 : s.toy, h, n);
        const top = base + TOYS.launchHeight;
        const lift = Math.max(1.5, Math.hypot(n.x - end.x, n.z - end.z) * 0.12);
        p.set(end.x + (n.x - end.x) * ke, top + (n.y - top) * ke + Math.sin(k * Math.PI) * lift, end.z + (n.z - end.z) * ke);
        size = S + (1 - S) * ke;
        spin = Math.PI * 3.25 + k * Math.PI * 4;
      }
      m.compose(p, q.setFromEuler(e.set(tumble, site.yaw + spin + s.toy * 1.9, 0)), sc.set(sx * size, sy * size, sx * size));
      toys.set(count++, m, s.toy);
    }
    toys.commit(count);
  }

  function drawPrints(): void {
    prints.setTime(time);
    markers.setTime(time);
    if (hideTrail || !trailShown || (s.state !== 'trail' && s.state !== 'show')) {
      prints.commit(0);
      markers.commit(0);
      return;
    }
    const trail = s.trail();
    const preset = withChallenge(s.tier, env.challenge());
    const size = TRAIL.printSize * preset.size;
    let count = 0;
    let mk = 0;
    trail.prints.forEach((pr, i) => {
      let glow = s.state === 'trail' ? printGlow(i, s.next) : 0;
      if (passT[i] >= 0) glow = Math.max(0, 1 - passT[i] / TRAIL.passFade) * TRAIL.glow[0];
      const side = i % 2 === 0 ? -1 : 1;
      const x = pr.x + Math.cos(pr.yaw) * side * TRAIL.sideOffset;
      const z = pr.z - Math.sin(pr.yaw) * side * TRAIL.sideOffset;
      const hh = 0.3;
      n.set(ctx.world.heightAt(x - hh, z) - ctx.world.heightAt(x + hh, z), 2 * hh, ctx.world.heightAt(x, z - hh) - ctx.world.heightAt(x, z + hh)).normalize();
      q.setFromUnitVectors(UP, n).multiply(qy.setFromAxisAngle(UP, pr.yaw + side * 0.12));
      p.set(x, pr.y + 0.07, z);
      m.compose(p, q, sc.set(size * 0.85, 1, size));
      prints.set(count++, m, preset.level, glow * preset.opacity, i * 0.9);
      // An upright paw floating over each print that is next (nearest brightest), gently bobbing.
      const ahead = s.state === 'trail' ? printGlow(i, s.next) : 0;
      if (ahead > 0 && mk < TRAIL.glow.length) {
        p.set(pr.x, pr.y + (TRAIL.markerHeight + Math.sin(time * 2.2 + i * 0.9) * TRAIL.markerBob) * (0.7 + 0.3 * preset.size), pr.z);
        m.compose(p, qy.identity(), sc.setScalar(TRAIL.markerSize * preset.size));
        markers.set(mk++, m, preset.level, ahead * preset.opacity, i * 0.9);
      }
    });
    prints.commit(count);
    markers.commit(mk);
  }

  /** The three lamps are the session's three toys (the kit's chase runs during a celebration). */
  function lamps(): void {
    const ph = kit.phase();
    if (ph === 'celebrate' || ph === 'prize') return;
    if (ph === 'idle' && s.found === 0) return; // attract twinkle
    kit.booth.setLampMode('manual');
    for (let i = 0; i < TOYS.perSession; i++) kit.booth.setLamp(i, i < s.found ? 'hit' : 'off');
  }

  function draw(): void {
    const h = hop();
    drawBasket(h);
    drawToys(h);
    drawPrints();
  }

  /** The kit's round tier is the toy number (the result events carry it). */
  function syncTier(): void {
    if (kit.phase() === 'idle') kit.round.tier = s.tier;
  }

  const localAt = (w: THREE.Vector3): { x: number; y: number; z: number } => kit.toLocal(w);

  function onEvents(events: ReturnType<ToySession['update']>, fx: boolean): void {
    for (const ev of events) {
      if (ev.type === 'print') passT[ev.index] = 0;
      else if (ev.type === 'found') {
        const end = s.trail().end;
        ctx.audio.play('boing', { pitch: 2.1, volume: 0.8 }); // squeak
        // ✓ high over the hidden spot (the toy launches below it); confetti; lamp; the prize later.
        kit.report(true, localAt(p.set(end.x, end.y + TOYS.checkHeight, end.z)));
      } else if (ev.type === 'timeout') {
        head.copy(ctx.player.position);
        head.y += 2.6;
        kit.report(false, localAt(head));
      } else if (ev.type === 'landed') {
        landedT = 0;
        landedSlot = ev.free ? 3 : ev.toy;
        if (!fx) continue;
        ctx.audio.play('land', { pitch: 1.5, volume: 0.6 });
        slotWorld(landedSlot, null, p);
        kit.fx.burst(p.clone().add(n.set(0, 0.4, 0)), 1.3);
        kit.fx.confettiAt(p, 24, 2.6);
        if (ev.full) {
          // The basket is full: Pip's toys are home. Big celebration at the basket.
          celebrate = 0;
          ctx.audio.play('fanfare');
          p.copy(basketWorld).add(n.set(0, 1.2, 0));
          kit.fx.confettiAt(p, 110, 6.5);
          kit.fx.burst(p.clone().add(n.set(0, 0.8, 0)), 3.4);
        }
      }
    }
  }

  function update(dt: number): void {
    kit.update(dt);
    syncTier();
    time += dt;
    const pp = ctx.player.position;
    const showT = s.state === 'show' ? s.clock : -1;
    onEvents(s.update(dt, pp.x, pp.z), true);
    // At the top of the pop: a both-eye star burst around the toy (it is found now) and a boing.
    const top = TOYS.popSeconds + TOYS.launchSeconds;
    if (s.state === 'show' && showT >= 0 && showT < top && s.clock >= top) {
      const end = s.trail().end;
      kit.fx.burst(p.set(end.x, end.y + 0.32 * TOYS.showScale + TOYS.launchHeight, end.z), 3.2);
      ctx.audio.play('boing', { pitch: 2.4, volume: 0.7 });
    }
    for (let i = 0; i < passT.length; i++) if (passT[i] >= 0) passT[i] += dt;
    if (landedT >= 0) {
      landedT += dt;
      if (landedT >= TOYS.settleSeconds) landedT = -1;
    }
    if (celebrate >= 0) {
      celebrate += dt;
      if (celebrate >= TOYS.celebrateSeconds) celebrate = -1;
    }
    lamps();
    draw();
  }

  function newSession(): void {
    s.reset(Math.floor(env.rng() * 2 ** 31));
    passT.fill(-1);
    trailShown = false;
    celebrate = -1;
    landedT = -1;
    landedSlot = -1;
  }

  newSession();
  draw();

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      newSession();
      kit.reset();
      syncTier();
      lamps();
      draw();
    },
    setActive(on) {
      active = on;
      kit.setActive(on);
      if (!on) {
        // Far away: a flying toy lands at once, quietly; the basket stops hopping.
        onEvents(s.settle(), false);
        celebrate = -1;
        landedT = -1;
        trailShown = false;
        s.stop();
      }
      draw();
    },
    update,
    dispose() {
      kit.dispose();
      env.remove(toys.mesh);
      env.remove(prints.mesh);
      env.remove(markers.mesh);
      for (const c of colliders) ctx.physics.removeCollider(c);
      toys.dispose();
      prints.dispose();
      markers.dispose();
    },
    debug() {
      const trail = s.trail();
      const k = kit.debug();
      const pt = (lx: number, lz: number): { x: number; y: number; z: number } => {
        const w = env.local(lx, lz);
        return { x: w.x, y: env.groundAt(w.x, w.z), z: w.z };
      };
      return {
        active,
        state: s.state,
        phase: kit.phase(),
        found: s.found,
        inBasket: s.inBasket,
        topToy: s.topToy,
        done: s.done,
        free: s.free,
        round: s.found,
        tier: s.tier,
        roundTier: kit.tier(),
        seed: s.seed,
        attempt: s.attempt,
        next: s.next,
        clock: s.clock,
        timeLeft: s.state === 'trail' ? Math.max(0, TOYS.timeout - s.clock) : TOYS.timeout,
        trailShown,
        valid: trail.valid,
        candidate: trail.candidate,
        length: trail.length,
        spacing: trail.spacing,
        prints: trail.prints.map((pr) => ({ x: pr.x, y: pr.y, z: pr.z })),
        end: { x: trail.end.x, y: trail.end.y, z: trail.end.z },
        toysShown: toys.mesh.count,
        toyVisible: s.state === 'show',
        celebrating: celebrate >= 0,
        prize: s.prize,
        gems: kit.round.totalGems,
        landAt: LAND_AT,
        kit: k,
        basket: { x: basketWorld.x, y: basketWorld.y, z: basketWorld.z },
        /** The start pad (world, on the ground): the trail starts at its rim. */
        pad: { x: pad.x, y: pad.y, z: pad.z },
        /** Standing on the pad, facing over the basket (`yaw`): the default camera view of the play. */
        view: { x: pad.x, y: pad.y, z: pad.z, yaw: forward },
        /** 2.8 m behind the pad, facing the same way. */
        padBack: { ...pt(SPOT.pad.x, SPOT.pad.z + 2.8), yaw: forward },
        booth: { x: marquee.x, y: env.groundAt(marquee.x, marquee.z), z: marquee.z },
        /** ~30 m out on the approach, facing the booth and the basket. */
        far: (() => {
          const a = pt(SPOT.pad.x, SPOT.pad.z + 28);
          const b = pt(-1.2, 0);
          return { ...a, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
        })(),
        yaw: site.yaw,
      };
    },
    force(params) {
      if (typeof params.found === 'number') {
        s.found = Math.max(0, Math.min(TOYS.perSession, Math.floor(params.found)));
        s.inBasket = s.found;
        s.setSeed(s.seed);
        syncTier();
      }
      if (params.play) {
        const t = typeof params.tier === 'number' ? (Math.min(3, Math.max(1, Math.round(params.tier))) as GlassesTier) : s.tier;
        kit.forcePlay(t);
      }
      if (params.start) kit.start();
      if (typeof params.seed === 'number') s.setSeed(params.seed);
      if (typeof params.hideTrail === 'boolean') hideTrail = params.hideTrail;
      if (typeof params.timeLeft === 'number' && s.state === 'trail') s.clock = TOYS.timeout - params.timeLeft;
      if (typeof params.pin === 'number') kit.pin(params.pin);
      if (params.seed !== undefined || params.found !== undefined) passT.fill(-1);
      lamps();
      draw();
    },
    drawObjects: () => env.tracked(),
  };
}
