/**
 * The friendly dragon at its roost on the ridge. E → toss it a treat (it chomps, wiggles and gives
 * a happy roar) → hop on → a relaxed free flight round the whole island: Space flaps for height (in
 * rhythm = a bigger flap), glide and swoop with the stick, the skill key blows a stream of bubbles
 * and sparkles that pop cloud-balloons. Hands off, the dragon follows the tour by itself. The
 * treasure trail and the golden cloud-balloons are weak-eye only. At the end it glides home and
 * lands gently back on the roost. R always leaves safely. First ride per session free, then a ticket.
 */
import * as THREE from 'three';
import { CAMERA } from '../../config';
import { VisionLayer } from '../../types';
import type { GameContext, InputState } from '../../types';
import { buildGemGeometry } from '../gems';
import { segmentSphereHit } from '../gemLogic';
import { getStuntGate } from '../stuntGate';
import { createCourse, offsetAt } from './course';
import type { Course } from './course';
import { DRAGON_TUNING, angleDelta, bezier, clamp, createFlyState, flyVelocity, follow, stepFly } from './flightModel';
import type { FlyState, V3 } from './flightModel';
import { CONFETTI_COLORS, Puffs } from './fx';
import { DRAGON_DIMS, createDragonModel } from './dragonModel';
import { SkyPilot, getSkyPilot } from './pilot';
import { outlineGeometry } from './planeModel';
import { buildRoost, siteFor } from './sites';
import type { SkyHud } from './skyHud';
import { RideTickets, payPrize } from './tickets';

export type DragonPhase = 'idle' | 'feed' | 'mount' | 'launch' | 'tour' | 'return' | 'land' | 'dismount';

/** Tour control points round the island (x, z, clearance above ground). */
export const TOUR_POINTS: readonly (readonly [number, number, number])[] = [
  [-26, -100, 26],
  [2, -66, 30],
  [8, -12, 30],
  [56, -34, 30],
  [100, 16, 26],
  [92, 78, 24],
  [42, 112, 22],
  [-18, 92, 26],
  [-74, 50, 26],
  [-116, -16, 22],
  [-96, -88, 26],
  [-60, -136, 28],
];

export const TOUR = {
  seconds: 80,
  treasureSpacing: 38,
  treasureRadius: 2.6,
  /** Treasure weaves off the autopilot line: amplitude (m) and wavelength (m). */
  weave: 9,
  weaveLength: 70,
  clouds: 8,
  golden: 5,
  cloudRadius: 3.2,
  bubbleHit: 2.9,
  flapLift: 7,
  rhythmBonus: 3.5,
  breathSeconds: 1.4,
  breathCooldown: 0.6,
} as const;

/** Stars for a dragon tour by treasures found. */
export function tourStars(treasure: number): number {
  return treasure >= 15 ? 3 : treasure >= 8 ? 2 : treasure >= 1 ? 1 : 0;
}

export interface DragonRide {
  readonly phase: DragonPhase;
  readonly treasure: number;
  readonly clouds: number;
  readonly befriended: boolean;
  readonly lastTour: { treasure: number; clouds: number; stars: number } | null;
  readonly weakObjects: THREE.Object3D[];
  readonly course: Course;
  /** Test hook: shorter tours. */
  tourSeconds: number;
  /** Test hook: put the dragon at a pose during the tour (returns false if not touring). */
  testPose(x: number, y: number, z: number, yaw: number): boolean;
  /** Treasure trail spots (tests aim at them). */
  readonly treasureSpots: readonly THREE.Vector3[];
  update(dt: number): void;
  dispose(): void;
}

const FEED_SECONDS = 2.4;
const MOUNT_SECONDS = 0.7;
const LAUNCH_SECONDS = 1.8;
const LAND_SECONDS = 0.9;
const DISMOUNT_SECONDS = 0.7;

