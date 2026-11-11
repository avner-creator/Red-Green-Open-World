/**
 * Duck Pond: scoop floating rubber ducks with a net. Aim the net over the water with the camera
 * (mouse / stick / drag), Space or E to scoop. Glasses twist: the LUCKY ducks (worth 3) carry a
 * star on their back that only the weak eye sees; the ducks themselves look the same to both
 * eyes. Friends only go for ordinary ducks.
 */
import * as THREE from 'three';
import type { InputState } from '../../../types';
import { createLayerMaterial } from '../../../vision';
import { G, Kit, T, kitMaterial } from '../kit';
import { RIVAL_SKILLS, RivalBrain } from '../rivals';
import { makeRng } from '../rng';
import { EYE, aimAt, aimOnPlaneY, arcPoint } from './common';
import { EMPTY_STUN, DUCK_COUNT, DUCK_RESPAWN, LUCKY_COUNT, LUCKY_POINTS, NET_R, POND, catchDucks, clampToPond, duckXZ, duckYaw } from './duckLogic';
import type { BoothGame, GameEnv, RoundApi } from './types';

const SCOOP_TIME = 0.42;
const COOLDOWN = 0.55;
const HOVER = 0.28;
/** Buckets on the counter (booth frame x) for player, friend 1, friend 2. */
const BUCKET_X = [0.55, -1.7, 1.7];
const COUNTER_Y = 0.72;

function duckGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  const Y = 0xffd83a;
  k.add(G.sphereMid, Y, T(0, 0.08, -0.02, 0, 0.32, 0.22, 0.4));
  k.add(G.cone, Y, T(0, 0.1, -0.22, 0, 0.12, 0.16, 0.12, -1.2));
  k.add(G.sphereLo, Y, T(0, 0.27, 0.1, 0, 0.21, 0.2, 0.2));
  k.add(G.bulb, 0xff8a1a, T(0, 0.25, 0.22, 0, 0.11, 0.05, 0.12));
  for (const s of [-1, 1]) {
    k.add(G.bulb, 0x0a0a10, T(s * 0.065, 0.31, 0.17, 0, 0.05, 0.06, 0.04));
    k.add(G.bulb, 0xffffff, T(s * 0.072, 0.325, 0.185, 0, 0.018, 0.018, 0.012));
    k.add(G.sphereLo, 0xf5c020, T(s * 0.13, 0.12, -0.02, 0, 0.06, 0.12, 0.22));
  }
  return k.build();
}

function netGeometry(): THREE.BufferGeometry {
  // Hoop centre at the origin; the handle reaches back (+Z) and up to the holder's hands.
  const k = new Kit();
  const hoop = new THREE.TorusGeometry(NET_R, 0.03, 6, 24).rotateX(Math.PI / 2);
  k.add(hoop, 0xffcf33, T(0, 0, 0));
  hoop.dispose();
  const bag = new THREE.ConeGeometry(NET_R * 0.95, 0.3, 14, 1, true).rotateX(Math.PI);
  k.add(bag, 0xffffff, T(0, -0.15, 0));
  bag.dispose();
  k.add(G.cylLo, 0xf4efe4, T(0, 0, NET_R + 0.02, 0, 0.05, 1.7, 0.05, 1.12));
  return k.build();
}

interface Duck {
  state: 'swim' | 'fly' | 'gone';
  t: number;
  lucky: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  who: number;
}

interface Net {
  x: number;
  z: number;
  scoop: number;
  cooldown: number;
  /** Rival target duck (−1 none). */
  target: number;
}

