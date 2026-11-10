/**
 * Stunt plane sky contest at the airstrip. E at the plane → hop in → 3-2-1 → everyone takes off →
 * 90 seconds of hoops, cloud-balloons and water-balloon drops on rafts and the giant duck, with
 * loops and barrel rolls on the skill key, against two friends in their own planes → automatic
 * landing → podium. Can't crash (ground, roofs and sea boing you back up; the island edge turns
 * you round). R always leaves safely. First flight per session free, then a ticket.
 */
import * as THREE from 'three';
import { CAMERA } from '../../config';
import type { GameContext, InputState } from '../../types';
import { getStuntGate } from '../stuntGate';
import { CONTEST, prizeFor, resultStars, standings } from './contestLogic';
import type { RivalDef } from './contestLogic';
import { createContestScene } from './contestScene';
import type { ContestScene, ScoreKind } from './contestScene';
import { PLANE_TUNING, angleDelta, bezier, chooseTrick, clamp, createFlyState, flyVelocity, follow, noseDir, predictImpact, stepBalloon, stepFly, stepTrick } from './flightModel';
import type { FlyState, TrickRun, V3 } from './flightModel';
import { getSkyPilot } from './pilot';
import { SkyPilot } from './pilot';
import { LIVERIES, PLANE_DIMS, createPlaneModel } from './planeModel';
import { Rivals, pickFriends } from './rivals';
import { buildAirstrip, runwayPoint, siteFor } from './sites';
import type { SkyHud } from './skyHud';
import { RideTickets, payPrize } from './tickets';

export type PlanePhase = 'idle' | 'board' | 'countdown' | 'takeoff' | 'race' | 'landing' | 'rollout';

export interface PlaneResult {
  score: number;
  place: number;
  stars: number;
  prize: number;
  scores: { id: string; score: number }[];
}

export interface PlaneRide {
  readonly phase: PlanePhase;
  readonly score: number;
  readonly clock: number;
  readonly lastResult: PlaneResult | null;
  readonly contest: ContestScene | null;
  /** Test hook: shorter contests. */
  contestSeconds: number;
  update(dt: number): void;
  dispose(): void;
}

const RIVAL_DEFS: readonly RivalDef[] = [
  { character: 'frog', skill: 0.55, lane: 6, seed: 11 },
  { character: 'panda', skill: 0.42, lane: -6, seed: 23 },
];

const TAKEOFF_SECONDS = 3.4;
const BOARD_SECONDS = 0.6;
const ROLLOUT_SECONDS = 1.6;
const PARK_HEIGHT = -PLANE_DIMS.wheelBase;

