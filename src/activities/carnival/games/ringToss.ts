/**
 * Ring Toss: lob hoops onto wobbling pegs. Hold Space/E to charge (the power bar fills and falls
 * back), release to throw; aim left/right with the camera. Further pegs are worth more. Glasses
 * twist: one peg wears a weak-eye-only gold star and counts double; it hops to another peg when
 * ringed. Friends never aim at the star peg.
 */
import * as THREE from 'three';
import type { InputState } from '../../../types';
import { createLayerMaterial } from '../../../vision';
import { G, Kit, T, kitMaterial } from '../kit';
import { RIVAL_SKILLS, RivalBrain } from '../rivals';
import { makeRng } from '../rng';
import { Projectiles } from './common';
import type { Shot } from './common';
import { MIN_CHARGE, HAND_Z, PEGS, PEG_H, capturePeg, chargePower, landingPoint, powerFor } from './ringLogic';
import type { BoothGame, GameEnv, RoundApi } from './types';

const RING_COLORS = [0xffe14a, 0xffffff];
const FRIEND_RING = [0xd8ff8a, 0xffc890];
const MAX_RESTED = 30;
const BONUS = 2;

interface Ring {
  who: number;
  peg: number;
}

function ringGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  const t = new THREE.TorusGeometry(0.16, 0.035, 8, 22).rotateX(Math.PI / 2);
  k.add(t, 0xffffff, T(0, 0, 0));
  t.dispose();
  return k.build();
}

function pegGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  k.add(G.cyl, 0xffffff, T(0, 0, 0, 0, 0.32, 0.06, 0.32));
  k.add(G.cyl, 0xf4efe4, T(0, 0, 0, 0, 0.15, PEG_H, 0.15));
  k.add(G.cyl, 0x8c1c34, T(0, PEG_H * 0.35, 0, 0, 0.155, 0.07, 0.155));
  k.add(G.cyl, 0x8c1c34, T(0, PEG_H * 0.65, 0, 0, 0.155, 0.07, 0.155));
  k.add(G.sphereLo, 0xffcf33, T(0, PEG_H, 0, 0, 0.2, 0.2, 0.2));
  return k.build();
}