export function createDuckPond(env: GameEnv): BoothGame {
  const { ctx, booth, weak, fx } = env;

  // Static dressing: striped tub, gold rim, water, a little striped umbrella island, buckets.
  const { x: px, z: pz, r: pr, waterY } = POND;
  env.addStatic(G.cyl, 0x0b5560, T(px, 0, pz, 0, pr * 2 + 0.1, waterY + 0.04, pr * 2 + 0.1));
  for (const y of [0.16, 0.38]) env.addStatic(G.cyl, 0xf4efe4, T(px, y, pz, 0, pr * 2 + 0.13, 0.08, pr * 2 + 0.13));
  const rim = new THREE.TorusGeometry(pr + 0.02, 0.07, 8, 48).rotateX(Math.PI / 2);
  env.addStatic(rim, 0xffcf33, T(px, waterY + 0.06, pz));
  rim.dispose();
  const water = new THREE.CircleGeometry(pr, 40).rotateX(-Math.PI / 2);
  env.addStatic(water, 0x23679a, T(px, waterY, pz));
  water.dispose();
  for (let i = 0; i < 10; i++) {
    const ring = new THREE.TorusGeometry(0.95 + (i % 3) * 0.28, 0.012, 3, 14, 0.7).rotateX(Math.PI / 2);
    env.addStatic(ring, 0x9fd8f0, T(px, waterY + 0.006, pz, i * 0.63));
    ring.dispose();
  }
  env.addStatic(G.cyl, 0xf4efe4, T(px, waterY - 0.1, pz, 0, 0.12, 1.5, 0.12));
  for (let i = 0; i < 8; i++) {
    const wedge = new THREE.ConeGeometry(0.75, 0.35, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4).translate(0, 0.175, 0);
    env.addStatic(wedge, i % 2 ? 0xf4efe4 : 0x0b5560, T(px, waterY + 1.3, pz, Math.PI / 8));
    wedge.dispose();
  }
  env.addStatic(G.sphere, 0xffcf33, T(px, waterY + 1.66, pz, 0, 0.14, 0.14, 0.14));
  for (const bx of BUCKET_X) {
    env.addStatic(G.cyl, 0xf4efe4, T(bx, COUNTER_Y, -0.4, 0, 0.42, 0.32, 0.42));
    env.addStatic(G.cyl, 0x8c1c34, T(bx, COUNTER_Y + 0.12, -0.4, 0, 0.43, 0.07, 0.43));
  }

  const mat = kitMaterial({ roughness: 0.35 });
  const duckMesh = new THREE.InstancedMesh(duckGeometry(), mat, DUCK_COUNT);
  duckMesh.name = 'carnival-ducks';
  duckMesh.frustumCulled = false;
  booth.add(duckMesh);

  const netMesh = new THREE.InstancedMesh(netGeometry(), mat, 3);
  netMesh.name = 'carnival-nets';
  netMesh.frustumCulled = false;
  netMesh.visible = false;
  booth.add(netMesh);

  // Weak-eye-only lucky stars riding on the ducks' backs.
  const starMat = createLayerMaterial(1);
  const starGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 5);
  const stars = new THREE.InstancedMesh(starGeo, starMat, LUCKY_COUNT + 1);
  stars.name = 'carnival-lucky-stars';
  stars.frustumCulled = false;
  weak.add(stars);

  const rng = makeRng(31);
  const ducks: Duck[] = Array.from({ length: DUCK_COUNT }, () => ({
    state: 'swim' as const,
    t: 0,
    lucky: false,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    who: 0,
  }));
  const pickLucky = (r: () => number): void => {
    for (const d of ducks) d.lucky = false;
    let n = 0;
    let guard = 0;
    while (n < LUCKY_COUNT && guard++ < 100) {
      const i = Math.floor(r() * DUCK_COUNT);
      if (ducks[i].lucky) continue;
      ducks[i].lucky = true;
      n++;
    }
  };
  pickLucky(rng);

  let time = 0;
  const nets: Net[] = [0, 1, 2].map(() => ({ x: 0, z: POND.z, scoop: -1, cooldown: 0, target: -1 }));
  const o = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const p = new THREE.Vector3();

  const draw = (showNets: boolean, holders: THREE.Vector3[]): void => {
    let s = 0;
    for (let i = 0; i < DUCK_COUNT; i++) {
      const d = ducks[i];
      if (d.state === 'gone' && d.t >= 0 && d.t < 0.35) {
        // Popping back in: grow from nothing.
        const [x, z] = duckXZ(i, time);
        const g = d.t / 0.35;
        o.position.set(x, waterY, z);
        o.rotation.set(0, duckYaw(i, time), 0);
        o.scale.setScalar(Math.max(0.001, Math.sin(g * Math.PI * 0.5) * (1 + Math.sin(g * Math.PI) * 0.3)));
      } else if (d.state === 'gone') {
        duckMesh.setMatrixAt(i, zero);
        continue;
      } else if (d.state === 'fly') {
        arcPoint(d.from, d.to, 0.7, Math.min(1, d.t / 0.5), p);
        o.position.copy(p);
        o.rotation.set(d.t * 9, d.t * 5, 0);
        o.scale.setScalar(1 - Math.max(0, d.t / 0.5 - 0.7));
      } else {
        const [x, z] = duckXZ(i, time);
        o.position.set(x, waterY - 0.02 + Math.sin(time * 2.6 + i) * 0.025, z);
        o.rotation.set(Math.sin(time * 1.8 + i) * 0.08, duckYaw(i, time), Math.cos(time * 2.2 + i) * 0.08);
        o.scale.setScalar(1);
      }
      o.updateMatrix();
      duckMesh.setMatrixAt(i, o.matrix);
      if (d.lucky && d.state !== 'fly' && s < stars.count) {
        o.position.y += 0.2;
        o.rotation.set(0, time * 2, 0);
        o.updateMatrix();
        stars.setMatrixAt(s++, o.matrix);
      }
    }
    for (; s < stars.count; s++) stars.setMatrixAt(s, zero);
    duckMesh.instanceMatrix.needsUpdate = true;
    stars.instanceMatrix.needsUpdate = true;

    netMesh.visible = showNets;
    if (!showNets) return;
    nets.forEach((n, i) => {
      const dip = n.scoop >= 0 ? Math.sin(Math.min(1, n.scoop / SCOOP_TIME) * Math.PI) : 0;
      const h = holders[i];
      o.position.set(n.x, waterY + HOVER - dip * 0.42, n.z);
      o.rotation.set(0, Math.atan2(h.x - n.x, h.z - n.z), 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      netMesh.setMatrixAt(i, o.matrix);
    });
    netMesh.instanceMatrix.needsUpdate = true;
  };

  let round: RoundApi | null = null;
  const tickDucks = (dt: number): void => {
    for (const d of ducks) {
      d.t += dt;
      if (d.state === 'fly' && d.t >= 0.5) {
        d.state = 'gone';
        d.t = -DUCK_RESPAWN;
      } else if (d.state === 'gone' && d.t >= 0.35) {
        d.state = 'swim';
      }
    }
  };

  const scoopAt = (who: number, n: Net, r: RoundApi): void => {
    const list = ducks.map((d, i) => {
      const [x, z] = duckXZ(i, time);
      return { x, z, ok: d.state === 'swim' && (who === 0 || !d.lucky) };
    });
    const caught = catchDucks(n.x, n.z, list).slice(0, who === 0 ? 2 : 1);
    env.toWorld(p.set(n.x, waterY + 0.05, n.z));
    fx.pop(p, 0.16, 6);
    ctx.audio.play('splash', { volume: 0.45, pitch: 1.3 });
    let points = 0;
    if (who === 0 && caught.length === 0) r.fumble(EMPTY_STUN);
    for (const i of caught) {
      const d = ducks[i];
      d.state = 'fly';
      d.t = 0;
      d.who = who;
      d.from.set(list[i].x, waterY, list[i].z);
      d.to.set(BUCKET_X[who], COUNTER_Y + 0.35, -0.4);
      if (d.lucky && who === 0) {
        points += LUCKY_POINTS;
        env.toWorld(p.set(list[i].x, waterY + 0.25, list[i].z));
        fx.weakPop(p, 0.3, 12);
        ctx.events.emit('glasses:result', { mechanic: 'luckyDuck', kind: 'find', tier: 1, hit: true });
        // The luck moves to another duck (a new hunt for the weak eye).
        d.lucky = false;
        const free = ducks.map((q, j) => (q.state === 'swim' && !q.lucky ? j : -1)).filter((j) => j >= 0);
        if (free.length) ducks[free[Math.floor(r.rng() * free.length)]].lucky = true;
      } else points += 1;
    }
    if (points) {
      ctx.audio.play('star', { volume: 0.5, pitch: 1.4 });
      r.score(who, points);
    }
  };

  let brains: RivalBrain[] = [];
  const holders = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const netPoint = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let botWait = 0;

  const updateHolders = (r: RoundApi | null): void => {
    holders[0].set(r ? r.playerOffset.x : 0, 1.3, EYE.z + (r ? r.playerOffset.z : 0));
    for (let i = 0; i < 2; i++) {
      const f = r ? r.friendPos(i) : null;
      holders[i + 1].set(f ? f.x : i ? 1.75 : -1.75, 1.3, f ? f.z : 1);
    }
  };

  return {
    id: 'duckPond',
    duration: 30,
    thresholds: [11, 22],
    camera: { distance: 2.5, height: 3.1, fov: 60, lookAhead: 0 },
    aimLimits: { yaw: 0.55, pitchMin: -0.62, pitchMax: -0.12 },
    how: ['aim', 'scoop'],
    idle(dt) {
      time += dt;
      tickDucks(dt);
      draw(false, holders);
    },
    begin(r) {
      round = r;
      pickLucky(r.rng);
      for (const d of ducks) if (d.state !== 'swim') d.state = 'swim';
      nets.forEach((n, i) => {
        n.x = i === 0 ? 0 : i === 1 ? -0.9 : 0.9;
        n.z = POND.z + 0.6;
        n.scoop = -1;
        n.cooldown = 0;
        n.target = -1;
      });
      brains = RIVAL_SKILLS.map((sk, i) => new RivalBrain(sk, makeRng(Math.floor(r.rng() * 1e9) + i), 0.9 + i * 0.5));
      r.aim.yaw = 0;
      r.aim.pitch = -0.32;
      // Step up to the counter so the pond is right in front.
      r.playerOffset.z = -0.45;
      botWait = 0.3;
    },
    update(dt, input: Readonly<InputState>, r) {
      time += dt;
      tickDucks(dt);
      updateHolders(r);
      // Player net follows the aim point on the water.
      eye.copy(EYE).add(r.playerOffset);
      const hit = aimOnPlaneY(eye, r.aim.yaw, r.aim.pitch, waterY, netPoint);
      const me = nets[0];
      if (hit && me.scoop < 0) {
        const [x, z] = clampToPond(hit.x, hit.z);
        me.x += (x - me.x) * Math.min(1, dt * 14);
        me.z += (z - me.z) * Math.min(1, dt * 14);
      }
      for (const [i, n] of nets.entries()) {
        n.cooldown -= dt;
        if (n.scoop >= 0) {
          const before = n.scoop;
          n.scoop += dt;
          if (before < SCOOP_TIME * 0.5 && n.scoop >= SCOOP_TIME * 0.5) {
            if (i === 0) scoopAt(0, n, r);
            else {
              const b = brains[i - 1];
              // A clumsy friend sometimes splashes and misses.
              if (b.roll()) scoopAt(i, n, r);
              else {
                env.toWorld(p.set(n.x, waterY + 0.05, n.z));
                fx.pop(p, 0.16, 6);
                ctx.audio.play('splash', { volume: 0.3, pitch: 1.1 });
              }
            }
          }
          if (n.scoop >= SCOOP_TIME) n.scoop = -1;
        }
      }
      if ((input.jumpPressed || input.usePressed) && me.cooldown <= 0 && me.scoop < 0) {
        me.scoop = 0;
        me.cooldown = COOLDOWN;
        r.playerAct('wave', 0.4);
      }
      // Friends: drift their nets toward an ordinary duck, scoop on their own tempo.
      brains.forEach((b, k) => {
        const n = nets[k + 1];
        if (n.target < 0 || ducks[n.target].state !== 'swim' || ducks[n.target].lucky) {
          const options = ducks.map((d, j) => (d.state === 'swim' && !d.lucky ? j : -1)).filter((j) => j >= 0);
          n.target = options.length ? options[Math.floor(b.random() * options.length)] : -1;
        }
        if (n.target >= 0 && n.scoop < 0) {
          const [tx, tz] = duckXZ(n.target, time + 0.4);
          const [cx, cz] = clampToPond(tx, tz);
          const dx = cx - n.x;
          const dz = cz - n.z;
          const d = Math.hypot(dx, dz);
          const step = Math.min(d, 1.3 * dt);
          if (d > 1e-4) {
            n.x += (dx / d) * step;
            n.z += (dz / d) * step;
          }
        }
        if (b.tick(dt, r.scores[0] - r.scores[k + 1]) && n.scoop < 0) {
          n.scoop = 0;
          r.friendAct(k, 'wave', 0.4);
        }
      });
      draw(true, holders);
    },
    autopilot(dt, r) {
      botWait -= dt;
      const me = nets[0];
      let best = -1;
      let bestD = Infinity;
      ducks.forEach((d, i) => {
        if (d.state !== 'swim') return;
        const [x, z] = duckXZ(i, time + 0.2);
        const dd = Math.hypot(x - me.x, z - me.z) - (d.lucky ? 5 : 0);
        if (dd < bestD) {
          best = i;
          bestD = dd;
        }
      });
      if (best < 0) return {};
      const [x, z] = duckXZ(best, time + 0.2);
      const a = aimAt(eye.copy(EYE).add(r.playerOffset), p.set(x, waterY, z));
      r.aim.yaw = a.yaw;
      r.aim.pitch = a.pitch;
      if (botWait <= 0 && me.cooldown <= 0 && Math.hypot(x - me.x, z - me.z) < 0.15) {
        botWait = 0.3;
        return { jumpPressed: true };
      }
      return {};
    },
    end() {
      round = null;
      for (const d of ducks) {
        if (d.state === 'fly') {
          d.state = 'gone';
          d.t = -0.5;
        }
      }
      netMesh.visible = false;
    },
    dispose() {
      void round;
      booth.remove(duckMesh, netMesh);
      weak.remove(stars);
      duckMesh.geometry.dispose();
      netMesh.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
      mat.dispose();
    },
  };
}