export function createPlaneRide(ctx: GameContext, hud: SkyHud): PlaneRide {
  const site = siteFor(ctx, 'airstrip');
  const strip = buildAirstrip(ctx, site);
  const pilot = getSkyPilot(ctx);
  const tickets = new RideTickets(ctx);
  const player = ctx.player;

  const model = createPlaneModel(LIVERIES[0], true);
  ctx.scene.add(model.root);
  const park = runwayPoint(site, 9, 0, new THREE.Vector3());
  park.y = ctx.world.heightAt(park.x, park.z) + PARK_HEIGHT;
  const parkYaw = site.yaw;
  const rivalSpots = [-8.5, 8.5].map((side, i) => {
    const p = runwayPoint(site, 4 - i * 2, side, new THREE.Vector3());
    p.y = ctx.world.heightAt(p.x, p.z) + PARK_HEIGHT;
    return { pos: p, yaw: parkYaw };
  });

  let contest: ContestScene | null = null;
  let rivals: Rivals | null = null;
  const ensureContest = (): ContestScene => {
    if (!contest) contest = createContestScene(ctx);
    if (!rivals) rivals = new Rivals(ctx.scene, RIVAL_DEFS);
    return contest;
  };

  // Water balloons (one instanced draw).
  const balloonGeo = new THREE.SphereGeometry(0.42, 12, 9);
  balloonGeo.scale(1, 1.15, 1);
  const balloonMat = new THREE.MeshStandardMaterial({ color: 0x9ff3ff, roughness: 0.25, metalness: 0 });
  const balloonMesh = new THREE.InstancedMesh(balloonGeo, balloonMat, CONTEST.maxBalloons);
  balloonMesh.frustumCulled = false;
  balloonMesh.count = 0;
  ctx.scene.add(balloonMesh);
  const balloons: { pos: V3; vel: V3; alive: boolean }[] = Array.from({ length: CONTEST.maxBalloons }, () => ({ pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, alive: false }));

  // ── State ──
  let phase: PlanePhase = 'idle';
  let phaseT = 0;
  let time = 0;
  let clock: number = CONTEST.seconds;
  let score = 0;
  let lastResult: PlaneResult | null = null;
  let countdownShown = 4;
  const fly: FlyState = createFlyState(park.x, park.y, park.z, parkYaw, 0);
  const vel: V3 = { x: 0, y: 0, z: 0 };
  let trick: TrickRun | null = null;
  let trickBasePitch = 0;
  let trickPitch = 0;
  let trickRoll = 0;
  let untouched = 0;
  let dropCool = 0;
  let puffT = 0;
  let squash = 0;
  let squashV = 0;
  let playerS = 0;
  let startS = 0;
  let boardFrom = new THREE.Vector3();
  const prevChest = new THREE.Vector3();
  const curChest = new THREE.Vector3();
  const landFrom = { p: { x: 0, y: 0, z: 0 }, yaw: 0 };
  let landDur = 5;
  let podiumT = 0;
  const tmp: V3 = { x: 0, y: 0, z: 0 };
  const tmp3 = new THREE.Vector3();
  const dir3 = new THREE.Vector3();
  let contestSeconds: number = CONTEST.seconds;

  const placePlane = (x: number, y: number, z: number, yaw: number, pitchUp: number, roll: number): void => {
    model.root.position.set(x, y, z);
    model.root.rotation.set(-pitchUp, yaw, roll, 'YXZ');
  };
  placePlane(park.x, park.y, park.z, parkYaw, 0, 0);

  const award = (kind: ScoreKind | 'trick', pts: number): void => {
    if (pts <= 0) return;
    score += pts;
    const icon = kind === 'hoop' || kind === 'bonusHoop' ? 'hoop' : kind === 'cloud' || kind === 'golden' ? 'cloud' : kind === 'trick' ? 'loop' : 'target';
    hud.pop(icon, `+${pts}`);
    const pitch = kind === 'bonusHoop' || kind === 'golden' || kind === 'duck' ? 1.5 : 1.15;
    ctx.audio.play(kind === 'duck' ? 'bigBoing' : kind === 'cloud' || kind === 'golden' ? 'boing' : 'gem', { pitch, volume: 0.8 });
    if (pts >= 3) ctx.audio.play('star', { volume: 0.6 });
  };

  function racerViews(): { id: string; color: string; score: number }[] {
    const views = [{ id: 'you', color: hex(LIVERIES[0].body), score }];
    rivals?.planes.forEach((p, i) => views.push({ id: `friend${i}`, color: hex(LIVERIES[(i + 1) % LIVERIES.length].body), score: p.rival.score }));
    return views;
  }

  function enter(p: PlanePhase): void {
    phase = p;
    phaseT = 0;
  }

  function resetAll(): void {
    trick = null;
    trickPitch = trickRoll = 0;
    squash = squashV = 0;
    for (const b of balloons) b.alive = false;
    balloonMesh.count = 0;
    contest?.setAim(null);
    contest?.setVisible(false);
    contest?.reset();
    rivals?.setVisible(false);
    hud.showContest(false);
    placePlane(park.x, park.y, park.z, parkYaw, 0, 0);
    model.body.scale.set(1, 1, 1);
    fly.speed = 0;
    phase = 'idle';
    phaseT = 0;
  }

  function standBeside(): void {
    const side = parkYaw + Math.PI / 2;
    const x = park.x + Math.sin(side) * 4.5;
    const z = park.z + Math.cos(side) * 4.5;
    player.teleport(new THREE.Vector3(x, ctx.world.heightAt(x, z) + 0.05, z), parkYaw);
  }

  function finishContest(): void {
    const entries = racerViews().map((r) => ({ id: r.id, score: r.score }));
    const st = standings(entries);
    const me = st.find((s) => s.id === 'you');
    const place = me?.place ?? 3;
    const stars = resultStars(score);
    const prize = prizeFor(place);
    lastResult = { score, place, stars, prize, scores: entries };
    payPrize(ctx, prize);
    if (stars > 0) getStuntGate(ctx).stunt({ kind: 'bigAir', value: score, stars });
    ctx.events.emit('ui:toast', { icon: 'check', text: `${place}` });
    ctx.audio.play(place === 1 ? 'fanfare' : 'star');
    const colorOf = (id: string): string => racerViews().find((r) => r.id === id)?.color ?? '#fff';
    hud.podium({ places: st.map((s) => ({ id: s.id, color: colorOf(s.id), score: s.score })), you: place, stars, prize });
    podiumT = 6;
  }

  function dropBalloon(): void {
    const b = balloons.find((x) => !x.alive);
    if (!b) return;
    flyVelocity(fly, PLANE_TUNING, vel);
    b.alive = true;
    b.pos.x = fly.x;
    b.pos.y = fly.y - 1.0;
    b.pos.z = fly.z;
    b.vel.x = vel.x * 0.9;
    b.vel.y = Math.min(vel.y, 2) - 2;
    b.vel.z = vel.z * 0.9;
    ctx.audio.play('click', { pitch: 1.6, volume: 0.7 });
  }

  function updateBalloons(dt: number): void {
    const c = contest;
    let n = 0;
    const d = new THREE.Object3D();
    for (const b of balloons) {
      if (!b.alive) continue;
      stepBalloon(b.pos, b.vel, dt);
      const top = c?.targetTop(b.pos.x, b.pos.z) ?? null;
      const ground = Math.max(ctx.world.heightAt(b.pos.x, b.pos.z), ctx.world.waterLevel);
      const surf = top !== null ? Math.max(top, ground) : ground;
      if (b.pos.y <= surf) {
        b.alive = false;
        const r = c?.splash(b.pos.x, surf, b.pos.z) ?? { points: 0, kind: 'miss' as const };
        ctx.audio.play('splash', { volume: r.points > 0 ? 1 : 0.5, pitch: r.kind === 'duck' ? 1.4 : 1 });
        if (r.points > 0) award(r.kind === 'duck' ? 'duck' : 'raft', r.points);
        continue;
      }
      d.position.set(b.pos.x, b.pos.y, b.pos.z);
      d.rotation.set(time * 3, 0, time * 2);
      d.updateMatrix();
      balloonMesh.setMatrixAt(n++, d.matrix);
    }
    balloonMesh.count = n;
    balloonMesh.instanceMatrix.needsUpdate = true;
  }

  // ── Flight while racing ──
  function raceStep(dt: number, input: Readonly<InputState>): void {
    const c = contest as ContestScene;
    const controls = pilot.controls(input, fly.yaw, dt);
    untouched = SkyPilot.touched(input) ? 0 : untouched + dt;
    // Hands-off: drift gently along the course (blended out by any input).
    const assist = clamp((untouched - 1) / 1.5, 0, 0.6);
    if (assist > 0) {
      c.course.at(playerS + 34, tmp);
      const want = Math.atan2(tmp.x - fly.x, tmp.z - fly.z);
      const t = clamp(-angleDelta(fly.yaw, want) * 1.4, -1, 1);
      const climb = clamp((tmp.y - fly.y) / 10, -1, 1);
      controls.turn += (t - controls.turn) * assist;
      controls.climb += (climb - controls.climb) * assist;
    }
    const agl = fly.y - pilot.surface(fly.x, fly.y, fly.z);
    if (input.skillPressed && !trick) {
      trick = chooseTrick(controls.turn, agl);
      trickBasePitch = fly.pitch;
      ctx.audio.play('whoosh', { pitch: 1.3, volume: 0.7 });
    }
    if (trick && trick.kind === 'loop') {
      // Fly a real vertical circle: the nose goes all the way round.
      const r = stepTrick(trick, dt);
      trickPitch = r.pitch;
      noseDir(fly.yaw, trickBasePitch + trickPitch, tmp);
      fly.x += tmp.x * fly.speed * dt;
      fly.y += tmp.y * fly.speed * dt;
      fly.z += tmp.z * fly.speed * dt;
      fly.pitch = trickBasePitch;
      const floor = pilot.surface(fly.x, fly.y, fly.z) + PLANE_TUNING.floor;
      if (fly.y < floor) fly.y = floor;
      if (r.done) endTrick();
    } else {
      const ev = stepFly(fly, controls, PLANE_TUNING, dt, (x, y, z) => pilot.surface(x, y, z));
      if (ev.bounced) bounce();
      if (trick) {
        const r = stepTrick(trick, dt);
        trickRoll = r.roll;
        if (r.done) endTrick();
      }
    }
    // Walls (cliffs, the lighthouse, houses): boing off them.
    flyVelocity(fly, PLANE_TUNING, vel);
    dir3.set(vel.x, vel.y, vel.z);
    const sp = dir3.length();
    if (sp > 1) {
      dir3.divideScalar(sp);
      const n = pilot.wallAhead(tmp3.set(fly.x, fly.y, fly.z), dir3, 3 + sp * 0.25);
      if (n) {
        const h = Math.hypot(n.x, n.z) || 1;
        const dot = (dir3.x * n.x + dir3.z * n.z) / h;
        const rx = dir3.x - 2 * dot * (n.x / h);
        const rz = dir3.z - 2 * dot * (n.z / h);
        fly.yaw = Math.atan2(rx, rz);
        fly.lift = PLANE_TUNING.bounceUp * 0.6;
        bounce();
      }
    }
    if (input.jumpPressed && dropCool <= 0) {
      dropBalloon();
      dropCool = CONTEST.dropCooldown;
    }
    // Pickups along the cockpit's path this frame.
    curChest.set(fly.x, fly.y + 0.8, fly.z);
    for (const k of c.collect(prevChest, curChest)) award(k, CONTEST.points[k === 'raft' ? 'hoop' : k]);
    prevChest.copy(curChest);
    playerS = c.course.nearest(fly, playerS, 45);
  }

  function endTrick(): void {
    if (!trick) return;
    const kind = trick.kind;
    trick = null;
    trickPitch = 0;
    trickRoll = 0;
    award('trick', CONTEST.points.trick);
    getStuntGate(ctx).stunt({ kind: 'bigAir', value: kind === 'loop' ? 2 : 1, stars: 1 });
  }

  function bounce(): void {
    squashV -= 6;
    ctx.audio.play('boing', { pitch: 0.8, volume: 0.9 });
    ctx.cameraRig.shake(0.3);
  }

  function startLanding(): void {
    landFrom.p.x = fly.x;
    landFrom.p.y = fly.y;
    landFrom.p.z = fly.z;
    landFrom.yaw = fly.yaw;
    const d = Math.hypot(fly.x - park.x, fly.z - park.z);
    landDur = clamp(d / 30, 4, 8);
    trick = null;
    trickPitch = trickRoll = 0;
    contest?.setAim(null);
    rivals?.beginLanding(landDur);
    enter('landing');
  }

  // ── The controller (runs inside the player's update) ──
  const hooks = {
    step(dt: number, input: Readonly<InputState>): boolean {
      if (input.respawnPressed) {
        abort();
        return false;
      }
      phaseT += dt;
      switch (phase) {
        case 'board': {
          const k = Math.min(1, phaseT / BOARD_SECONDS);
          model.seat.updateWorldMatrix(true, false);
          tmp3.setFromMatrixPosition(model.seat.matrixWorld);
          player.position.lerpVectors(boardFrom, tmp3, k * k * (3 - 2 * k));
          player.position.y += Math.sin(Math.PI * k) * 1.2;
          player.yaw = parkYaw;
          player.setAnimation('jump');
          pilot.setCamera({ distance: 10, height: 3.2, yawOffset: 0 });
          if (k >= 1) {
            enter('countdown');
            countdownShown = 4;
          }
          break;
        }
        case 'countdown': {
          pilot.seatRider(model.seat, parkYaw, 0, 0);
          player.setAnimation('sit');
          const n = 3 - Math.floor(phaseT);
          if (n !== countdownShown && n >= 1) {
            countdownShown = n;
            hud.countdown(n);
            ctx.audio.play('tick', { pitch: 1 + (3 - n) * 0.1 });
          }
          pilot.setCamera({ distance: 11, height: 3.4, yawOffset: 0, fov: CAMERA.fov + 2 });
          ctx.audio.setLoop('engine', 0.25 + 0.1 * phaseT, 0.6 + 0.08 * phaseT);
          if (phaseT >= 3) {
            hud.countdown('go');
            ctx.audio.play('start');
            clock = contestSeconds;
            enter('takeoff');
          }
          break;
        }
        case 'takeoff': {
          const k = Math.min(1, phaseT / TAKEOFF_SECONDS);
          const c = contest as ContestScene;
          const fx = Math.sin(parkYaw);
          const fz = Math.cos(parkYaw);
          const along = 70 * k * k;
          const goal = c.course.at(startS + 40, tmp);
          const lift = Math.max(0, (k - 0.45) / 0.55);
          const x = park.x + fx * along;
          const z = park.z + fz * along;
          const px = x + (goal.x - x) * lift * lift;
          const py = park.y + (goal.y - park.y) * lift * lift;
          const pz = z + (goal.z - z) * lift * lift;
          const pitch = lift > 0 && lift < 0.95 ? 0.3 * Math.sin(lift * Math.PI) : 0;
          const yaw = lift > 0.2 ? fly.yaw + angleDelta(fly.yaw, Math.atan2(px - fly.x, pz - fly.z)) * follow(6, dt) : parkYaw;
          fly.x = px;
          fly.y = py;
          fly.z = pz;
          fly.yaw = yaw;
          fly.pitch = pitch;
          fly.roll = 0;
          fly.speed = PLANE_TUNING.cruise * Math.max(0.15, k);
          placePlane(px, py, pz, yaw, pitch, 0);
          pilot.seatRider(model.seat, yaw, pitch, 0);
          player.setAnimation('sit');
          pilot.setCamera({ distance: 10 + 2 * k, height: 3.2, yawOffset: 0, fov: CAMERA.fov + 4 + 4 * k });
          ctx.audio.setLoop('engine', 0.6 + 0.3 * k, 0.9 + 0.3 * k);
          if (k >= 1) {
            enter('race');
            fly.speed = PLANE_TUNING.cruise;
            fly.lift = 0;
            fly.yawRate = 0;
            playerS = c.course.nearest(fly, startS + 40, 60);
            prevChest.set(fly.x, fly.y + 0.8, fly.z);
            untouched = 0;
          }
          break;
        }
        case 'race': {
          raceStep(dt, input);
          placePlane(fly.x, fly.y, fly.z, fly.yaw, fly.pitch + trickPitch, fly.roll + trickRoll);
          pilot.seatRider(model.seat, fly.yaw, fly.pitch + trickPitch, fly.roll + trickRoll);
          player.setAnimation('sit');
          const sf = clamp((fly.speed - PLANE_TUNING.cruise * 0.8) / (PLANE_TUNING.boost - PLANE_TUNING.cruise * 0.8), 0, 1);
          pilot.setCamera({ distance: 10.5 + 3 * sf, height: 3.2, fov: CAMERA.fov + 8 + 8 * sf, lookAhead: 0.2, yawOffset: 0 });
          ctx.audio.setLoop('engine', 0.75 + 0.25 * sf, 1 + 0.35 * sf + fly.pitch * -0.2);
          ctx.audio.setLoop('wind', 0.15 + 0.3 * sf, 0.8 + 0.3 * sf);
          clock -= dt;
          if (clock <= 0) startLanding();
          break;
        }
        case 'landing': {
          const t = Math.min(1, phaseT / landDur);
          const e = t * t * (3 - 2 * t);
          const fx = Math.sin(parkYaw);
          const fz = Math.cos(parkYaw);
          const touch = { x: park.x - fx * 10, y: park.y, z: park.z - fz * 10 };
          const p1 = { x: landFrom.p.x + Math.sin(landFrom.yaw) * 30, y: landFrom.p.y, z: landFrom.p.z + Math.cos(landFrom.yaw) * 30 };
          const p2 = { x: touch.x - fx * 45, y: touch.y + 6, z: touch.z - fz * 45 };
          bezier(landFrom.p, p1, p2, touch, e, tmp);
          const dx = tmp.x - fly.x;
          const dz = tmp.z - fly.z;
          if (Math.hypot(dx, dz) > 1e-3) fly.yaw += angleDelta(fly.yaw, Math.atan2(dx, dz)) * follow(8, dt);
          fly.pitch += ((t > 0.85 ? 0.08 : -0.06) - fly.pitch) * follow(3, dt);
          fly.roll += (0 - fly.roll) * follow(3, dt);
          fly.x = tmp.x;
          fly.y = tmp.y;
          fly.z = tmp.z;
          fly.speed = 22 * (1 - t) + 8;
          placePlane(fly.x, fly.y, fly.z, fly.yaw, fly.pitch, fly.roll);
          pilot.seatRider(model.seat, fly.yaw, fly.pitch, fly.roll);
          player.setAnimation('sit');
          pilot.setCamera({ distance: 13, height: 4, fov: CAMERA.fov + 6, yawOffset: 0 });
          ctx.audio.setLoop('engine', 0.6 - 0.2 * t, 0.9 - 0.2 * t);
          ctx.audio.setLoop('wind', 0.1, 0.7);
          if (t >= 1) {
            ctx.audio.play('land');
            squashV -= 4;
            enter('rollout');
          }
          break;
        }
        case 'rollout': {
          const k = Math.min(1, phaseT / ROLLOUT_SECONDS);
          const e = 1 - (1 - k) * (1 - k);
          const fx = Math.sin(parkYaw);
          const fz = Math.cos(parkYaw);
          fly.x = park.x - fx * 10 * (1 - e);
          fly.y = park.y;
          fly.z = park.z - fz * 10 * (1 - e);
          fly.yaw += angleDelta(fly.yaw, parkYaw) * follow(6, dt);
          fly.pitch = 0;
          fly.roll = 0;
          placePlane(fly.x, fly.y, fly.z, fly.yaw, 0, 0);
          pilot.seatRider(model.seat, fly.yaw, 0, 0);
          player.setAnimation(k > 0.6 ? 'cheer' : 'sit');
          pilot.setCamera({ distance: 9, height: 3, yawOffset: 0.6 });
          ctx.audio.setLoop('engine', 0.35 * (1 - k), 0.7);
          ctx.audio.setLoop('wind', 0);
          if (k >= 1) {
            finishContest();
            return false; // hand back (onRelease puts the hero beside the plane)
          }
          break;
        }
        default:
          return false;
      }
      return true;
    },
    onRelease(): void {
      const wasRacing = phase !== 'idle';
      resetAll();
      if (wasRacing) {
        standBeside();
        player.launch(new THREE.Vector3(0, 0, 0));
      }
    },
  };

  function abort(): void {
    // R: leave right away, no prize; the hero hops out next to the plane.
    hud.hidePodium();
    ctx.events.emit('player:respawn', {});
  }

  const removeInteract = ctx.interactions.add({
    id: 'sky-plane',
    position: () => tmp3.set(park.x, park.y + 0.6, park.z),
    radius: 4.6,
    icon: 'rocket',
    enabled: () => phase === 'idle' && pilot.canTake(),
    onUse() {
      if (phase !== 'idle' || !pilot.canTake()) return;
      if (!tickets.pay()) return;
      const c = ensureContest();
      c.reset();
      score = 0;
      lastResult = null;
      hud.hidePodium();
      podiumT = 0;
      boardFrom = player.position.clone();
      startS = c.course.nearest(runwayPoint(site, 60, 0, new THREE.Vector3()));
      rivals?.loadHeroes(pickFriends(player.characterId));
      rivals?.park(rivalSpots, startS);
      if (!pilot.take(hooks)) return;
      enter('board');
      fly.x = park.x;
      fly.y = park.y;
      fly.z = park.z;
      fly.yaw = parkYaw;
      fly.pitch = fly.roll = 0;
      c.setVisible(true);
      rivals?.setVisible(true);
      hud.showContest(true);
      hud.setClock(contestSeconds);
      ctx.audio.play('jump');
    },
  });

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') tickets.reset();
    if (e.phase === 'title' || e.phase === 'ended') {
      if (pilot.active && phase !== 'idle') pilot.release();
      resetAll();
      hud.hidePodium();
    }
  });

  return {
    get phase() {
      return phase;
    },
    get score() {
      return score;
    },
    get clock() {
      return clock;
    },
    get lastResult() {
      return lastResult;
    },
    get contest() {
      return contest;
    },
    get contestSeconds() {
      return contestSeconds;
    },
    set contestSeconds(s: number) {
      contestSeconds = s;
    },
    update(dt) {
      time += dt;
      const playing = ctx.session.state.phase === 'playing';
      strip.update(dt, time);
      dropCool = Math.max(0, dropCool - dt);
      // Body squash spring (bounces, touchdown).
      squashV += (-120 * squash - 9 * squashV) * dt;
      squash += squashV * dt;
      const sq = clamp(squash * 0.08, -0.25, 0.25);
      model.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
      const rpm = phase === 'idle' ? 0 : phase === 'board' ? 0.1 : phase === 'countdown' ? 0.25 + phaseT * 0.2 : phase === 'rollout' ? 0.6 * (1 - phaseT / ROLLOUT_SECONDS) : 1;
      model.update(dt, rpm, phase === 'idle' ? 0 : fly.speed, time);
      if (podiumT > 0) {
        podiumT -= dt;
        if (podiumT <= 0) hud.hidePodium();
      }
      if (phase === 'idle' || !playing) return;
      const c = contest as ContestScene;
      const r = rivals as Rivals;
      c.update(dt, time);
      // Friends.
      if (phase === 'board' || phase === 'countdown') r.idle(dt, time);
      else if (phase === 'takeoff') r.takeoff(Math.min(1, phaseT / TAKEOFF_SECONDS), c.course, dt, time);
      else if (phase === 'race') {
        const out = r.race(dt, c.course, playerS, c.hoopS, time);
        if (out.overtakes.length > 0) {
          // A friend zooms past and puffs harmless confetti over you.
          c.confettiAt(fly.x, fly.y + 2, fly.z, 22);
          ctx.audio.play('boing', { pitch: 1.7, volume: 0.6 });
        }
      } else if (phase === 'landing') r.landing(dt, time);
      else if (phase === 'rollout') r.rollout(Math.min(1, phaseT / ROLLOUT_SECONDS), dt, time);
      // Smoke trail: a puff stream from the tail (thicker on boost).
      if (phase === 'race' || phase === 'takeoff') {
        puffT -= dt;
        if (puffT <= 0 && (phase === 'race' || phaseT > TAKEOFF_SECONDS * 0.5)) {
          puffT = ctx.input.state.sprint ? 0.03 : 0.06;
          noseDir(fly.yaw, fly.pitch + trickPitch, tmp);
          c.puffs.spawn(fly.x - tmp.x * 2.6, fly.y - tmp.y * 2.6 + 0.2, fly.z - tmp.z * 2.6, 0, 0.3, 0, 2.4, 0.35, 1.2);
        }
      }
      // Aim marker for the water balloons: where one dropped now would land.
      if (phase === 'race') {
        flyVelocity(fly, PLANE_TUNING, vel);
        const ground = Math.max(ctx.world.heightAt(fly.x + vel.x, fly.z + vel.z), ctx.world.waterLevel);
        const hit = predictImpact({ x: fly.x, y: fly.y - 1, z: fly.z }, { x: vel.x * 0.9, y: Math.min(vel.y, 2) - 2, z: vel.z * 0.9 }, ground);
        c.setAim(hit && fly.y - ground < 60 ? { x: hit.x, y: c.targetTop(hit.x, hit.z) ?? Math.max(ctx.world.heightAt(hit.x, hit.z), ctx.world.waterLevel), z: hit.z } : null);
      }
      updateBalloons(dt);
      hud.setClock(phase === 'race' ? clock : phase === 'board' || phase === 'countdown' ? contestSeconds : Math.max(0, clock));
      hud.setRacers(racerViews());
      const input = ctx.input.state;
      if (phase === 'race') {
        hud.setHints(
          [
            { icon: 'drop', key: 'space', cool: dropCool > 0 },
            { icon: 'loop', key: 'skill', cool: !!trick },
          ],
          input.device === 'gamepad',
          input.device === 'touch',
        );
      } else {
        hud.setHints([], false, false);
      }
    },
    dispose() {
      offPhase();
      removeInteract();
      if (pilot.active && phase !== 'idle') pilot.release();
      model.dispose();
      strip.dispose();
      contest?.dispose();
      rivals?.dispose();
      balloonMesh.removeFromParent();
      balloonMesh.dispose();
      balloonGeo.dispose();
      balloonMat.dispose();
    },
  };
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
