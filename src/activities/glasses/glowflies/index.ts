/**
 * Glow-flies (kind `follow`): weak-eye fireflies drift over a little meadow patch. Run or jump
 * through one to catch it → a sparkle burst on the weak layer, a rising chime for quick catches,
 * gems, and the both-eye glow jar gets one bead fuller (it only ever shows a count).
 *
 * Draw calls: flies (1) + bursts (1, only while one plays) + jar/meadow (1) + jar sparkle (1, only
 * while it plays) + the board (1) ≤ 5.
 */
import * as THREE from 'three';
import { PLAYER } from '../../../config';
import { VisionLayer } from '../../../types';
import type { GlassesTier } from '../../../types';
import { withChallenge } from '../../../vision/toolkit/tiers';
import { seededRng } from '../idle';
import type { Mechanic, MechanicEnv } from '../types';
import { FLIES } from './constants';
import { createGlowInstances, createSparkle } from './fx';
import { buildJar } from './jar';
import { Swarm } from './logic';
import type { PatchShape, V3 } from './logic';

/** World XZ → site-local (inverse of `siteToWorld`). */
export function toLocal(site: { x: number; z: number; yaw: number }, wx: number, wz: number): { x: number; z: number } {
  const dx = wx - site.x;
  const dz = wz - site.z;
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** Jar spot (site-local): on the approach side, opposite the board. */
export function jarSpot(board: { x: number; z: number }): { x: number; z: number } {
  if (Math.abs(board.x) < 0.8) return { x: 2.9, z: 2.2 };
  return { x: board.x < 0 ? 2.7 : -2.7, z: 2.9 };
}

interface Burst {
  t: number;
  p: V3;
  tier: GlassesTier;
}

export function create(env: MechanicEnv): Mechanic {
  const { ctx, site } = env;
  const board = toLocal(site, site.board.x, site.board.z);
  const jar = jarSpot(board);
  const patch: PatchShape = {
    radius: FLIES.patchRadius,
    avoid: [
      { x: board.x, z: board.z, r: FLIES.boardClear },
      { x: jar.x, z: jar.z, r: FLIES.jarClear },
    ],
  };

  // ── both-eye: jar on its stump + meadow flowers (one mesh), and the jar's sparkle ──
  const jarMesh = buildJar({
    jar,
    avoid: [...patch.avoid, { x: jar.x, z: jar.z, r: 1.4 }],
    patchRadius: FLIES.patchRadius,
    notches: FLIES.jarNotches,
    heightAt: (x, z) => {
      const w = env.local(x, z);
      return env.groundAt(w.x, w.z) - site.y;
    },
  });
  jarMesh.mesh.position.set(site.x, site.y, site.z);
  jarMesh.mesh.rotation.y = site.yaw;
  jarMesh.mesh.updateMatrixWorld(true);
  env.add(jarMesh.mesh, VisionLayer.Both);
  const jarWorld = env.local(jar.x, jar.z);
  const jarTop = new THREE.Vector3(jarWorld.x, site.y + jarMesh.topY + 0.15, jarWorld.z);
  const jarGround = env.groundAt(jarWorld.x, jarWorld.z);
  const collider = ctx.physics.addStaticCylinder(new THREE.Vector3(jarWorld.x, jarGround + 0.8, jarWorld.z), 0.8, 0.6);
  const sparkle = createSparkle(24, 'glowflies-jar-sparkle', seededRng(0x5a11));
  env.add(sparkle.mesh, VisionLayer.Both);

  // ── weak eye: flies and their catch bursts ──
  const flies = createGlowInstances(FLIES.maxCount, 'fly', 'glowflies-flies');
  const bursts = createGlowInstances(FLIES.maxBursts * FLIES.burstParticles, 'spark', 'glowflies-bursts');
  const weak = new THREE.Group();
  weak.name = 'glowflies-weak';
  weak.add(flies.mesh, bursts.mesh);
  env.add(weak, VisionLayer.WeakOnly);

  let seed = 0;
  let swarm = makeSwarm(1);
  let caught = 0;
  let combo = 0;
  let sinceCatch = Infinity;
  let time = 0;
  let active = false;
  let havePrev = false;
  const prev = { x: 0, y: 0, z: 0 };
  const chest = { x: 0, y: 0, z: 0 };
  let burstList: Burst[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tmp: V3 = { x: 0, y: 0, z: 0 };

  function makeSwarm(sd: number): Swarm {
    seed = sd >>> 0;
    return new Swarm({ rng: seededRng(seed), patch, toWorld: (x, z) => env.local(x, z), groundAt: (x, z) => env.groundAt(x, z) });
  }

  function newSession(): void {
    swarm = makeSwarm(Math.floor(env.rng() * 2 ** 31));
    caught = 0;
    jarMesh.setFill(0);
    dropTransient();
  }

  function dropTransient(): void {
    burstList = [];
    sparkle.clear();
    combo = 0;
    sinceCatch = Infinity;
    havePrev = false;
  }

  function draw(): void {
    flies.setTime(time);
    bursts.setTime(time);
    const mods = env.challenge();
    swarm.flies.forEach((f, i) => {
      const preset = withChallenge(f.tier, mods);
      let alpha = 0;
      let size = 0;
      if (f.state !== 'gone') {
        swarm.position(f, tmp);
        const born = Math.min(1, f.age / 0.6); // fade in when (re)spawned
        const leaving = f.state === 'leaving' ? 1 - Math.min(1, f.timer / FLIES.leaveSeconds) : 1;
        alpha = preset.opacity * born * leaving;
        size = FLIES.size * preset.size;
      }
      m.compose(p.set(tmp.x, tmp.y, tmp.z), q.identity(), s.setScalar(Math.max(size, 1e-4)));
      flies.set(i, m, preset.level, alpha, f.slot * 1.7);
    });
    flies.commit(swarm.flies.length);

    let n = 0;
    for (const b of burstList) {
      const k = b.t / FLIES.burstSeconds;
      const ease = 1 - (1 - k) * (1 - k);
      // Central flash + a ring of sparks flying out.
      m.compose(p.set(b.p.x, b.p.y, b.p.z), q.identity(), s.setScalar(0.6 + ease * 1.8));
      bursts.set(n++, m, 1, (1 - k) * 0.8);
      for (let j = 0; j < FLIES.burstParticles - 1; j++) {
        const a = (j / (FLIES.burstParticles - 1)) * Math.PI * 2;
        const up = j % 2 === 0 ? 0.8 : -0.2;
        p.set(b.p.x + Math.cos(a) * ease * 1.5, b.p.y + up * ease * 1.1 - ease * ease * 0.4, b.p.z + Math.sin(a) * ease * 1.5);
        m.compose(p, q.identity(), s.setScalar(0.38 * (1 - k * 0.7)));
        bursts.set(n++, m, 1, 1 - k);
      }
    }
    bursts.commit(n);
  }

  function update(dt: number): void {
    time += dt;
    sinceCatch += dt;
    const pp = ctx.player.position;
    chest.x = pp.x;
    chest.y = pp.y + PLAYER.height / 2;
    chest.z = pp.z;
    if (!havePrev) Object.assign(prev, chest);
    const maxStep = FLIES.maxSpeed * Math.max(dt, 1 / 60) + FLIES.slack;
    const from = Math.hypot(chest.x - prev.x, chest.y - prev.y, chest.z - prev.z) > maxStep ? chest : prev;
    const inside = Math.hypot(pp.x - site.x, pp.z - site.z) <= FLIES.insideRadius;

    for (const { fly, at } of swarm.catchAlong(from, chest)) {
      combo = sinceCatch <= FLIES.comboWindow ? combo + 1 : 0;
      sinceCatch = 0;
      if (burstList.length >= FLIES.maxBursts) burstList.shift();
      burstList.push({ t: 0, p: at, tier: fly.tier });
      ctx.audio.play('gem', { pitch: 1 + 0.12 * Math.min(combo, 6) + (fly.tier - 1) * 0.08 });
      caught++;
      jarMesh.setFill(caught);
      jarMesh.gulp();
      sparkle.burst(jarTop, 8 + fly.tier * 2, 0.8);
      env.pay(FLIES.gems[fly.tier]);
      env.result(fly.tier, true);
    }
    for (const ev of swarm.update(dt, inside)) if (ev.type === 'miss') env.result(ev.tier, false);

    Object.assign(prev, chest);
    havePrev = true;

    for (const b of burstList) b.t += dt;
    burstList = burstList.filter((b) => b.t < FLIES.burstSeconds);
    jarMesh.update(dt);
    sparkle.update(dt, ctx.camera);
    draw();
  }

  newSession();
  draw();

  return {
    id: env.id,
    kind: env.kind,
    reset() {
      newSession();
      draw();
    },
    setActive(on) {
      active = on;
      dropTransient();
      if (!on) {
        // Nothing lingers while far: bursts and sparkles are gone, the jar stands still.
        jarMesh.update(10);
        sparkle.update(0, ctx.camera);
      }
      draw();
    },
    update,
    dispose() {
      env.remove(weak);
      env.remove(jarMesh.mesh);
      env.remove(sparkle.mesh);
      ctx.physics.removeCollider(collider);
      flies.dispose();
      bursts.dispose();
      jarMesh.dispose();
      sparkle.dispose();
    },
    debug() {
      const tiers = [0, 0, 0];
      for (const f of swarm.flies) if (f.state === 'alive') tiers[f.tier - 1]++;
      return {
        active,
        seed,
        caught,
        combo,
        time,
        tiers,
        bursts: burstList.length,
        jar: { x: jarWorld.x, z: jarWorld.z },
        inside: Math.hypot(ctx.player.position.x - site.x, ctx.player.position.z - site.z) <= FLIES.insideRadius,
        flies: swarm.flies.map((f) => {
          const at = swarm.position(f);
          return { slot: f.slot, tier: f.tier, state: f.state, age: f.age, life: f.life, gems: FLIES.gems[f.tier], x: at.x, y: at.y, z: at.z };
        }),
      };
    },
    force(params) {
      if (typeof params.seed === 'number') {
        swarm = makeSwarm(params.seed);
        dropTransient();
      }
      if (typeof params.caught === 'number') {
        caught = params.caught;
        jarMesh.setFill(caught);
      }
      // Every alive fly this close to the end of its life (seconds); the next update decides.
      if (typeof params.lifeLeft === 'number') for (const f of swarm.flies) if (f.state === 'alive') f.age = Math.max(0, f.life - params.lifeLeft);
      if (typeof params.time === 'number') time = params.time;
      draw();
    },
    drawObjects: () => env.tracked(),
  };
}
