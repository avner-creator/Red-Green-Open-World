/**
 * Balloon Pop: throw soft beanbags at a wall of bobbing balloons. Ordinary balloons are both-eye;
 * the PRIZE balloons (3×) are weak-eye-only. Aim with the camera (mouse / stick / drag), Space or E
 * to throw; generous aim assist. Friends only ever aim at ordinary balloons, so nothing they do
 * gives away where a prize balloon is.
 */
import * as THREE from 'three';
import type { InputState } from '../../../types';
import { createLayerMaterial } from '../../../vision';
import { G, Kit, T, kitMaterial } from '../kit';
import { RIVAL_SKILLS, RivalBrain } from '../rivals';
import { makeRng } from '../rng';
import { ASSIST_RADIUS, COLS, PRIZE_POINTS, PRIZE_RESPAWN, RESPAWN, ROWS, WALL_Z, assistPick, pickPrizeSlots, slotXY } from './balloonLogic';
import type { AssistTarget } from './balloonLogic';
import { EYE, Projectiles, aimAt, aimOnPlaneZ } from './common';
import type { Shot } from './common';
import type { BoothGame, GameEnv, RoundApi } from './types';

const N = COLS * ROWS;
/** Bright balloon colours: light in both the R and the G channel (read by brightness). */
const PALETTE = [0xffe14a, 0xffffff, 0xd8ff8a, 0xffd0a0, 0xfff3b0, 0xc8f4ff];
const THROW_COOLDOWN = 0.3;
const FLIGHT = 0.42;

interface Slot {
  prize: boolean;
  alive: boolean;
  /** 0..1 grow-in after a respawn. */
  grow: number;
  respawn: number;
  phase: number;
  x: number;
  y: number;
}

interface Bag {
  who: number;
  /** Target slot, or −1 for a miss. */
  slot: number;
}

function balloonGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  k.add(G.sphereMid, 0xffffff, T(0, 0, 0, 0, 0.44, 0.52, 0.44));
  k.add(G.cone, 0xffffff, T(0, -0.3, 0, 0, 0.09, 0.08, 0.09, Math.PI));
  k.add(G.cylLo, 0xdddddd, T(0, -0.62, 0, 0, 0.012, 0.32, 0.012));
  return k.build();
}

function prizeGeometry(): THREE.BufferGeometry {
  // Same balloon, a bit bigger, with a star tag hanging below.
  const k = new Kit();
  k.add(G.sphereMid, 0xffffff, T(0, 0, 0, 0, 0.5, 0.6, 0.5));
  k.add(G.cone, 0xffffff, T(0, -0.34, 0, 0, 0.1, 0.09, 0.1, Math.PI));
  k.add(G.cylLo, 0xffffff, T(0, -0.62, 0, 0, 0.016, 0.28, 0.016));
  const star = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 5).rotateX(Math.PI / 2);
  k.add(star, 0xffffff, T(0, -0.66, 0, Math.PI / 10));
  star.dispose();
  return k.build();
}

