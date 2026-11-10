/**
 * Pip's lost toys (kind `follow`): a weak-eye paw-print trail leads from Pip's toy basket to a
 * hidden spot. Only the next few prints ahead glow, so the trail has to be followed. At the last
 * print the toy pops out of the ground (both eyes: it is found now), hops and flies into the
 * basket → gems. Three toys per session; later trails are a higher tier.
 *
 * Draw calls: prints (1, weak layer) + basket/bowl (1) + toys (1, only once one is found) +
 * sparkle (1, only while it plays) + the board (1) ≤ 5.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../../types';
import { ROADS } from '../../../world/layout'; // read-only pure data: keeps the trail off the roads
import { withChallenge } from '../../../vision/toolkit/tiers';
import { createGlowInstances, createSparkle } from '../glowflies/fx';
import { seededRng } from '../idle';
import type { Mechanic, MechanicEnv } from '../types';
import { TOYS, TRAIL } from './constants';
import { BASKET_SLOTS, buildBasket, buildToys } from './models';
import { makeTrail, printGlow, ToyRounds } from './trail';
import type { TrailWorld } from './trail';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** World XZ → site-local (inverse of `siteToWorld`). */
function toLocal(site: { x: number; z: number; yaw: number }, wx: number, wz: number): { x: number; z: number } {
  const dx = wx - site.x;
  const dz = wz - site.z;
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** Basket spot (site-local): near the middle, on the side away from the board. */
export function basketSpot(board: { x: number; z: number }): { x: number; z: number } {
  if (Math.abs(board.x) < 0.8) return { x: 1.2, z: 0 };
  return { x: board.x < 0 ? 1.4 : -1.4, z: 0.6 };
}

const easeOutBack = (k: number): number => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const boardL = toLocal(site, site.board.x, site.board.z);
  const spotL = basketSpot(boardL);
  const spot = env.local(spotL.x, spotL.z);
  const spotY = env.groundAt(spot.x, spot.z);
  const bowl = env.local(spotL.x + 0.95, spotL.z + 0.25);

  // ── both eyes: basket + bowl, toys, sparkle ──
  const basket = buildBasket();
  const basketBase = new THREE.Vector3(spot.x, spotY - 0.02, spot.z);
  basket.position.copy(basketBase);
  basket.rotation.y = site.yaw;
  basket.updateMatrixWorld(true);
  env.add(basket, VisionLayer.Both);
  const colliders = [
    ctx.physics.addStaticCylinder(new THREE.Vector3(spot.x, spotY + 0.4, spot.z), 0.4, 0.62),
    ctx.physics.addStaticCylinder(new THREE.Vector3(bowl.x, env.groundAt(bowl.x, bowl.z) + 0.08, bowl.z), 0.08, 0.28),
  ];
  const toys = buildToys(TOYS.perSession + 1);
  env.add(toys.mesh, VisionLayer.Both);
  const sparkle = createSparkle(40, 'toys-sparkle', seededRng(0x70e5));
  env.add(sparkle.mesh, VisionLayer.Both);

  // ── weak eye: the paw prints ──
  const prints = createGlowInstances(TRAIL.maxPrints * 2, 'paw', 'toys-prints');
  env.add(prints.mesh, VisionLayer.WeakOnly);

  const tmp = new THREE.Vector3();
  const world: TrailWorld = {
    heightAt: (x, z) => ctx.world.heightAt(x, z),
    isLand: (x, z) => ctx.world.isLand(x, z),
    waterLevel: ctx.world.waterLevel,
    roads: ROADS,
    anchors: ctx.world.anchors,
    obstacles: [
      { x: site.board.x, z: site.board.z, r: 1.4 },
      { x: spot.x, z: spot.z, r: 1.0 },
      { x: bowl.x, z: bowl.z, r: 0.6 },
    ],
    surfaceAt(x, z) {
      const gy = ctx.world.heightAt(x, z);
      const hit = ctx.physics.raycast(tmp.set(x, gy + 6, z), DOWN, 12);
      if (hit && hit.point.y > gy + 0.3) return null;
      return hit ? Math.max(gy, hit.point.y) : gy;
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
  const rounds = new ToyRounds((seed, tier) => makeTrail(world, spot, seed, tier));

  let active = false;
  let time = 0;
  /** Seconds since each print was passed (-1 = not passed). */
  const passT = new Float32Array(TRAIL.maxPrints).fill(-1);
  let celebrate = -1;
  let landedT = -1;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = new THREE.Euler();

  function newSession(): void {
    rounds.reset(Math.floor(env.rng() * 2 ** 31));
    dropTransient();
    celebrate = -1;
  }

  function dropTransient(): void {
    passT.fill(-1);
    sparkle.clear();
    landedT = -1;
  }

  function slotWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = BASKET_SLOTS[i % BASKET_SLOTS.length];
    return out.set(x, y, z).applyMatrix4(basket.matrixWorld);
  }

  function drawBasket(): void {
    let hop = 0;
    let sq = 1;
    if (celebrate >= 0) {
      const k = celebrate / TOYS.celebrateSeconds;
      hop = Math.abs(Math.sin(k * Math.PI * 3)) * 0.35 * (1 - k);
      sq = 1 + Math.sin(k * Math.PI * 6) * 0.08 * (1 - k);
    }
    basket.position.set(basketBase.x, basketBase.y + hop, basketBase.z);
    basket.scale.set(sq, 2 - sq, sq);
    basket.rotation.y = site.yaw + (celebrate >= 0 ? Math.sin(celebrate * 9) * 0.12 * (1 - celebrate / TOYS.celebrateSeconds) : 0);
    basket.updateMatrixWorld(true);
  }

  function drawToys(): void {
    let count = 0;
    const toyScale = 1;
    for (let i = 0; i < Math.min(rounds.found, TOYS.perSession); i++) {
      slotWorld(i, p);
      m.compose(p, q.setFromEuler(e.set(0.2 * (i - 1), site.yaw + i * 1.9, 0.15)), s.setScalar(toyScale));
      toys.set(count++, m, i);
    }
    if (rounds.state === 'found') {
      const end = rounds.trail().end;
      const t = rounds.t;
      const t1 = TOYS.popSeconds;
      const t2 = t1 + TOYS.hopSeconds;
      const t3 = t2 + TOYS.flightSeconds;
      let spin = 0;
      let sx = 1;
      let sy = 1;
      if (t < t1) {
        const k = t / t1;
        p.set(end.x, end.y - 0.3 + 0.55 * easeOutBack(k), end.z);
        sy = 0.6 + 0.6 * k;
        sx = 1.25 - 0.25 * k;
      } else if (t < t2) {
        const k = (t - t1) / TOYS.hopSeconds;
        p.set(end.x, end.y + 0.25 + Math.sin(k * Math.PI) * 0.6, end.z);
        sy = 1 + Math.sin(k * Math.PI) * 0.2;
        sx = 1 - Math.sin(k * Math.PI) * 0.1;
        spin = k * Math.PI;
      } else {
        const k = Math.min(1, (t - t2) / TOYS.flightSeconds);
        const ke = k * k * (3 - 2 * k);
        slotWorld(rounds.found, n);
        const lift = Math.max(2.5, Math.hypot(n.x - end.x, n.z - end.z) * 0.18);
        p.set(end.x + (n.x - end.x) * ke, end.y + 0.25 + (n.y - end.y - 0.25) * ke + Math.sin(k * Math.PI) * lift, end.z + (n.z - end.z) * ke);
        spin = Math.PI + k * Math.PI * 4;
        if (t >= t3) {
          const kk = Math.min(1, (t - t3) / 0.35);
          sy = 1 - Math.sin(kk * Math.PI) * 0.25;
          sx = 1 + Math.sin(kk * Math.PI) * 0.15;
          spin = 0;
        }
      }
      m.compose(p, q.setFromEuler(e.set(0, site.yaw + spin + rounds.found * 1.9, 0)), s.set(sx * toyScale, sy * toyScale, sx * toyScale));
      toys.set(count++, m, rounds.found);
    }
    toys.commit(count);
  }

  function drawPrints(): void {
    prints.setTime(time);
    if (rounds.state !== 'trail' && rounds.state !== 'found') {
      prints.commit(0);
      return;
    }
    const trail = rounds.trail();
    const preset = withChallenge(rounds.tier, env.challenge());
    const size = TRAIL.printSize * preset.size;
    let count = 0;
    trail.prints.forEach((pr, i) => {
      let glow = rounds.state === 'trail' ? printGlow(i, rounds.next) : 0;
      if (passT[i] >= 0) glow = Math.max(0, 1 - passT[i] / TRAIL.passFade) * TRAIL.glow[0];
      const side = i % 2 === 0 ? -1 : 1;
      const x = pr.x + Math.cos(pr.yaw) * side * TRAIL.sideOffset;
      const z = pr.z - Math.sin(pr.yaw) * side * TRAIL.sideOffset;
      const h = 0.3;
      n.set(ctx.world.heightAt(x - h, z) - ctx.world.heightAt(x + h, z), 2 * h, ctx.world.heightAt(x, z - h) - ctx.world.heightAt(x, z + h)).normalize();
      q.setFromUnitVectors(UP, n).multiply(qy.setFromAxisAngle(UP, pr.yaw + side * 0.12));
      p.set(x, pr.y + 0.07, z);
      m.compose(p, q, s.set(size * 0.85, 1, size));
      prints.set(count++, m, preset.level, glow * preset.opacity, i * 0.9);
      // A soft glow hovering over each print that is next (same draw call).
      const ahead = rounds.state === 'trail' ? printGlow(i, rounds.next) : 0;
      if (ahead > 0) {
        p.set(pr.x, pr.y + TRAIL.puffHeight * preset.size, pr.z);
        m.compose(p, qy.identity(), s.setScalar(TRAIL.puffSize * preset.size));
        prints.set(count++, m, preset.level, ahead * preset.opacity * TRAIL.puffAlpha, i * 0.9, true);
      }
    });
    prints.commit(count);
  }

  function draw(): void {
    drawBasket();
    drawToys();
    drawPrints();
  }

  function update(dt: number): void {
    time += dt;
    const pp = ctx.player.position;
    for (const ev of rounds.update(dt, pp.x, pp.z)) {
      if (ev.type === 'print') passT[ev.index] = 0;
      else if (ev.type === 'found') {
        const end = rounds.trail().end;
        ctx.audio.play('boing', { pitch: 2.1, volume: 0.8 }); // squeak
        sparkle.burst(p.set(end.x, end.y + 0.4, end.z), 12, 1);
        env.pay(ev.gems);
        env.result(ev.tier, true);
      } else if (ev.type === 'landed') {
        landedT = 0;
        ctx.audio.play('land', { pitch: 1.5, volume: 0.6 });
        sparkle.burst(slotWorld(ev.toy, p), 8, 0.6);
        if (ev.toy >= TOYS.perSession - 1) {
          celebrate = 0;
          ctx.audio.play('fanfare');
          sparkle.burst(p.set(basketBase.x, basketBase.y + 0.9, basketBase.z), 18, 1.3);
        }
      } else if (ev.type === 'miss') env.result(ev.tier, false);
      else if (ev.type === 'trail') passT.fill(-1);
    }
    for (let i = 0; i < passT.length; i++) if (passT[i] >= 0) passT[i] += dt;
    if (landedT >= 0) landedT += dt;
    if (celebrate >= 0) {
      celebrate += dt;
      if (celebrate >= TOYS.celebrateSeconds) celebrate = -1;
    }
    sparkle.update(dt, ctx.camera);
    draw();
  }

  newSession();
  drawBasket();
  drawToys();

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      newSession();
      drawBasket();
      drawToys();
      if (active) drawPrints();
    },
    setActive(on) {
      active = on;
      dropTransient();
      if (!on) {
        celebrate = -1;
        sparkle.update(0, ctx.camera);
      }
      drawBasket();
      drawToys();
      if (on) drawPrints();
    },
    update,
    dispose() {
      env.remove(basket);
      env.remove(toys.mesh);
      env.remove(sparkle.mesh);
      env.remove(prints.mesh);
      for (const c of colliders) ctx.physics.removeCollider(c);
      (basket.geometry as THREE.BufferGeometry).dispose();
      (basket.material as THREE.Material).dispose();
      toys.dispose();
      sparkle.dispose();
      prints.dispose();
    },
    debug() {
      const trail = rounds.trail();
      return {
        active,
        state: rounds.state,
        found: rounds.found,
        round: rounds.found,
        tier: rounds.tier,
        seed: rounds.seed,
        attempt: rounds.attempt,
        next: rounds.next,
        started: rounds.started,
        clock: rounds.clock,
        timeLeft: rounds.started ? Math.max(0, TOYS.timeout - rounds.clock) : TOYS.timeout,
        valid: trail.valid,
        candidate: trail.candidate,
        length: trail.length,
        spacing: trail.spacing,
        prints: trail.prints.map((pr) => ({ x: pr.x, y: pr.y, z: pr.z })),
        end: { x: trail.end.x, y: trail.end.y, z: trail.end.z },
        toysShown: toys.mesh.count,
        toyVisible: rounds.state === 'found',
        celebrating: celebrate >= 0,
        basket: { x: spot.x, y: spotY, z: spot.z },
        gems: TOYS.gems[rounds.tier],
      };
    },
    force(params) {
      if (typeof params.found === 'number') {
        rounds.found = Math.max(0, Math.min(TOYS.perSession - 1, Math.floor(params.found)));
        rounds.setSeed(rounds.seed);
      }
      if (typeof params.seed === 'number') rounds.setSeed(params.seed);
      if (typeof params.timeLeft === 'number' && rounds.state === 'trail') {
        rounds.started = true;
        rounds.clock = TOYS.timeout - params.timeLeft;
      }
      dropTransient();
      draw();
    },
    drawObjects: () => env.tracked(),
  };
}
