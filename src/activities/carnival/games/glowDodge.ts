/**
 * Glow Dodge: three lanes at the mouth of a dark tent. Soft foam balls come out of the tunnels at
 * the back towards each contestant: rollers (hop over them: Space) and lobs (sidestep: move left /
 * right). Every ball that goes past you is a point; a ball that reaches you is a soft comic bonk.
 *
 * Glasses twist: the glowing foam balls are WEAK-EYE-ONLY (two instanced draws on env.weak: the
 * ball and its glow shell). Nothing both-eye reveals them: no shadow, no marker, no launch sound;
 * sounds play only on outcomes (dodge tick via the round's score, giggly boing on a bonk).
 */
import * as THREE from 'three';
import type { InputState } from '../../../types';
import { createGlowMaterial, createLayerMaterial } from '../../../vision';
import { FRIEND_SPOTS } from '../layout';
import { G, Kit, T } from '../kit';
import { RIVAL_SKILLS, RivalBrain } from '../rivals';
import { makeRng } from '../rng';
import type { BoothGame, GameEnv, RoundApi } from './types';
import {
  BALL_R,
  DURATION,
  FLY_ON,
  FRIEND_BONUS,
  FRIEND_HALF,
  FRIEND_LANE_X,
  FRIEND_Z,
  GRACE,
  HOP_LEAD,
  MOVE_SPEED,
  PLAYER_HALF,
  PLAYER_Z,
  SPAWN_Z,
  ballAt,
  botInput,
  clampLane,
  dodgeX,
  hits,
  hopStep,
  nextGap,
  pickKind,
  planBall,
  startHop,
} from './dodgeLogic';
import type { BallKind, BallPlan, Hop, P3, Threat } from './dodgeLogic';

const CAP = 14;
/** Friends react this long before a lob arrives. */
const FRIEND_REACT = 0.5;
/** Tunnel mouths at the back wall (one per lane). */
const TUNNEL_Y = 0.62;
const BONK_TIME = 0.6;

interface Ball {
  plan: BallPlan;
  /** Seconds since launch. */
  s: number;
  resolved: boolean;
  /** Friends only: decided at launch. */
  willDodge: boolean;
  reacted: boolean;
  /** After a bonk: bounces back, shrinking. */
  bonk: { t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number } | null;
  spin: number;
}

interface Lane {
  center: number;
  half: number;
  z: number;
  hop: Hop;
  /** Where a friend wants to stand (player: unused). */
  want: number;
  next: number;
  recent: BallKind[];
  rng: () => number;
}

function ballGeometry(): THREE.BufferGeometry {
  // A foam ball with a darker seam band (brightness-only detail on the layer).
  const k = new Kit();
  k.add(G.sphere, 0xffffff, T(0, 0, 0, 0, 2, 2, 2));
  const seam = new THREE.TorusGeometry(1.0, 0.07, 6, 24);
  k.add(seam, 0x7a7a7a, T(0, 0, 0, 0, 1, 1, 1, Math.PI / 2));
  k.add(seam, 0x7a7a7a, T(0, 0, 0, Math.PI / 2));
  seam.dispose();
  return k.build();
}