export function createBalloonPop(env: GameEnv): BoothGame {
  const { ctx, booth, weak, fx } = env;
  const rng = makeRng(11);

  // Static dressing: cork board with a gold frame and pins, a "3×" star sticker in brightness only.
  env.addStatic(G.box, 0x2c2140, T(0, 1.05, WALL_Z - 0.28, 0, 4.7, 1.95, 0.08));
  env.addStatic(G.box, 0xffcf33, T(0, 1.0, WALL_Z - 0.3, 0, 4.86, 2.08, 0.05));
  for (let i = 0; i < N; i++) {
    const [x, y] = slotXY(i);
    env.addStatic(G.sphereLo, 0xffffff, T(x, y - 0.67, WALL_Z - 0.22, 0, 0.06, 0.06, 0.06), 0.4);
  }
  // A basket of beanbags on the counter.
  env.addStatic(G.cyl, 0x9a6a3a, T(-1.75, 1.04, -0.42, 0, 0.6, 0.26, 0.5));
  for (let i = 0; i < 5; i++) env.addStatic(G.boxC, i % 2 ? 0xffd84a : 0xffffff, T(-1.88 + (i % 3) * 0.13, 1.33, -0.47 + (i % 2) * 0.1, i, 0.15, 0.1, 0.15));

  // Ordinary balloons: one instanced draw (both-eye).
  const balloonMat = kitMaterial({ roughness: 0.25 });
  const balloons = new THREE.InstancedMesh(balloonGeometry(), balloonMat, N);
  balloons.name = 'carnival-balloons';
  balloons.castShadow = false;
  balloons.frustumCulled = false;
  const tint = new THREE.Color();
  for (let i = 0; i < N; i++) balloons.setColorAt(i, tint.set(PALETTE[(i * 5 + Math.floor(i / COLS)) % PALETTE.length]));
  booth.add(balloons);

  // Prize balloons: weak-eye-only layer, brightness material.
  const prizeMat = createLayerMaterial(1);
  const prizes = new THREE.InstancedMesh(prizeGeometry(), prizeMat, N);
  prizes.name = 'carnival-prize-balloons';
  prizes.frustumCulled = false;
  weak.add(prizes);

  // Reticle (both-eye, only during a round): white ring with a black rim.
  const retKit = new Kit();
  retKit.add(new THREE.TorusGeometry(0.2, 0.035, 6, 28), 0xffffff, T(0, 0, 0.01), 1);
  retKit.add(new THREE.TorusGeometry(0.2, 0.06, 6, 28), 0x000000, T(0, 0, -0.01));
  retKit.add(new THREE.CircleGeometry(0.035, 10), 0xffffff, T(0, 0, 0.012), 1);
  const reticle = new THREE.Mesh(retKit.build(), balloonMat);
  reticle.name = 'carnival-reticle';
  reticle.visible = false;
  booth.add(reticle);

  const slots: Slot[] = [];
  const resetSlots = (prizeSlots: number[]): void => {
    slots.length = 0;
    for (let i = 0; i < N; i++) {
      const [x, y] = slotXY(i);
      slots.push({ prize: prizeSlots.includes(i), alive: true, grow: 1, respawn: 0, phase: i * 1.37, x, y });
    }
  };
  resetSlots(pickPrizeSlots(rng));

  let time = 0;
  const o = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const pos = (s: Slot, out: THREE.Vector3): THREE.Vector3 =>
    out.set(s.x + Math.sin(time * 1.1 + s.phase) * 0.04, s.y + Math.sin(time * 1.7 + s.phase) * 0.06, WALL_Z);

  const tmp = new THREE.Vector3();
  const draw = (): void => {
    for (let i = 0; i < N; i++) {
      const s = slots[i];
      const visible = s.alive && s.grow > 0;
      pos(s, tmp);
      const g = s.grow < 1 ? Math.sin(s.grow * Math.PI * 0.5) * (1 + Math.sin(s.grow * Math.PI) * 0.25) : 1;
      o.position.copy(tmp);
      o.rotation.set(0, 0, Math.sin(time * 1.3 + s.phase) * 0.12);
      o.scale.setScalar(Math.max(0.001, g));
      o.updateMatrix();
      balloons.setMatrixAt(i, visible && !s.prize ? o.matrix : zero);
      prizes.setMatrixAt(i, visible && s.prize ? o.matrix : zero);
    }
    balloons.instanceMatrix.needsUpdate = true;
    prizes.instanceMatrix.needsUpdate = true;
  };

  const tick = (dt: number): void => {
    time += dt;
    for (let i = 0; i < N; i++) {
      const s = slots[i];
      if (s.alive) {
        if (s.grow < 1) s.grow = Math.min(1, s.grow + dt * 3);
        continue;
      }
      s.respawn -= dt;
      if (s.respawn > 0) continue;
      if (s.prize) {
        // A prize balloon comes back somewhere else on the wall (a fresh hunt for the weak eye).
        const free = slots.map((q, j) => (q.alive && !q.prize ? j : -1)).filter((j) => j >= 0);
        if (free.length) {
          const j = free[Math.floor(rng() * free.length)];
          slots[j].prize = true;
          slots[j].grow = 0;
          s.prize = false;
        }
      }
      s.alive = true;
      s.grow = 0;
    }
    draw();
  };

  let round: RoundApi | null = null;
  const world = new THREE.Vector3();
  const onLand = (shot: Shot<Bag>): void => {
    const r = round;
    const s = shot.data.slot >= 0 ? slots[shot.data.slot] : null;
    if (s && s.alive) {
      pos(s, tmp);
      if (tmp.distanceTo(shot.to) < 0.5) {
        s.alive = false;
        s.respawn = s.prize ? PRIZE_RESPAWN : RESPAWN;
        env.toWorld(world.copy(tmp));
        if (s.prize) {
          fx.weakPop(world, 0.42, 16);
          ctx.audio.play('boing', { volume: 0.7, pitch: 2.1 });
        } else {
          fx.pop(world, 0.3, 10);
          ctx.audio.play('boing', { volume: 0.55, pitch: 1.8 + rng() * 0.3 });
        }
        r?.score(shot.data.who, s.prize ? PRIZE_POINTS : 1);
        return;
      }
    }
    ctx.audio.play('bump', { volume: 0.25, pitch: 1.4 });
  };
  const bags = new Projectiles<Bag>(new Kit().add(G.boxC, 0xffffff, T(0, 0, 0, 0, 0.17, 0.1, 0.17)).build(), balloonMat, 10, onLand);
  bags.mesh.name = 'carnival-beanbags';
  for (let i = 0; i < 10; i++) bags.mesh.setColorAt(i, tint.set(i % 2 ? 0xffd84a : 0xffffff));
  booth.add(bags.mesh);

  let brains: RivalBrain[] = [];
  let cooldown = 0;
  let botWait = 0;
  const aimPoint = new THREE.Vector3();
  const hand = new THREE.Vector3();

  const throwAt = (who: number, from: THREE.Vector3, slot: number, to: THREE.Vector3): void => {
    bags.throw(from, to, FLIGHT, 0.35 + Math.hypot(to.x - from.x, to.z - from.z) * 0.02, { who, slot });
    ctx.audio.play('whoosh', { volume: 0.25, pitch: 1.6 });
  };

  const aliveTargets = (includePrize: boolean): AssistTarget[] =>
    slots.flatMap((s, index) => (s.alive && s.grow > 0.5 && (includePrize || !s.prize) ? [{ index, ...(({ x, y }) => ({ x, y }))(pos(s, tmp)) }] : []));

  return {
    id: 'balloonPop',
    duration: 30,
    thresholds: [8, 16],
    camera: { distance: 3.1, height: 0.7, fov: 62, lookAhead: 0 },
    aimLimits: { yaw: 0.6, pitchMin: -0.15, pitchMax: 0.55 },
    how: ['aim', 'throw'],
    idle(dt) {
      tick(dt);
    },
    begin(r) {
      round = r;
      resetSlots(pickPrizeSlots(r.rng));
      brains = RIVAL_SKILLS.map((sk, i) => new RivalBrain(sk, makeRng(Math.floor(r.rng() * 1e9) + i), 0.8 + i * 0.5));
      cooldown = 0;
      botWait = 0.3;
      r.aim.yaw = 0;
      r.aim.pitch = 0.12;
      reticle.visible = true;
    },
    update(dt, input: Readonly<InputState>, r) {
      tick(dt);
      bags.update(dt);
      cooldown -= dt;
      const hit = aimOnPlaneZ(EYE, r.aim.yaw, r.aim.pitch, WALL_Z, aimPoint);
      if (hit) {
        hit.x = THREE.MathUtils.clamp(hit.x, -2.5, 2.5);
        hit.y = THREE.MathUtils.clamp(hit.y, 1.0, 3.4);
        reticle.position.set(hit.x, hit.y, WALL_Z + 0.32);
      }
      if ((input.jumpPressed || input.usePressed) && cooldown <= 0 && hit) {
        cooldown = THROW_COOLDOWN;
        hand.set(0.25 + r.playerOffset.x, 1.35, EYE.z - 0.3);
        const pick = assistPick(hit.x, hit.y, aliveTargets(true), ASSIST_RADIUS);
        if (pick) throwAt(0, hand, pick.index, tmp.set(pick.x, pick.y, WALL_Z));
        else throwAt(0, hand, -1, tmp.set(hit.x, hit.y, WALL_Z - 0.2));
        r.playerAct('wave', 0.35);
      }
      brains.forEach((b, i) => {
        if (!b.tick(dt)) return;
        const targets = aliveTargets(false);
        if (!targets.length) return;
        const t = targets[Math.floor(b.random() * targets.length)];
        const from = r.friendPos(i).clone().setY(1.35);
        if (b.roll()) throwAt(i + 1, from, t.index, tmp.set(t.x, t.y, WALL_Z));
        else {
          const a = b.random() * Math.PI * 2;
          throwAt(i + 1, from, -1, tmp.set(t.x + Math.cos(a) * 0.55, t.y + Math.sin(a) * 0.45, WALL_Z - 0.2));
        }
        r.friendAct(i, 'wave', 0.5);
      });
    },
    autopilot(dt, r) {
      botWait -= dt;
      if (botWait > 0) return {};
      botWait = 0.42;
      const targets = aliveTargets(true);
      if (!targets.length) return {};
      const prize = targets.find((t) => slots[t.index].prize);
      const t = prize ?? targets[Math.floor(r.rng() * targets.length)];
      const a = aimAt(EYE, tmp.set(t.x, t.y, WALL_Z));
      r.aim.yaw = a.yaw;
      r.aim.pitch = a.pitch;
      return { jumpPressed: true };
    },
    end() {
      round = null;
      bags.clear();
      reticle.visible = false;
    },
    dispose() {
      booth.remove(balloons, reticle, bags.mesh);
      weak.remove(prizes);
      balloons.geometry.dispose();
      prizes.geometry.dispose();
      reticle.geometry.dispose();
      bags.mesh.geometry.dispose();
      balloonMat.dispose();
      prizeMat.dispose();
    },
  };
}