export function createDragonRide(ctx: GameContext, hud: SkyHud): DragonRide {
  const site = siteFor(ctx, 'dragonRoost');
  const roost = buildRoost(ctx, site);
  const pilot = getSkyPilot(ctx);
  const tickets = new RideTickets(ctx, 'dragon');
  const player = ctx.player;
  const w = ctx.world;

  const model = createDragonModel();
  ctx.scene.add(model.root);
  const perch = new THREE.Vector3(site.x, roost.perchY, site.z);
  const perchYaw = site.yaw;
  model.root.position.copy(perch);
  model.root.rotation.set(0, perchYaw, 0, 'YXZ');

  // ── Tour course (starts and ends by the roost) ──
  const control = TOUR_POINTS.map(([x, z, clear]) => ({ x, y: Math.max(w.heightAt(x, z), w.waterLevel) + clear, z }));
  const course = createCourse(control, 16);
  const L = course.length;
  const startS = course.nearest({ x: perch.x + Math.sin(perchYaw) * 20, y: perch.y + 14, z: perch.z + Math.cos(perchYaw) * 20 });

  // ── Weak-eye layer: treasure trail and golden cloud-balloons ──
  const weak = new THREE.Group();
  weak.name = 'sky-dragon-weak';
  ctx.vision.add(weak, VisionLayer.WeakOnly);
  const treasureSpots: THREE.Vector3[] = [];
  for (let d = 40; d < L - 60; d += TOUR.treasureSpacing) {
    const s = startS + d;
    const side = TOUR.weave * Math.sin((d / TOUR.weaveLength) * Math.PI * 2);
    const p = offsetAt(course, s, side, 1.5 * Math.sin(d / 23));
    treasureSpots.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const gemGeo = buildGemGeometry();
  const gemMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const treasureMesh = new THREE.InstancedMesh(gemGeo, gemMat, Math.max(1, treasureSpots.length));
  const taken = treasureSpots.map(() => false);

  const cloudParts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of [
    [0, 0, 0, 1.3],
    [1.1, -0.2, 0.1, 0.95],
    [-1.1, -0.15, -0.1, 1.0],
    [0.4, 0.75, 0.2, 0.85],
  ] as const) {
    const g = new THREE.SphereGeometry(r, 12, 9).translate(x, y, z).toNonIndexed();
    g.deleteAttribute('uv');
    cloudParts.push(g);
  }
  const cloudBase = new THREE.BufferGeometry();
  {
    const arrays = cloudParts.map((g) => g.getAttribute('position').array as Float32Array);
    const narrays = cloudParts.map((g) => g.getAttribute('normal').array as Float32Array);
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const pos = new Float32Array(total);
    const nor = new Float32Array(total);
    let o = 0;
    arrays.forEach((a, i) => {
      pos.set(a, o);
      nor.set(narrays[i], o);
      o += a.length;
    });
    cloudBase.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    cloudBase.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    for (const g of cloudParts) g.dispose();
  }
  const goldGeo = cloudBase.clone();
  {
    const pos = goldGeo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const v = Math.sin(pos.getX(i) * 3 + pos.getY(i) * 4) > 0.55 ? 0.45 : 1;
      col.set([v, v, v], i * 3);
    }
    goldGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const goldMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const goldMesh = new THREE.InstancedMesh(goldGeo, goldMat, TOUR.golden);
  const weakSparkGeo = new THREE.OctahedronGeometry(0.5);
  const weakSparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const weakSparks = new Puffs({ max: 40, geometry: weakSparkGeo, material: weakSparkMat, gravity: 3, drag: 1 });
  for (const m of [treasureMesh, goldMesh]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  weak.add(treasureMesh, goldMesh, weakSparks.mesh);
  weak.visible = false;

  // ── Both eyes: cloud-balloons, bubbles, sparkles, the treat ──
  const both = new THREE.Group();
  both.name = 'sky-dragon-fx';
  ctx.scene.add(both);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const cloudOutlineGeo = outlineGeometry(cloudBase, 0.12);
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x05060c, side: THREE.BackSide });
  const cloudMesh = new THREE.InstancedMesh(cloudBase, cloudMat, TOUR.clouds);
  const cloudOutline = new THREE.InstancedMesh(cloudOutlineGeo, outlineMat, TOUR.clouds);
  for (const m of [cloudMesh, cloudOutline]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const cloudSpots: THREE.Vector3[] = [];
  for (let i = 0; i < TOUR.clouds; i++) {
    const p = offsetAt(course, startS + (i + 0.6) * ((L - 80) / TOUR.clouds), i % 2 ? 6 : -6, 2);
    cloudSpots.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const goldSpots: THREE.Vector3[] = [];
  for (let i = 0; i < TOUR.golden; i++) {
    const p = offsetAt(course, startS + (i + 0.25) * ((L - 80) / TOUR.golden), i % 2 ? -13 : 13, 4);
    goldSpots.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const cloudGone = cloudSpots.map(() => 0);
  const goldGone = goldSpots.map(() => false);
  const bubbleGeo = new THREE.SphereGeometry(0.5, 12, 9);
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xeafcff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6, depthWrite: false });
  const bubbles = new Puffs({ max: 80, geometry: bubbleGeo, material: bubbleMat, gravity: -0.6, drag: 0.7 });
  const sparkGeo = new THREE.OctahedronGeometry(0.3);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparks = new Puffs({ max: 60, geometry: sparkGeo, material: sparkMat, gravity: 2, drag: 1.2 });
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const puffs = new Puffs({ max: 40, geometry: puffGeo, material: puffMat, gravity: -0.3, drag: 1.2 });
  const treatGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.1, 14);
  const treatMat = new THREE.MeshStandardMaterial({ color: 0xffd99a, roughness: 0.8 });
  const treat = new THREE.Mesh(treatGeo, treatMat);
  treat.visible = false;
  both.add(cloudMesh, cloudOutline, bubbles.mesh, sparks.mesh, puffs.mesh, treat);
  // Only drawn during a ride (idle roost = dragon + rocks + sign).
  both.visible = false;

  // ── State ──
  let phase: DragonPhase = 'idle';
  let phaseT = 0;
  let time = 0;
  let befriended = false;
  let treasure = 0;
  let cloudsPopped = 0;
  let tourT = 0;
  let tourSeconds: number = TOUR.seconds;
  let lastTour: { treasure: number; clouds: number; stars: number } | null = null;
  const fly: FlyState = createFlyState(perch.x, perch.y, perch.z, perchYaw, 0);
  let progress = startS;
  let untouched = 0;
  let sinceFlap = 9;
  let breathT = 0;
  let breathCool = 0;
  let bubbleT = 0;
  let happy = 0;
  let flapVis = 0;
  const from = new THREE.Vector3();
  const tmp: V3 = { x: 0, y: 0, z: 0 };
  const vel: V3 = { x: 0, y: 0, z: 0 };
  const tmp3 = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const prevChest = new THREE.Vector3();
  const curChest = new THREE.Vector3();
  const homeFrom = { p: { x: 0, y: 0, z: 0 }, yaw: 0 };
  let homeDur = 5;
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);

  const enter = (p: DragonPhase): void => {
    phase = p;
    phaseT = 0;
  };

  const placeDragon = (x: number, y: number, z: number, yaw: number, pitchUp: number, roll: number): void => {
    model.root.position.set(x, y, z);
    model.root.rotation.set(-pitchUp, yaw, roll, 'YXZ');
  };

  function resetTour(): void {
    taken.fill(false);
    cloudGone.fill(0);
    goldGone.fill(false);
    treasure = 0;
    cloudsPopped = 0;
    tourT = 0;
    bubbles.clear();
    sparks.clear();
    weakSparks.clear();
  }

  function resetAll(): void {
    phase = 'idle';
    phaseT = 0;
    treat.visible = false;
    weak.visible = false;
    both.visible = false;
    hud.showTour(false);
    placeDragon(perch.x, perch.y, perch.z, perchYaw, 0, 0);
    fly.speed = 0;
    happy = 0;
  }

  function roar(): void {
    happy = Math.max(happy, 1);
    ctx.audio.play('horn', { pitch: 0.55, volume: 0.9 });
    model.mouthWorld(mouth);
    sparks.burst(mouth.x, mouth.y, mouth.z, 14, 6, 0.9, 0.9, CONFETTI_COLORS);
  }

  function standAtFeedSpot(): void {
    const s = roost.standSpot;
    player.teleport(new THREE.Vector3(s.x, s.y + 0.05, s.z), perchYaw + Math.PI);
  }

  function popCloud(i: number): void {
    const c = cloudSpots[i];
    cloudGone[i] = 14;
    cloudsPopped++;
    puffs.burst(c.x, c.y, c.z, 10, 7, 0.8, 0.9);
    sparks.burst(c.x, c.y, c.z, 12, 8, 1, 1, CONFETTI_COLORS);
    ctx.audio.play('boing', { pitch: 1.3, volume: 0.8 });
    hud.pop('cloud', '+1');
  }

  function popGolden(i: number): void {
    const c = goldSpots[i];
    goldGone[i] = true;
    cloudsPopped++;
    weakSparks.burst(c.x, c.y, c.z, 16, 9, 0.9, 0.5);
    ctx.audio.play('boing', { pitch: 1.6, volume: 0.8 });
    payPrize(ctx, 2, 'gem');
    hud.pop('cloud', '+2');
    roar();
  }

  function tourStep(dt: number, input: Readonly<InputState>): void {
    const controls = pilot.controls(input, fly.yaw, dt);
    untouched = SkyPilot.touched(input) ? 0 : untouched + dt;
    const assist = clamp((untouched - 1.2) / 1.5, 0, 0.75);
    if (assist > 0) {
      course.at(progress + 30, tmp);
      const want = Math.atan2(tmp.x - fly.x, tmp.z - fly.z);
      const t = clamp(-angleDelta(fly.yaw, want) * 1.4, -1, 1);
      const climb = clamp((tmp.y - fly.y) / 8, -1, 1);
      controls.turn += (t - controls.turn) * assist;
      controls.climb += (climb - controls.climb) * assist;
      // The autopilot keeps flapping a little so a hands-off ride never sinks.
      if (fly.y < tmp.y - 3) fly.lift = Math.max(fly.lift, 3 * assist);
    }
    sinceFlap += dt;
    if (input.jumpPressed) {
      const rhythm = sinceFlap > 0.35 && sinceFlap < 1.0;
      fly.lift = Math.min(14, fly.lift + TOUR.flapLift + (rhythm ? TOUR.rhythmBonus : 0));
      sinceFlap = 0;
      flapVis = 1;
      model.flapNow();
      ctx.audio.play('whoosh', { pitch: rhythm ? 0.85 : 0.65, volume: 0.6 });
      if (rhythm) {
        tmp3.set(fly.x, fly.y + 1, fly.z);
        sparks.burst(tmp3.x, tmp3.y, tmp3.z, 8, 4, 0.6, 0.6, CONFETTI_COLORS);
      }
    }
    if (input.skillPressed && breathT <= 0 && breathCool <= 0) {
      breathT = TOUR.breathSeconds;
      ctx.audio.play('whoosh', { pitch: 1.5, volume: 0.6 });
    }
    if (input.emotePressed) roar();
    const ev = stepFly(fly, controls, DRAGON_TUNING, dt, (x, y, z) => pilot.surface(x, y, z));
    if (ev.bounced) {
      ctx.audio.play('boing', { pitch: 0.7 });
      ctx.cameraRig.shake(0.25);
    }
    // Treasure trail and clouds along the rider's path.
    curChest.set(fly.x, fly.y + DRAGON_DIMS.seat.y + 0.8, fly.z);
    for (let i = 0; i < treasureSpots.length; i++) {
      if (taken[i]) continue;
      if (segmentSphereHit(prevChest, curChest, treasureSpots[i], TOUR.treasureRadius) || segmentSphereHit(prevChest, curChest, treasureSpots[i].clone().setY(treasureSpots[i].y + 1.7), TOUR.treasureRadius)) {
        taken[i] = true;
        treasure++;
        const p = treasureSpots[i];
        weakSparks.burst(p.x, p.y, p.z, 10, 7, 0.6, 0.45);
        ctx.audio.play('gem', { pitch: 1 + Math.min(0.8, treasure * 0.04) });
        payPrize(ctx, 1, 'gem');
      }
    }
    for (let i = 0; i < cloudSpots.length; i++) {
      if (cloudGone[i] > 0) continue;
      if (segmentSphereHit(prevChest, curChest, cloudSpots[i], TOUR.cloudRadius + 1)) popCloud(i);
    }
    for (let i = 0; i < goldSpots.length; i++) {
      if (goldGone[i]) continue;
      if (segmentSphereHit(prevChest, curChest, goldSpots[i], TOUR.cloudRadius + 1)) popGolden(i);
    }
    prevChest.copy(curChest);
    progress = course.nearest(fly, progress, 50);
  }

  function startReturn(): void {
    homeFrom.p.x = fly.x;
    homeFrom.p.y = fly.y;
    homeFrom.p.z = fly.z;
    homeFrom.yaw = fly.yaw;
    homeDur = clamp(Math.hypot(fly.x - perch.x, fly.z - perch.z) / 16, 3, 8);
    breathT = 0;
    enter('return');
  }

  const hooks = {
    step(dt: number, input: Readonly<InputState>): boolean {
      if (input.respawnPressed) return false;
      phaseT += dt;
      switch (phase) {
        case 'feed': {
          // The hero tosses a treat; the dragon chomps it and does a happy wiggle and roar.
          player.position.copy(roost.standSpot);
          player.yaw = Math.atan2(perch.x - roost.standSpot.x, perch.z - roost.standSpot.z);
          player.setAnimation(phaseT < 0.5 ? 'wave' : phaseT < 1.2 ? 'jump' : 'cheer');
          const k = clamp((phaseT - 0.4) / 0.7, 0, 1);
          treat.visible = k > 0 && k < 1;
          if (treat.visible) {
            model.mouthWorld(mouth);
            tmp3.copy(roost.standSpot).setY(roost.standSpot.y + 1.3);
            treat.position.lerpVectors(tmp3, mouth, k);
            treat.position.y += Math.sin(Math.PI * k) * 2.2;
            treat.rotation.set(time * 9, time * 5, 0);
          }
          if (phaseT >= 1.1 && phaseT - dt < 1.1) {
            ctx.audio.play('click', { pitch: 0.55 });
            ctx.audio.play('click', { pitch: 0.5, volume: 0.8 });
            happy = 1;
          }
          if (phaseT >= 1.5 && phaseT - dt < 1.5) roar();
          pilot.setCamera({ distance: 9, height: 3.5, yawOffset: 0.5 });
          if (phaseT >= (befriended ? FEED_SECONDS * 0.75 : FEED_SECONDS)) {
            befriended = true;
            from.copy(player.position);
            enter('mount');
          }
          break;
        }
        case 'mount': {
          const k = Math.min(1, phaseT / MOUNT_SECONDS);
          model.seat.updateWorldMatrix(true, false);
          tmp3.setFromMatrixPosition(model.seat.matrixWorld);
          player.position.lerpVectors(from, tmp3, k * k * (3 - 2 * k));
          player.position.y += Math.sin(Math.PI * k) * 1.6;
          player.yaw += angleDelta(player.yaw, perchYaw) * follow(10, dt);
          player.setAnimation('jump');
          pilot.setCamera({ distance: 10, height: 4, yawOffset: 0 });
          if (k >= 1) {
            enter('launch');
            from.copy(perch);
            ctx.audio.play('whoosh', { pitch: 0.6 });
          }
          break;
        }
        case 'launch': {
          const k = Math.min(1, phaseT / LAUNCH_SECONDS);
          const e = k * k * (3 - 2 * k);
          const fx = Math.sin(perchYaw);
          const fz = Math.cos(perchYaw);
          fly.x = from.x + fx * 16 * e;
          fly.y = from.y + 12 * Math.sin((e * Math.PI) / 2);
          fly.z = from.z + fz * 16 * e;
          fly.yaw = perchYaw;
          fly.pitch = 0.35 * Math.sin(Math.PI * k);
          placeDragon(fly.x, fly.y, fly.z, fly.yaw, fly.pitch, 0);
          pilot.seatRider(model.seat, fly.yaw, fly.pitch, 0);
          player.setAnimation('sit');
          flapVis = 1;
          pilot.setCamera({ distance: 11 + 2 * k, height: 4, yawOffset: 0, fov: CAMERA.fov + 6 * k });
          ctx.audio.setLoop('wind', 0.2 * k, 0.7);
          if (k >= 1) {
            enter('tour');
            fly.speed = DRAGON_TUNING.cruise * 0.8;
            fly.lift = 2;
            fly.yawRate = 0;
            progress = course.nearest(fly, startS, 60);
            prevChest.set(fly.x, fly.y + DRAGON_DIMS.seat.y + 0.8, fly.z);
            untouched = 0;
            tourT = 0;
            roar();
          }
          break;
        }
        case 'tour': {
          tourT += dt;
          tourStep(dt, input);
          placeDragon(fly.x, fly.y, fly.z, fly.yaw, fly.pitch, fly.roll);
          pilot.seatRider(model.seat, fly.yaw, fly.pitch, fly.roll);
          player.setAnimation('sit');
          const sf = clamp((fly.speed - DRAGON_TUNING.cruise * 0.8) / (DRAGON_TUNING.boost - DRAGON_TUNING.cruise * 0.8), 0, 1);
          pilot.setCamera({ distance: 12 + 2 * sf, height: 4.2, fov: CAMERA.fov + 8 + 6 * sf, lookAhead: 0.2, yawOffset: 0 });
          ctx.audio.setLoop('wind', 0.25 + 0.4 * sf, 0.75 + 0.3 * sf);
          if (tourT >= tourSeconds || progress - startS >= L - 70) startReturn();
          break;
        }
        case 'return': {
          const t = Math.min(1, phaseT / homeDur);
          const e = t * t * (3 - 2 * t);
          const fx = Math.sin(perchYaw);
          const fz = Math.cos(perchYaw);
          const p1 = { x: homeFrom.p.x + Math.sin(homeFrom.yaw) * 25, y: homeFrom.p.y + 4, z: homeFrom.p.z + Math.cos(homeFrom.yaw) * 25 };
          const p2 = { x: perch.x + fx * 24, y: perch.y + 10, z: perch.z + fz * 24 };
          bezier(homeFrom.p, p1, p2, perch, e, tmp);
          const dx = tmp.x - fly.x;
          const dz = tmp.z - fly.z;
          // Face the travel direction, then turn round to face out from the roost on landing.
          const want = t < 0.8 && Math.hypot(dx, dz) > 1e-3 ? Math.atan2(dx, dz) : perchYaw;
          fly.yaw += angleDelta(fly.yaw, want) * follow(t < 0.8 ? 6 : 4, dt);
          fly.pitch += (0 - fly.pitch) * follow(3, dt);
          fly.roll += (0 - fly.roll) * follow(3, dt);
          fly.x = tmp.x;
          fly.y = tmp.y;
          fly.z = tmp.z;
          flapVis = t > 0.7 ? 1 : 0.3;
          placeDragon(fly.x, fly.y, fly.z, fly.yaw, fly.pitch, fly.roll);
          pilot.seatRider(model.seat, fly.yaw, fly.pitch, fly.roll);
          player.setAnimation('sit');
          pilot.setCamera({ distance: 13, height: 4.5, fov: CAMERA.fov + 6, yawOffset: 0 });
          ctx.audio.setLoop('wind', 0.15 * (1 - t), 0.7);
          if (t >= 1) {
            ctx.audio.play('land');
            enter('land');
          }
          break;
        }
        case 'land': {
          const k = Math.min(1, phaseT / LAND_SECONDS);
          fly.yaw += angleDelta(fly.yaw, perchYaw) * follow(8, dt);
          placeDragon(perch.x, perch.y, perch.z, fly.yaw, 0, 0);
          pilot.seatRider(model.seat, fly.yaw, 0, 0);
          player.setAnimation('sit');
          pilot.setCamera({ distance: 9, height: 3.5, yawOffset: 0.5 });
          if (k >= 1) {
            from.copy(player.position);
            enter('dismount');
          }
          break;
        }
        case 'dismount': {
          const k = Math.min(1, phaseT / DISMOUNT_SECONDS);
          const s = roost.standSpot;
          player.position.lerpVectors(from, tmp3.set(s.x, s.y + 0.05, s.z), k * k * (3 - 2 * k));
          player.position.y += Math.sin(Math.PI * k) * 1.4;
          // Turn round in the air to land facing your dragon friend.
          player.yaw += angleDelta(player.yaw, perchYaw + Math.PI) * follow(8, dt);
          player.setAnimation('jump');
          pilot.setCamera({ distance: 8, height: 3, yawOffset: 0 });
          if (k >= 1) {
            finishTour();
            return false;
          }
          break;
        }
        default:
          return false;
      }
      return true;
    },
    onRelease(): void {
      const was = phase;
      resetAll();
      if (was !== 'idle' && was !== 'dismount') standAtFeedSpot();
      player.launch(new THREE.Vector3(0, 0, 0));
    },
  };

  function finishTour(): void {
    const stars = tourStars(treasure);
    lastTour = { treasure, clouds: cloudsPopped, stars };
    if (stars > 0) getStuntGate(ctx).stunt({ kind: 'sky', value: treasure, stars });
    ctx.events.emit('ui:toast', { icon: 'check', text: `${treasure}` });
    ctx.audio.play('fanfare');
    happy = 1;
  }

  const removeInteract = ctx.interactions.add({
    id: 'sky-dragon',
    position: () => tmp3.set(perch.x, perch.y + 1.2, perch.z),
    radius: 7,
    icon: 'hand',
    enabled: () => phase === 'idle' && pilot.canTake(),
    onUse() {
      if (phase !== 'idle' || !pilot.canTake()) return;
      if (!tickets.pay()) return;
      resetTour();
      if (!pilot.take(hooks)) return;
      enter('feed');
      weak.visible = true;
      both.visible = true;
      hud.showTour(true);
      ctx.audio.play('click');
    },
  });

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') {
      tickets.reset();
      befriended = false;
    }
    if (e.phase === 'title' || e.phase === 'ended') {
      if (pilot.active && phase !== 'idle') pilot.release();
      resetAll();
    }
  });

  const update = (dt: number): void => {
    time += dt;
    happy = Math.max(0, happy - dt * 0.5);
    flapVis = Math.max(0, flapVis - dt * 0.8);
    breathCool = Math.max(0, breathCool - dt);
    const flying = phase === 'launch' || phase === 'tour' || phase === 'return';
    const sitting = phase === 'idle' || phase === 'feed' || phase === 'mount' || phase === 'land' || phase === 'dismount';
    model.update(dt, { flap: flying ? Math.max(flapVis, phase === 'tour' ? 0.25 + 0.4 * clamp(fly.lift / 10, 0, 1) : 0.6) : 0, glide: phase === 'tour' ? 1 - flapVis : 0, wag: Math.max(happy, flying ? 0.4 : 0.2), happy, sitting });
    // Idle: watch the player when they come close.
    if (phase === 'idle') {
      const p = player.position;
      const d = Math.hypot(p.x - perch.x, p.z - perch.z);
      const want = d < 16 ? clamp(angleDelta(perchYaw, Math.atan2(p.x - perch.x, p.z - perch.z)), -0.7, 0.7) : 0;
      model.head.rotation.y += (want - model.head.rotation.y) * follow(3, dt);
    } else {
      model.head.rotation.y += (0 - model.head.rotation.y) * follow(3, dt);
    }
    if (phase === 'idle') return;
    hud.setTour(treasure, cloudsPopped);
    const input = ctx.input.state;
    if (phase === 'tour') {
      hud.setHints(
        [
          { icon: 'wing', key: 'space' },
          { icon: 'bubbles', key: 'skill', cool: breathT <= 0 && breathCool > 0 },
        ],
        input.device === 'gamepad',
        input.device === 'touch',
      );
    } else hud.setHints([], false, false);
    // Bubble breath: a stream of bubbles and sparkles from the mouth.
    if (breathT > 0 && phase === 'tour') {
      breathT -= dt;
      if (breathT <= 0) breathCool = TOUR.breathCooldown;
      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = 0.045;
        model.mouthWorld(mouth);
        flyVelocity(fly, DRAGON_TUNING, vel);
        const fx = Math.sin(fly.yaw) * Math.cos(fly.pitch);
        const fz = Math.cos(fly.yaw) * Math.cos(fly.pitch);
        const j = (k: number) => Math.sin(time * (31 + k) + k) * 2.2;
        bubbles.spawn(mouth.x, mouth.y, mouth.z, vel.x + fx * 18 + j(1), vel.y + Math.sin(fly.pitch) * 18 + j(2) * 0.6, vel.z + fz * 18 + j(3), 1.6, 0.35 + ((time * 7) % 0.4), 0.3);
        if (Math.sin(time * 40) > 0.3) sparks.spawn(mouth.x, mouth.y, mouth.z, vel.x + fx * 14 + j(4), vel.y + j(5), vel.z + fz * 14 + j(6), 0.8, 0.35, 0, CONFETTI_COLORS[Math.floor(time * 13) % CONFETTI_COLORS.length]);
      }
    }
    // Bubbles pop the clouds they touch (golden ones too; the bubble itself flies on, so nothing
    // in the both-eye scene marks where a golden cloud was).
    bubbles.forEachAlive((x, y, z) => {
      for (let i = 0; i < cloudSpots.length; i++) {
        if (cloudGone[i] > 0) continue;
        const c = cloudSpots[i];
        if ((c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2 < TOUR.bubbleHit ** 2) {
          popCloud(i);
          return true;
        }
      }
      for (let i = 0; i < goldSpots.length; i++) {
        if (goldGone[i]) continue;
        const c = goldSpots[i];
        if ((c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2 < TOUR.bubbleHit ** 2) popGolden(i);
      }
      return false;
    });
    bubbles.update(dt);
    sparks.update(dt);
    puffs.update(dt);
    weakSparks.update(dt);
    // Animate the trail and the clouds.
    for (let i = 0; i < treasureSpots.length; i++) {
      if (taken[i]) {
        treasureMesh.setMatrixAt(i, zero);
        continue;
      }
      const p = treasureSpots[i];
      dummy.position.set(p.x, p.y + Math.sin(time * 2 + i) * 0.2, p.z);
      dummy.rotation.set(0, time * 1.5 + i, 0);
      dummy.scale.setScalar(1.5);
      dummy.updateMatrix();
      treasureMesh.setMatrixAt(i, dummy.matrix);
    }
    treasureMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < cloudSpots.length; i++) {
      cloudGone[i] = Math.max(0, cloudGone[i] - dt);
      if (cloudGone[i] > 0) {
        cloudMesh.setMatrixAt(i, zero);
        cloudOutline.setMatrixAt(i, zero);
        continue;
      }
      const c = cloudSpots[i];
      dummy.position.set(c.x, c.y + Math.sin(time * 1.2 + i) * 0.4, c.z);
      dummy.rotation.set(0, i, 0);
      dummy.scale.setScalar(1.2);
      dummy.updateMatrix();
      cloudMesh.setMatrixAt(i, dummy.matrix);
      cloudOutline.setMatrixAt(i, dummy.matrix);
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
    cloudOutline.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < goldSpots.length; i++) {
      if (goldGone[i]) {
        goldMesh.setMatrixAt(i, zero);
        continue;
      }
      const c = goldSpots[i];
      dummy.position.set(c.x, c.y + Math.sin(time * 1.6 + i) * 0.4, c.z);
      dummy.rotation.set(0, time * 0.5 + i, 0);
      dummy.scale.setScalar(1.15);
      dummy.updateMatrix();
      goldMesh.setMatrixAt(i, dummy.matrix);
    }
    goldMesh.instanceMatrix.needsUpdate = true;
  };

  return {
    get phase() {
      return phase;
    },
    get treasure() {
      return treasure;
    },
    get clouds() {
      return cloudsPopped;
    },
    get befriended() {
      return befriended;
    },
    get lastTour() {
      return lastTour;
    },
    get tourSeconds() {
      return tourSeconds;
    },
    set tourSeconds(s: number) {
      tourSeconds = s;
    },
    testPose(x, y, z, yaw) {
      if (phase !== 'tour') return false;
      fly.x = x;
      fly.y = y;
      fly.z = z;
      fly.yaw = yaw;
      fly.pitch = fly.roll = fly.lift = fly.yawRate = 0;
      prevChest.set(x, y + DRAGON_DIMS.seat.y + 0.8, z);
      progress = course.nearest(fly);
      return true;
    },
    treasureSpots,
    weakObjects: [treasureMesh, goldMesh, weakSparks.mesh],
    course,
    update,
    dispose() {
      offPhase();
      removeInteract();
      if (pilot.active && phase !== 'idle') pilot.release();
      model.dispose();
      roost.dispose();
      ctx.vision.remove(weak);
      both.removeFromParent();
      for (const g of [gemGeo, cloudBase, goldGeo, weakSparkGeo, cloudOutlineGeo, bubbleGeo, sparkGeo, puffGeo, treatGeo]) g.dispose();
      for (const m of [gemMat, goldMat, weakSparkMat, cloudMat, outlineMat, bubbleMat, sparkMat, puffMat, treatMat]) m.dispose();
      for (const m of [treasureMesh, goldMesh, cloudMesh, cloudOutline]) m.dispose();
      bubbles.dispose();
      sparks.dispose();
      puffs.dispose();
      weakSparks.dispose();
    },
  };
}
