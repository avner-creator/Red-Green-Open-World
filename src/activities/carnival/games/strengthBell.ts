/**
 * Strength Bell: stomp on a springy pad to send a puck up your tower and ring the bell. A gauge
 * dial above the player's head has a needle swinging to and fro; Space / E stomps, and the needle
 * position sets the power. The "perfect" sweet spot on the dial is WEAK-EYE-ONLY and moves before
 * every stomp; the both-eye dial is evenly ticked, so nothing else gives it away. Ground-pound
 * heroes can stomp with Q for a power bonus. Three stomps each, side by side with two friends.
 */
import * as THREE from 'three';
import type { InputState } from '../../../types';
import { createLayerMaterial } from '../../../vision';
import { G, Kit, T, kitMaterial } from '../kit';
import { FRIEND_SPOTS, STAND_Z } from '../layout';
import type { PictoId } from '../picto';
import { RIVAL_SKILLS, RivalBrain } from '../rivals';
import { makeRng } from '../rng';
import {
  BAND_H,
  BELL_Y,
  DIAL_ANGLE,
  GOOD,
  PERFECT,
  POUND_BONUS,
  PUCK_REST,
  STOMPS,
  TOWER_X,
  TOWER_Z,
  bandBottom,
  fallY,
  needleAt,
  peakFor,
  pickSweet,
  pointsFor,
  riseTime,
  riseY,
  rings,
  rivalPower,
  stompPower,
  tierOf,
} from './bellLogic';
import type { BoothGame, GameEnv, RoundApi } from './types';

const NIGHT = 0x141833;
const GOLD = 0xffcf33;
const WHITE = 0xf4efe4;
const DECK_TOP = 0.14;
const PAD_Z = 0.3;
const PAD_TOP = 0.25;
/** Gauge dial pivot (booth frame). */
const DIAL = new THREE.Vector3(0, 2.5, -1.2);
const DIAL_R = 0.52;
/** Puck rail sits just in front of each board; the player's rail is off-centre (pictograms beside it). */
const RAIL_X: readonly number[] = [-0.2, 0, 0];
const BOARD_W: readonly number[] = [1.1, 0.62, 0.62];
const PUCK_Z = TOWER_Z + 0.16;
const HOP_T = 0.42;
const HOP_H = 0.5;
const POUND_T = 0.62;
const POUND_H = 1.05;
const SQUASH_T = 0.3;
const ENTER_T = 0.45;
/** Radius of the stomps-left tokens on the dial face. */
const TOKEN_R = 0.17;
const HANG = 0.32;
const BELL_HANG = 0.55;
const PUCK_COLORS = [0xfff27a, 0xffffff, 0xffffff];

type Phase = 'rest' | 'up' | 'hang' | 'down';

interface Tower {
  phase: Phase;
  t: number;
  dur: number;
  power: number;
  peak: number;
  y: number;
  /** Seconds since the bell was struck (−1 = still). */
  ring: number;
  /** Little rebound when the puck lands back (seconds left). */
  settle: number;
}

interface Hop {
  t: number;
  dur: number;
  h: number;
  power: number;
  pound: boolean;
}

function bellGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  const prof = [
    [0.27, -0.5],
    [0.25, -0.47],
    [0.19, -0.36],
    [0.16, -0.22],
    [0.13, -0.1],
    [0.07, -0.04],
    [0.001, -0.03],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const lathe = new THREE.LatheGeometry(prof, 18);
  k.add(lathe, 0xffffff);
  lathe.dispose();
  k.add(G.sphereLo, 0xffffff, T(0, -0.5, 0, 0, 0.11, 0.11, 0.11));
  k.add(G.cylLo, 0xffffff, T(0, -0.05, 0, 0, 0.05, 0.08, 0.05));
  return k.build();
}

function puckGeometry(): THREE.BufferGeometry {
  // A chunky disc facing the player, with a dark rim so it reads on a bright band too.
  const k = new Kit();
  k.add(G.cyl, 0x222222, T(0, 0, -0.07, 0, 0.4, 0.12, 0.4, Math.PI / 2));
  k.add(G.cyl, 0xffffff, T(0, 0, -0.02, 0, 0.34, 0.12, 0.34, Math.PI / 2));
  return k.build();
}

function needleGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  // Black needle with a thin white edge: reads on the light dial face and against the dark tower.
  const len = DIAL_R * 0.9;
  k.add(G.boxC, 0xffffff, T(0, len / 2, -0.012, 0, 0.12, len + 0.04, 0.02), 0.8);
  k.add(G.boxC, 0x111111, T(0, len / 2, 0, 0, 0.075, len - 0.06, 0.02));
  k.add(G.cone, 0x111111, T(0, len - 0.1, 0, 0, 0.11, 0.12, 0.02));
  k.add(G.sphere, GOLD, T(0, 0, 0.01, 0, 0.12, 0.12, 0.06), 0.4);
  return k.build();
}

/** The weak-eye sweet-spot marker, centred straight up; rotated onto the sweet spot each stomp. */
function sweetGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  const good = GOOD * DIAL_ANGLE;
  const core = PERFECT * DIAL_ANGLE;
  const ringGood = new THREE.RingGeometry(DIAL_R * 0.55, DIAL_R * 0.92, 16, 1, Math.PI / 2 - good, good * 2);
  k.add(ringGood, 0xb4b4b4, T(0, 0, 0));
  ringGood.dispose();
  const ringCore = new THREE.RingGeometry(DIAL_R * 0.5, DIAL_R * 1.0, 8, 1, Math.PI / 2 - core, core * 2);
  k.add(ringCore, 0xffffff, T(0, 0, 0.004));
  ringCore.dispose();
  const star = new THREE.CircleGeometry(0.09, 5);
  k.add(star, 0xffffff, T(0, DIAL_R + 0.13, 0.004, 0, 1, 1, 1, 0, Math.PI / 10));
  star.dispose();
  return k.build();
}