export function createRingToss(env: GameEnv): BoothGame {
  const { ctx, booth, weak, fx } = env;

  // Static dressing: stepped table under the pegs, a target board behind.
  for (let row = 0; row < 3; row++) {
    const p = PEGS[row * 3];
    env.addStatic(G.box, row % 2 ? 0x2a3a8f : 0x1c2766, T(0, 0, p.z, 0, 4.4, p.base, 0.95));
    env.addStatic(G.box, 0xffcf33, T(0, p.base, p.z + 0.46, 0, 4.4, 0.03, 0.05), 0.2);
  }
  // Point pips on the table fronts: 1, 2, 3 white dots per row.
  for (let row = 0; row < 3; row++) {
    const p = PEGS[row * 3];
    for (let i = 0; i <= row; i++) env.addStatic(G.sphereLo, 0xffffff, T(-1.95 + i * 0.16, p.base - 0.12, p.z + 0.48, 0, 0.1, 0.1, 0.04), 0.6);
  }
  // A crate of hoops on the counter.
  env.addStatic(G.box, 0x9a6a3a, T(1.75, 0.95, -0.42, 0, 0.55, 0.12, 0.45));
  for (let i = 0; i < 4; i++) {
    const t = new THREE.TorusGeometry(0.16, 0.035, 6, 18).rotateX(Math.PI / 2);
    env.addStatic(t, RING_COLORS[i % 2], T(1.75, 1.08 + i * 0.05, -0.42, i));
    t.dispose();
  }

  const mat = kitMaterial({ roughness: 0.4 });
  const pegs = new THREE.InstancedMesh(pegGeometry(), mat, PEGS.length);
  pegs.name = 'carnival-pegs';
  pegs.frustumCulled = false;
  booth.add(pegs);

  const ringGeo = ringGeometry();
  const rested = new THREE.InstancedMesh(ringGeo, mat, MAX_RESTED);
  rested.name = 'carnival-rings';
  rested.frustumCulled = false;
  rested.count = 0;
  booth.add(rested);

  // Landing marker (both-eye): where the ring would land at the current power, straight, no assist.
  const markKit = new Kit();
  const mk = new THREE.TorusGeometry(0.17, 0.025, 6, 24).rotateX(Math.PI / 2);
  markKit.add(mk, 0xffffff, T(0, 0, 0), 1);
  mk.dispose();
  const marker = new THREE.Mesh(markKit.build(), mat);
  marker.visible = false;
  booth.add(marker);

  // Weak-eye-only gold star on the bonus peg.
  const starMat = createLayerMaterial(1);
  const starGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 5).rotateX(Math.PI / 2);
  const star = new THREE.Mesh(starGeo, starMat);
  star.name = 'carnival-ring-star';
  weak.add(star);

  const rng = makeRng(23);
  let bonusPeg = Math.floor(rng() * PEGS.length);
  let time = 0;
  const stacks = PEGS.map(() => 0);
  const restedRings: { x: number; y: number; z: number; tilt: number; color: number }[] = [];
  const o = new THREE.Object3D();
  const tint = new THREE.Color();

  const pegSway = (i: number): number => Math.sin(time * 2.3 + i * 1.7) * 0.06;
  const drawPegs = (): void => {
    PEGS.forEach((p, i) => {
      o.position.set(p.x, p.base, p.z);
      o.rotation.set(pegSway(i), 0, Math.cos(time * 1.9 + i) * 0.05);
      o.scale.setScalar(1);
      o.updateMatrix();
      pegs.setMatrixAt(i, o.matrix);
    });
    pegs.instanceMatrix.needsUpdate = true;
    const b = PEGS[bonusPeg];
    star.position.set(b.x, b.base + PEG_H + 0.3 + Math.sin(time * 2.4) * 0.05, b.z);
    star.rotation.set(0, time * 1.6, 0);
  };
  const drawRested = (): void => {
    rested.count = restedRings.length;
    restedRings.forEach((r, i) => {
      o.position.set(r.x, r.y, r.z);
      o.rotation.set(r.tilt, 0, r.tilt * 0.5);
      o.scale.setScalar(1);
      o.updateMatrix();
      rested.setMatrixAt(i, o.matrix);
      rested.setColorAt(i, tint.set(r.color));
    });
    rested.instanceMatrix.needsUpdate = true;
    if (rested.instanceColor) rested.instanceColor.needsUpdate = true;
  };

  let round: RoundApi | null = null;
  const misses: { i: number; t: number }[] = [];
  const world = new THREE.Vector3();
  const color = (who: number): number => (who === 0 ? RING_COLORS[restedRings.length % 2] : FRIEND_RING[who - 1]);
  const onLand = (s: Shot<Ring>): void => {
    const r = round;
    if (!r) return;
    if (s.data.peg >= 0) {
      const i = s.data.peg;
      const p = PEGS[i];
      const n = stacks[i]++;
      if (restedRings.length < MAX_RESTED) restedRings.push({ x: p.x, y: p.base + 0.05 + n * 0.07, z: p.z, tilt: 0, color: color(s.data.who) });
      const bonus = s.data.who === 0 && i === bonusPeg;
      env.toWorld(world.set(p.x, p.base + PEG_H, p.z));
      if (bonus) {
        fx.weakPop(world, 0.35, 14);
        ctx.events.emit('glasses:result', { mechanic: 'ringStar', kind: 'find', tier: 1, hit: true });
        // The star hops to another peg (a new hunt).
        const others = PEGS.map((_, j) => j).filter((j) => j !== bonusPeg);
        bonusPeg = others[Math.floor(r.rng() * others.length)];
      } else fx.pop(world, 0.22, 8);
      ctx.audio.play('boing', { volume: 0.55, pitch: 1.3 + p.points * 0.15 });
      r.score(s.data.who, p.points * (bonus ? BONUS : 1));
    } else {
      // A miss clatters on the table and fades away.
      const y = s.to.y;
      if (restedRings.length < MAX_RESTED) {
        restedRings.push({ x: s.to.x, y, z: s.to.z, tilt: 0.25, color: color(s.data.who) });
        misses.push({ i: restedRings.length - 1, t: 1.0 });
      }
      ctx.audio.play('bump', { volume: 0.3, pitch: 1.6 });
    }
    drawRested();
  };
  const flying = new Projectiles<Ring>(ringGeo, mat, 8, onLand, 'flat');
  flying.mesh.name = 'carnival-rings-flying';
  booth.add(flying.mesh);

  let brains: RivalBrain[] = [];
  let charging = false;
  let chargeT = 0;
  let cooldown = 0;
  let bot: { peg: number; power: number; wait: number } | null = null;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  /** Table height under a point (rows of steps), for misses. */
  const tableY = (z: number): number => {
    for (let row = 2; row >= 0; row--) {
      const p = PEGS[row * 3];
      if (z <= p.z + 0.48) return p.base + 0.03;
    }
    return 0.97;
  };

  const throwRing = (who: number, hand: THREE.Vector3, x: number, z: number, peg: number): void => {
    if (peg >= 0) {
      const p = PEGS[peg];
      to.set(p.x, p.base + PEG_H + 0.1, p.z);
    } else to.set(x, tableY(z), z);
    flying.throw(hand, to, 0.55 + Math.abs(hand.z - to.z) * 0.04, 0.9, { who, peg }, color(who));
    ctx.audio.play('whoosh', { volume: 0.25, pitch: 1.3 });
  };

  /** Removing missed rings that have faded. */
  const tickMisses = (dt: number): void => {
    let changed = false;
    for (let k = misses.length - 1; k >= 0; k--) {
      misses[k].t -= dt;
      if (misses[k].t > 0) continue;
      const idx = misses[k].i;
      restedRings.splice(idx, 1);
      misses.splice(k, 1);
      for (const m of misses) if (m.i > idx) m.i--;
      changed = true;
    }
    if (changed) drawRested();
  };

  const clearRings = (): void => {
    restedRings.length = 0;
    misses.length = 0;
    stacks.fill(0);
    drawRested();
  };

  return {
    id: 'ringToss',
    duration: 35,
    thresholds: [10, 22],
    camera: { distance: 3.0, height: 2.4, fov: 60, lookAhead: 0 },
    aimLimits: { yaw: 0.5, pitchMin: 0, pitchMax: 0 },
    how: ['aim', 'charge'],
    idle(dt) {
      time += dt;
      drawPegs();
    },
    begin(r) {
      round = r;
      clearRings();
      bonusPeg = Math.floor(r.rng() * PEGS.length);
      brains = RIVAL_SKILLS.map((sk, i) => new RivalBrain(sk, makeRng(Math.floor(r.rng() * 1e9) + i), 1 + i * 0.6));
      charging = false;
      chargeT = 0;
      cooldown = 0;
      bot = null;
      r.aim.yaw = 0;
    },
    update(dt, input: Readonly<InputState>, r) {
      time += dt;
      drawPegs();
      flying.update(dt);
      tickMisses(dt);
      cooldown -= dt;
      const held = input.jump || input.use;
      if (!charging && cooldown <= 0 && (input.jumpPressed || input.usePressed)) {
        charging = true;
        chargeT = 0;
      }
      if (charging) {
        chargeT += dt;
        const power = chargePower(chargeT);
        r.meter(power);
        const [lx, lz] = landingPoint(r.aim.yaw, power, r.playerOffset.x);
        marker.visible = true;
        marker.position.set(lx, tableY(lz) + 0.02, lz);
        if (!held) {
          charging = false;
          cooldown = 0.5;
          marker.visible = false;
          r.meter(null);
          if (chargeT < MIN_CHARGE) {
            // A tap: the ring slips and plops at the hero's feet. Oops!
            ctx.audio.play('boing', { volume: 0.4, pitch: 0.9 });
            r.fumble(0.7);
          } else {
            from.set(0.2 + r.playerOffset.x, 1.35, HAND_Z);
            const peg = capturePeg(lx, lz);
            throwRing(0, from, lx, lz, peg);
            r.playerAct('wave', 0.4);
            if (peg < 0) cooldown = 0.9; // a miss: pick up the next ring
          }
        }
      }
      brains.forEach((b, i) => {
        if (!b.tick(dt, (r.scores[0] - r.scores[i + 1]) / 2)) return;
        const options = PEGS.map((_, j) => j).filter((j) => j !== bonusPeg);
        const peg = options[Math.floor(b.random() * options.length)];
        const p = PEGS[peg];
        const hand = r.friendPos(i).clone().setY(1.35);
        // Closer pegs are easier for the friends.
        if (b.roll(-0.12 - p.points * 0.08)) throwRing(i + 1, hand, p.x, p.z, peg);
        else {
          const a = b.random() * Math.PI * 2;
          throwRing(i + 1, hand, p.x + Math.cos(a) * 0.6, p.z + Math.sin(a) * 0.5, -1);
        }
        r.friendAct(i, 'wave', 0.5);
      });
    },
    autopilot(dt, r) {
      if (!bot) {
        const peg = r.rng() < 0.6 ? bonusPeg : Math.floor(r.rng() * PEGS.length);
        const p = PEGS[peg];
        const dx = p.x - r.playerOffset.x;
        const dz = HAND_Z - p.z;
        r.aim.yaw = Math.atan2(-dx, dz);
        bot = { peg, power: powerFor(Math.hypot(dx, dz)), wait: 0.2 };
        return {};
      }
      bot.wait -= dt;
      if (bot.wait > 0) return {};
      if (!charging) return { jumpPressed: true, jump: true };
      if (chargePower(chargeT + dt) >= bot.power - 0.02 && chargeT < 1.1) {
        bot = null;
        return { jump: false };
      }
      return { jump: true };
    },
    end(r) {
      round = null;
      flying.clear();
      charging = false;
      marker.visible = false;
      r.meter(null);
    },
    dispose() {
      booth.remove(pegs, rested, marker, flying.mesh);
      weak.remove(star);
      pegs.geometry.dispose();
      ringGeo.dispose();
      marker.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
      mat.dispose();
    },
  };
}