export function createGlowDodge(env: GameEnv): BoothGame {
  const { ctx, weak, fx } = env;

  // ── Static dressing (merged into the row mesh, zero extra draws): three tunnel mouths in the
  // back wall with bright rims, soft padded bumpers along the side walls and a starry backdrop.
  const rim = new THREE.TorusGeometry(0.5, 0.06, 8, 28);
  for (const x of [-FRIEND_LANE_X, 0, FRIEND_LANE_X]) {
    env.addStatic(G.cyl, 0x000000, T(x, TUNNEL_Y, -4.52, 0, 0.95, 0.06, 0.95, Math.PI / 2));
    env.addStatic(rim, 0xfff6b0, T(x, TUNNEL_Y, -4.5), 1);
    env.addStatic(G.box, 0x3a3f66, T(x, 0, -4.48, 0, 1.15, 0.08, 0.1));
  }
  rim.dispose();
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) env.addStatic(G.boxC, i % 2 ? 0xeeeeff : 0x9aa4d8, T(s * 2.36, 0.35, -0.6 - i * 1.0, 0, 0.12, 0.6, 0.9), 0.15);
  }
  for (let i = 0; i < 9; i++) {
    const x = -2.0 + (i % 5) * 1.0 + (i > 4 ? 0.5 : 0);
    const y = 1.55 + (i > 4 ? 0.45 : 0) + (i % 2) * 0.12;
    env.addStatic(G.sphereLo, 0xfff0c0, T(x, y, -4.5, 0, 0.09, 0.09, 0.05), 1);
  }

  // ── Weak-eye-only balls: one instanced ball + one instanced glow shell.
  const ballMat = createLayerMaterial(1);
  ballMat.vertexColors = true;
  const balls = new THREE.InstancedMesh(ballGeometry(), ballMat, CAP);
  balls.name = 'carnival-dodge-balls';
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.12, rimPower: 1.6, pulse: 0.25 });
  const glows = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), glowMat, CAP);
  glows.name = 'carnival-dodge-glow';
  for (const m of [balls, glows]) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.visible = false;
    weak.add(m);
  }

  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const o = new THREE.Object3D();
  const live: Ball[] = [];
  const p: P3 = { x: 0, y: 0, z: 0 };
  const world = new THREE.Vector3();

  const draw = (): void => {
    for (let i = 0; i < CAP; i++) {
      const b = live[i];
      if (!b) {
        balls.setMatrixAt(i, zero);
        glows.setMatrixAt(i, zero);
        continue;
      }
      const r = BALL_R[b.plan.kind];
      let scale = r;
      if (b.bonk) {
        o.position.set(b.bonk.x, b.bonk.y, b.bonk.z);
        scale = r * Math.max(0.01, 1 - b.bonk.t / BONK_TIME);
      } else {
        ballAt(b.plan, b.s, p);
        o.position.set(p.x, p.y, p.z);
        const after = b.s - b.plan.dur;
        if (after > FLY_ON - 0.25) scale = r * Math.max(0.01, (FLY_ON - after) / 0.25);
        // Grow out of the tunnel mouth.
        if (b.s < 0.15) scale *= Math.max(0.05, b.s / 0.15);
      }
      // Rollers roll (spin about x); lobs tumble.
      const dist = (o.position.z - SPAWN_Z) / r;
      if (b.plan.kind === 'roll') o.rotation.set(dist, 0, 0);
      else o.rotation.set(b.s * b.spin, b.s * b.spin * 0.6, 0);
      o.scale.setScalar(scale);
      o.updateMatrix();
      balls.setMatrixAt(i, o.matrix);
      o.scale.setScalar(scale * 1.45);
      o.updateMatrix();
      glows.setMatrixAt(i, o.matrix);
    }
    balls.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
    balls.visible = glows.visible = live.length > 0;
    balls.count = glows.count = Math.min(CAP, live.length);
  };

  const launch = (plan: BallPlan, willDodge: boolean, rng: () => number): void => {
    if (live.length >= CAP) return;
    live.push({ plan, s: 0, resolved: false, willDodge, reacted: false, bonk: null, spin: (rng() - 0.5) * 10 });
  };

  /** Advance balls; `onCross` decides each ball's outcome as it reaches its contestant. */
  const stepBalls = (dt: number, onCross: (b: Ball) => boolean): void => {
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i];
      if (b.bonk) {
        const k = b.bonk;
        k.t += dt;
        k.vy -= 9 * dt;
        k.x += k.vx * dt;
        k.y = Math.max(BALL_R[b.plan.kind], k.y + k.vy * dt);
        k.z += k.vz * dt;
        if (k.t >= BONK_TIME) live.splice(i, 1);
        continue;
      }
      b.s += dt;
      if (!b.resolved && b.s >= b.plan.dur) {
        b.resolved = true;
        ballAt(b.plan, b.plan.dur, p);
        if (onCross(b)) {
          b.bonk = { t: 0, x: p.x, y: p.y, z: p.z - 0.3, vx: (b.spin > 0 ? 1 : -1) * 0.6, vy: 2.6, vz: -2.2 };
          fx.weakPop(env.toWorld(world.set(p.x, p.y, p.z - 0.2)), 0.22, 8);
        }
      }
      if (b.s - b.plan.dur >= FLY_ON) live.splice(i, 1);
    }
  };

  // ── Attract mode (near the booth, no round): an occasional roller in a random lane.
  const idleRng = makeRng(23);
  let idleWait = 1.5;
  // Attract balls stop at the tent mouth (they never roll out at the camera).
  const idleLane = { center: 0, half: PLAYER_HALF, z: -0.2 };

  // ── Round state.
  let lanes: Lane[] = [];
  let brains: RivalBrain[] = [];
  let stretch = 0;

  const contestantX = (r: RoundApi, who: number): number => (who === 0 ? r.playerOffset.x : r.friendPos(who - 1).x);

  const resetPositions = (r: RoundApi): void => {
    r.playerOffset.set(0, 0, 0);
    for (let i = 0; i < 2; i++) r.friendPos(i).set(FRIEND_SPOTS[i][0], 0, FRIEND_SPOTS[i][1]);
    r.playerStretch(0);
  };

  return {
    id: 'glowDodge',
    duration: DURATION,
    thresholds: [10, 15],
    camera: { distance: 3.9, height: 2.3, fov: 64, lookAhead: 0 },
    aimLimits: null,
    how: ['dodge', 'jump'],
    idle(dt) {
      idleWait -= dt;
      if (idleWait <= 0) {
        idleWait = 3 + idleRng() * 2;
        const lane = Math.floor(idleRng() * 3) - 1;
        idleLane.center = lane * FRIEND_LANE_X;
        launch(planBall(idleRng, -1, 'roll', idleLane, idleLane.center, 0), true, idleRng);
      }
      if (!live.length) return;
      stepBalls(dt, () => false);
      draw();
    },
    begin(r) {
      live.length = 0;
      const seed = Math.floor(r.rng() * 1e9);
      lanes = [0, 1, 2].map((who) => {
        const center = who === 0 ? 0 : (who === 1 ? -1 : 1) * FRIEND_LANE_X;
        return {
          center,
          half: who === 0 ? PLAYER_HALF : FRIEND_HALF,
          z: who === 0 ? PLAYER_Z : FRIEND_Z,
          hop: { y: 0, vy: 0 },
          want: center,
          next: GRACE + (who === 0 ? 0 : 0.35 + who * 0.3),
          recent: [],
          rng: makeRng(seed + who * 101),
        };
      });
      brains = RIVAL_SKILLS.map((sk, i) => new RivalBrain(sk, makeRng(seed + 7 + i * 13)));
      resetPositions(r);
      stretch = 0;
      draw();
    },
    update(dt, input: Readonly<InputState>, r) {
      // Player: sidestep within the centre lane, hop on Space.
      const me = lanes[0];
      r.playerOffset.x = clampLane(r.playerOffset.x + input.moveX * MOVE_SPEED * dt, me.center, me.half);
      if (input.jumpPressed) {
        if (startHop(me.hop)) {
          r.playerAct('jump', 0.55);
          ctx.audio.play('jump', { volume: 0.35, pitch: 1.3 });
        } else if (me.hop.y > 0.05) {
          // Kicking the air mid-hop: a dizzy wobble on landing (time your hops, don't bunny-hop).
          r.fumble(0.8);
        }
      }

      // Friends walk towards where they want to be, hop when they decided to.
      for (let i = 0; i < 2; i++) {
        const l = lanes[i + 1];
        const fp = r.friendPos(i);
        const d = l.want - fp.x;
        fp.x += Math.sign(d) * Math.min(Math.abs(d), MOVE_SPEED * dt);
        fp.z += (l.z - fp.z) * Math.min(1, dt * 6);
      }
      for (const l of lanes) hopStep(l.hop, dt);
      r.playerOffset.y = me.hop.y;
      for (let i = 0; i < 2; i++) r.friendPos(i).y = lanes[i + 1].hop.y;

      // Launch: each contestant has their own stream of balls.
      lanes.forEach((l, who) => {
        if (r.t < l.next) return;
        const kind = pickKind(l.rng, l.recent);
        l.recent.push(kind);
        if (l.recent.length > 3) l.recent.shift();
        l.next = r.t + nextGap(r.t, l.rng);
        const plan = planBall(l.rng, who, kind, l, contestantX(r, who), r.t);
        if (r.t + plan.dur > DURATION - 0.05) return; // it would not arrive before the bell
        if (who > 0) brains[who - 1].lead = r.scores[0] - r.scores[who];
        const willDodge = who === 0 ? false : brains[who - 1].roll(FRIEND_BONUS);
        launch(plan, willDodge, l.rng);
      });

      // The player's rollers follow them along the lane until just before they arrive: a roller
      // is dodged by a well-timed hop, not by wiggling sideways (lobs are still dodged by a step).
      for (const b of live) {
        if (b.plan.who !== 0 || b.plan.kind !== 'roll' || b.resolved || b.bonk) continue;
        if (b.plan.dur - b.s > 0.3) b.plan.tx = clampLane(r.playerOffset.x, me.center, me.half);
      }
      // Friends react to their own incoming balls.
      for (const b of live) {
        const who = b.plan.who;
        if (who < 1 || b.resolved || b.reacted || b.bonk) continue;
        const eta = b.plan.dur - b.s;
        const l = lanes[who];
        if (b.plan.kind === 'roll' && eta <= HOP_LEAD) {
          b.reacted = true;
          if (b.willDodge && startHop(l.hop)) r.friendAct(who - 1, 'jump', 0.55);
        } else if (b.plan.kind === 'lob' && eta <= FRIEND_REACT) {
          b.reacted = true;
          if (b.willDodge) l.want = dodgeX(b.plan.tx, l.center, l.half);
        }
      }

      stepBalls(dt, (b) => {
        const who = b.plan.who;
        const l = lanes[who];
        const bonk = hits(b.plan.kind, b.plan.tx, ballAt(b.plan, b.plan.dur, p).y, contestantX(r, who), l.hop.y);
        if (!bonk) {
          if (who === 0) ctx.events.emit('glasses:result', { mechanic: 'glowDodge', kind: 'follow', tier: 2, hit: true });
          r.score(who, 1);
          if (who > 0) l.want = l.center;
          return false;
        }
        if (who === 0) {
          ctx.events.emit('glasses:result', { mechanic: 'glowDodge', kind: 'follow', tier: 2, hit: false });
          stretch = -0.38;
          r.playerAct('flop', 0.5);
          ctx.audio.play('boing', { volume: 0.6, pitch: 1.8 });
        } else {
          r.friendAct(who - 1, 'flop', 0.5);
          ctx.audio.play('boing', { volume: 0.3, pitch: 1.9 });
          l.want = l.center;
        }
        return true;
      });

      // Squash springs back.
      stretch *= Math.exp(-7 * dt);
      if (Math.abs(stretch) < 0.01) stretch = 0;
      r.playerStretch(stretch);
      draw();
    },
    autopilot(_dt, r) {
      const me = lanes[0];
      if (!me) return {};
      const threats: Threat[] = live
        .filter((b) => b.plan.who === 0 && !b.resolved && !b.bonk)
        .map((b) => ({ kind: b.plan.kind, tx: b.plan.tx, eta: b.plan.dur - b.s }));
      const bot = botInput(threats, r.playerOffset.x, me.hop.y, me.center, me.half);
      return { moveX: bot.moveX, jumpPressed: bot.jump };
    },
    end(r) {
      live.length = 0;
      for (const l of lanes) {
        l.hop.y = 0;
        l.hop.vy = 0;
      }
      lanes = [];
      stretch = 0;
      resetPositions(r);
      draw();
    },
    dispose() {
      weak.remove(balls, glows);
      balls.geometry.dispose();
      glows.geometry.dispose();
      ballMat.dispose();
      glowMat.dispose();
    },
  };
}