export function createStrengthBell(env: GameEnv): BoothGame {
  const { ctx, booth, weak, fx } = env;

  // ── Static dressing (merged into the row mesh): boards with tier bands, rails, bell brackets,
  // pads with a springy ring, levers on the floor, and the gauge dial face.
  for (let i = 0; i < 3; i++) {
    const x = TOWER_X[i];
    const w = BOARD_W[i];
    const rx = x + RAIL_X[i];
    env.addStatic(G.box, NIGHT, T(x, DECK_TOP, TOWER_Z - 0.12, 0, w + 0.16, 6.0 - DECK_TOP, 0.08));
    for (let b = 1; b <= 5; b++) {
      // Bands get brighter towards the top (a brightness cue that works in R and in G).
      const lv = 0x1d + b * 0x0b;
      env.addStatic(G.box, b === 5 ? 0x5a4a1a : (lv << 16) | (lv << 8) | (lv + 0x22), T(x, bandBottom(b) + 0.02, TOWER_Z - 0.06, 0, w, BAND_H - 0.04, 0.06));
      env.addStatic(G.box, WHITE, T(x, bandBottom(b) - 0.02, TOWER_Z - 0.03, 0, w + 0.1, 0.04, 0.04), 0.7);
    }
    env.addStatic(G.box, WHITE, T(x, bandBottom(6) - 0.02, TOWER_Z - 0.03, 0, w + 0.1, 0.04, 0.04), 0.7);
    env.addStatic(G.box, GOLD, T(x, DECK_TOP, TOWER_Z - 0.03, 0, w + 0.2, 0.14, 0.2));
    // Rail and the little base the puck rests on.
    env.addStatic(G.cylLo, 0xb8b8c8, T(rx, DECK_TOP, PUCK_Z - 0.09, 0, 0.05, 6.0 - DECK_TOP, 0.05));
    env.addStatic(G.box, 0x666a80, T(rx, DECK_TOP, PUCK_Z - 0.05, 0, 0.3, 0.14, 0.2));
    // Bell bracket: a gold post up the back and an arm out over the rail.
    env.addStatic(G.box, GOLD, T(rx, 5.95, TOWER_Z - 0.1, 0, 0.1, BELL_Y - 5.9, 0.1));
    env.addStatic(G.box, GOLD, T(rx, BELL_Y - 0.02, TOWER_Z - 0.1, 0, 0.1, 0.1, 0.36));
    env.addStatic(G.sphereLo, 0xfff0c0, T(rx, BELL_Y + 0.16, TOWER_Z - 0.1, 0, 0.16, 0.16, 0.16), 1);
    // Springy pad and the lever to the tower.
    env.addStatic(G.cyl, 0x2a2f55, T(x, DECK_TOP, PAD_Z, 0, 0.98, 0.06, 0.98));
    env.addStatic(G.cyl, i === 0 ? 0xfff27a : WHITE, T(x, DECK_TOP + 0.06, PAD_Z, 0, 0.86, 0.05, 0.86), 0.25);
    env.addStatic(G.cyl, 0x2a2f55, T(x, DECK_TOP + 0.11, PAD_Z, 0, 0.6, 0.02, 0.6));
    env.addStatic(G.box, 0x8890a8, T(x + RAIL_X[i] * 0.5, DECK_TOP, (PAD_Z + PUCK_Z) / 2 - 0.25, 0, 0.12, 0.05, PAD_Z - PUCK_Z - 0.5));
  }
  const tiers: PictoId[] = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'];
  tiers.forEach((id, b) => env.addSign(id, T(TOWER_X[0] + 0.25, bandBottom(b + 1) + BAND_H * 0.68, TOWER_Z + 0.01), 0.5));
  // Gauge dial: light half-disc (so the weak-eye arc shows as a dark wedge) with a gold rim and
  // 11 even dark ticks (no centre mark: the dial says nothing about where the sweet spot is).
  const face = new THREE.CircleGeometry(DIAL_R + 0.08, 24, 0, Math.PI);
  env.addStatic(face, 0xece6d2, T(DIAL.x, DIAL.y, DIAL.z), 0.35);
  face.dispose();
  const rim = new THREE.TorusGeometry(DIAL_R + 0.08, 0.04, 6, 24, Math.PI);
  env.addStatic(rim, GOLD, T(DIAL.x, DIAL.y, DIAL.z + 0.01), 0.5);
  rim.dispose();
  env.addStatic(G.box, NIGHT, T(DIAL.x, DIAL.y - 0.12, DIAL.z - 0.01, 0, DIAL_R * 2 + 0.36, 0.16, 0.05));
  env.addStatic(G.box, WHITE, T(DIAL.x, DIAL.y - 0.14, DIAL.z - 0.02, 0, DIAL_R * 2 + 0.44, 0.03, 0.05), 0.6);
  for (let i = 0; i <= 10; i++) {
    const a = -DIAL_ANGLE + (i / 10) * DIAL_ANGLE * 2;
    const m = T(DIAL.x + Math.sin(a) * (DIAL_R - 0.02), DIAL.y + Math.cos(a) * (DIAL_R - 0.02), DIAL.z + 0.012, 0, 0.035, 0.11, 0.01, 0, -a);
    env.addStatic(G.boxC, 0x1a1d33, m);
  }
  env.addStatic(G.cylLo, 0x666a80, T(DIAL.x, DECK_TOP, DIAL.z - 0.06, 0, 0.07, DIAL.y - 0.12 - DECK_TOP, 0.07));

  // ── Dynamic both-eye parts: pucks + stomp tokens (one instanced draw), bells (one), needle (one).
  const mat = kitMaterial({ roughness: 0.35 });
  const pucks = new THREE.InstancedMesh(puckGeometry(), mat, 3 + STOMPS);
  pucks.name = 'carnival-bell-pucks';
  pucks.frustumCulled = false;
  pucks.castShadow = false;
  pucks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.Color();
  for (let i = 0; i < 3 + STOMPS; i++) pucks.setColorAt(i, tint.set(i < 3 ? PUCK_COLORS[i] : 0x2a2f55));
  booth.add(pucks);

  const bells = new THREE.InstancedMesh(bellGeometry(), mat, 3);
  bells.name = 'carnival-bells';
  bells.frustumCulled = false;
  bells.castShadow = false;
  bells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < 3; i++) bells.setColorAt(i, tint.set(0xffd23a));
  booth.add(bells);

  const needle = new THREE.Mesh(needleGeometry(), mat);
  needle.name = 'carnival-bell-needle';
  needle.position.set(DIAL.x, DIAL.y, DIAL.z + 0.05);
  booth.add(needle);

  // ── Weak-eye-only: the sweet spot on the dial (between the face and the needle).
  const sweetMat = createLayerMaterial(1);
  sweetMat.vertexColors = true;
  const sweetMesh = new THREE.Mesh(sweetGeometry(), sweetMat);
  sweetMesh.name = 'carnival-bell-sweet';
  sweetMesh.position.set(DIAL.x, DIAL.y, DIAL.z + 0.03);
  sweetMesh.visible = false;
  weak.add(sweetMesh);

  // ── State.
  const towers: Tower[] = TOWER_X.map(() => ({ phase: 'rest', t: 0, dur: 1, power: 0, peak: PUCK_REST, y: PUCK_REST, ring: -1, settle: 0 }));
  const hops: (Hop | null)[] = [null, null, null];
  const stomps = [0, 0, 0];
  const wants = [false, false];
  let brains: RivalBrain[] = [];
  let round: RoundApi | null = null;
  let state: 'aim' | 'hop' | 'watch' | 'done' = 'aim';
  let needleT = 0;
  let needleU = 0;
  let aimFor = 0;
  let sweet = 0;
  let squash = 0;
  let doneWait = 0;
  let idleT = 0;
  /** 0..1: everyone hops from their spot onto their pad at GO. */
  let enter = 1;

  const o = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const world = new THREE.Vector3();

  const drawPucks = (): void => {
    for (let i = 0; i < 3; i++) {
      const tw = towers[i];
      const bounce = tw.settle > 0 ? Math.sin((tw.settle / 0.3) * Math.PI) * 0.08 : 0;
      o.position.set(TOWER_X[i] + RAIL_X[i], tw.y + bounce, PUCK_Z);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      pucks.setMatrixAt(i, o.matrix);
    }
    for (let k = 0; k < STOMPS; k++) {
      if (round && k < stomps[0]) {
        pucks.setMatrixAt(3 + k, zero);
        continue;
      }
      // Stomps left: little pucks on an inner arc of the dial face (the needle sweeps over them).
      const a = (k - (STOMPS - 1) / 2) * 0.95;
      o.position.set(DIAL.x + Math.sin(a) * TOKEN_R, DIAL.y + Math.cos(a) * TOKEN_R, DIAL.z + 0.02);
      o.scale.setScalar(0.3);
      o.updateMatrix();
      pucks.setMatrixAt(3 + k, o.matrix);
    }
    pucks.instanceMatrix.needsUpdate = true;
  };

  const drawBells = (): void => {
    for (let i = 0; i < 3; i++) {
      const r = towers[i].ring;
      const wob = r >= 0 ? Math.sin(r * 26) * Math.exp(-r * 2.6) * 0.45 : 0;
      o.position.set(TOWER_X[i] + RAIL_X[i], BELL_Y - 0.06, PUCK_Z);
      o.rotation.set(0, 0, wob);
      const pulse = r >= 0 ? 1 + 0.12 * Math.exp(-r * 5) : 1;
      o.scale.setScalar(1.3 * pulse);
      o.updateMatrix();
      bells.setMatrixAt(i, o.matrix);
    }
    bells.instanceMatrix.needsUpdate = true;
  };

  const setNeedle = (u: number): void => {
    needleU = u;
    needle.rotation.z = -u * DIAL_ANGLE;
  };

  const resetTowers = (): void => {
    for (const tw of towers) Object.assign(tw, { phase: 'rest', t: 0, power: 0, peak: PUCK_REST, y: PUCK_REST, ring: -1, settle: 0 });
    hops.fill(null);
    stomps.fill(0);
    wants.fill(false);
  };

  drawPucks();
  drawBells();

  const onPeak = (i: number, r: RoundApi): void => {
    const tw = towers[i];
    const pts = pointsFor(tw.power);
    r.score(i, pts);
    if (rings(tw.power)) {
      tw.ring = 0;
      env.toWorld(world.set(TOWER_X[i] + RAIL_X[i], BELL_Y - 0.3, PUCK_Z));
      ctx.audio.play('star', { volume: i === 0 ? 0.9 : 0.5, pitch: 2.4 });
      ctx.audio.play('bigBoing', { volume: i === 0 ? 0.5 : 0.25, pitch: 1.6 });
      if (i === 0) {
        fx.confetti.burst(world, 50);
        r.keeperCheer(true);
        r.playerAct('cheer', 1.1);
      } else {
        fx.pop(world, 0.3, 8);
        r.friendAct(i - 1, 'cheer', 1);
      }
    } else {
      ctx.audio.play('tick', { volume: 0.4, pitch: 0.8 + tierOf(tw.power) * 0.15 });
      if (i === 0 && tierOf(tw.power) >= 4) r.keeperCheer();
    }
  };

  const launch = (i: number, power: number): void => {
    const tw = towers[i];
    tw.power = power;
    tw.peak = peakFor(power);
    tw.phase = 'up';
    tw.t = 0;
    tw.dur = riseTime(tw.peak);
    ctx.audio.play('whoosh', { volume: i === 0 ? 0.45 : 0.25, pitch: 0.9 + power * 0.8 });
  };

  const stepTowers = (dt: number, r: RoundApi | null): void => {
    for (let i = 0; i < 3; i++) {
      const tw = towers[i];
      if (tw.ring >= 0) {
        tw.ring += dt;
        if (tw.ring > 2.5) tw.ring = -1;
      }
      if (tw.settle > 0) tw.settle = Math.max(0, tw.settle - dt);
      if (tw.phase === 'up') {
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        tw.y = riseY(tw.peak, tw.t);
        if (tw.t >= 1) {
          tw.phase = 'hang';
          tw.t = 0;
          if (r) onPeak(i, r);
        }
      } else if (tw.phase === 'hang') {
        tw.t += dt;
        tw.y = tw.peak;
        if (tw.t >= (rings(tw.power) ? BELL_HANG : HANG)) {
          tw.phase = 'down';
          tw.t = 0;
          tw.dur = riseTime(tw.peak) * 0.85;
        }
      } else if (tw.phase === 'down') {
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        tw.y = fallY(tw.peak, tw.t);
        if (tw.t >= 1) {
          tw.phase = 'rest';
          tw.y = PUCK_REST;
          tw.settle = 0.3;
          ctx.audio.play('bump', { volume: i === 0 ? 0.35 : 0.18, pitch: 1.2 });
        }
      }
    }
  };

  const startHop = (i: number, power: number, pound: boolean): void => {
    hops[i] = { t: 0, dur: pound ? POUND_T : HOP_T, h: pound ? POUND_H : HOP_H, power, pound };
  };

  /** Advance hops (contestants stand on their pads); on landing the puck goes up. */
  const stepHops = (dt: number, r: RoundApi): void => {
    enter = Math.min(1, enter + dt / ENTER_T);
    for (let i = 0; i < 3; i++) {
      const h = hops[i];
      let y = 0;
      if (h) {
        h.t = Math.min(1, h.t + dt / h.dur);
        // Pound: rise, hang a beat, then slam down fast.
        const s = h.pound ? (h.t < 0.6 ? h.t / 1.2 : 0.5 + ((h.t - 0.6) / 0.4) * 0.5) : h.t;
        y = 4 * h.h * s * (1 - s);
        if (h.t >= 1) {
          hops[i] = null;
          y = 0;
          launch(i, h.power);
          stomps[i]++;
          env.toWorld(world.set(TOWER_X[i], PAD_TOP + 0.05, PAD_Z));
          fx.pop(world, h.pound ? 0.4 : 0.22, h.pound ? 12 : 6);
          ctx.audio.play(h.pound ? 'bigBoing' : 'boing', { volume: i === 0 ? 0.6 : 0.3, pitch: h.pound ? 0.8 : 1 + i * 0.08 });
          if (i === 0) {
            squash = SQUASH_T * (h.pound ? 1.4 : 1);
            if (h.pound) ctx.cameraRig.shake(0.25);
            state = 'watch';
          }
        }
      }
      if (enter < 1) {
        // Hop from the stand spot onto the pad.
        const [fx0, fz0] = i === 0 ? [0, STAND_Z] : FRIEND_SPOTS[i - 1];
        const lx = THREE.MathUtils.lerp(fx0, TOWER_X[i], enter);
        const lz = THREE.MathUtils.lerp(fz0, PAD_Z, enter);
        const ly = PAD_TOP * enter + 4 * HOP_H * enter * (1 - enter);
        if (i === 0) r.playerOffset.set(lx, ly, lz - STAND_Z);
        else r.friendPos(i - 1).set(lx, ly, lz);
      } else if (i === 0) r.playerOffset.set(0, PAD_TOP + y, PAD_Z - STAND_Z);
      else r.friendPos(i - 1).set(TOWER_X[i], PAD_TOP + y, PAD_Z);
    }
    // Player squash/stretch: stretch on the way up, squash on landing.
    if (squash > 0) {
      squash = Math.max(0, squash - dt);
      const k = squash / SQUASH_T;
      r.playerStretch(-0.5 * Math.min(1, k) * Math.cos((1 - Math.min(1, k)) * Math.PI * 0.5));
    } else if (hops[0]) {
      r.playerStretch(hops[0].t < 0.5 ? 0.22 : 0.05);
    } else r.playerStretch(0);
  };

  const stomp = (r: RoundApi, pound: boolean): void => {
    const power = stompPower(needleU, sweet, pound ? POUND_BONUS : 0);
    startHop(0, power, pound);
    state = 'hop';
    r.playerAct('jump', pound ? POUND_T : HOP_T);
  };

  const nextAim = (r: RoundApi): void => {
    state = 'aim';
    aimFor = 0;
    sweet = pickSweet(r.rng, sweet);
    sweetMesh.rotation.z = -sweet * DIAL_ANGLE;
    sweetMesh.visible = true;
  };

  return {
    id: 'strengthBell',
    duration: 0,
    thresholds: [9, 14],
    camera: { distance: 5.2, height: -0.5, fov: 72, lookAhead: 0 },
    aimLimits: null,
    how: ['stomp'],
    idle(dt) {
      idleT += dt;
      setNeedle(Math.sin(idleT * 0.9) * 0.35);
      if (towers.some((tw) => tw.phase !== 'rest' || tw.ring >= 0 || tw.settle > 0)) {
        stepTowers(dt, null);
        drawPucks();
        drawBells();
      }
    },
    begin(r) {
      round = r;
      resetTowers();
      brains = RIVAL_SKILLS.map((sk, i) => new RivalBrain(sk, makeRng(Math.floor(r.rng() * 1e9) + i), 0.9 + i * 0.6));
      needleT = 0;
      setNeedle(0);
      squash = 0;
      doneWait = 0;
      enter = 0;
      r.playerAct('jump', ENTER_T);
      r.friendAct(0, 'jump', ENTER_T);
      r.friendAct(1, 'jump', ENTER_T);
      sweet = 0;
      nextAim(r);
      stepHops(0, r);
      drawPucks();
      drawBells();
    },
    update(dt, input: Readonly<InputState>, r) {
      if (state === 'aim') {
        needleT += dt;
        aimFor += dt;
        setNeedle(needleAt(needleT));
        const pound = input.skillPressed && ctx.player.skill.id === 'groundPound';
        if (aimFor > 0.25 && enter >= 1 && (input.jumpPressed || input.usePressed || pound)) stomp(r, pound);
      } else if (state === 'watch' && towers[0].phase === 'rest') {
        if (stomps[0] >= STOMPS) {
          state = 'done';
          sweetMesh.visible = false;
        } else nextAim(r);
      }

      brains.forEach((b, i) => {
        if (b.tick(dt)) wants[i] = true;
        const who = i + 1;
        if (!wants[i] || enter < 1 || stomps[who] >= STOMPS || hops[who] || towers[who].phase !== 'rest' || towers[who].settle > 0) return;
        wants[i] = false;
        startHop(who, rivalPower(() => b.random(), b.roll()), false);
        r.friendAct(i, 'jump', HOP_T + 0.1);
      });

      stepHops(dt, r);
      stepTowers(dt, r);
      drawPucks();
      drawBells();

      const allDone = state === 'done' && stomps[1] >= STOMPS && stomps[2] >= STOMPS && towers.every((tw) => tw.phase === 'rest') && hops.every((h) => !h);
      if (allDone) {
        doneWait += dt;
        if (doneWait > 0.7) r.finish();
      }
    },
    autopilot(dt) {
      if (state !== 'aim' || aimFor < 0.3) return {};
      return Math.abs(needleAt(needleT + dt) - sweet) < 0.07 ? { jumpPressed: true } : {};
    },
    end(r) {
      round = null;
      resetTowers();
      setNeedle(0);
      sweetMesh.visible = false;
      state = 'aim';
      squash = 0;
      enter = 1;
      r.playerStretch(0);
      drawPucks();
      drawBells();
    },
    dispose() {
      booth.remove(pucks, bells, needle);
      weak.remove(sweetMesh);
      pucks.geometry.dispose();
      bells.geometry.dispose();
      needle.geometry.dispose();
      sweetMesh.geometry.dispose();
      mat.dispose();
      sweetMat.dispose();
    },
  };
}

