/**
 * A rideable horse: a kinematic "fast character" (Rapier character controller, no physics rig)
 * with walk → trot → gallop, smooth turning, a fence-clearing jump, sure footing on slopes,
 * refusing deep water, a soft nudge for anything in the way, and R to put horse and rider back
 * on the last safe spot. Unridden horses idle in the paddock (grazing, ear flicks, tail swish).
 *
 * Plugs into the vehicles manager (./index.ts) like the buggy. The rider's legs and hands are
 * posed by ./rider-pose.ts in `lateUpdate` (after the player's animation).
 */
import * as THREE from 'three';
import type { CameraApi, GameContext, InputState } from '../../types';
import { driveTriggers } from '../input';
import { GROUP_AVATAR, GROUP_VEHICLE, groups } from '../physics';
import { createHorseModel, type HorseAnim } from './horse-model';
import {
  HORSE,
  approachSpeed,
  clamp,
  clipRate,
  gaitFor,
  hoofSound,
  jumpVelocity,
  rearPitch,
  slopeFactor,
  targetSpeed,
  turnRate,
  waterResponse,
  type Gait,
} from './horse-math';
import { horseZones, keepOut } from './keepout';
import { createRiderPose, type RiderPose } from './rider-pose';
import type { VehicleInternal, VehiclePublic } from './types';
import { openYaw, WedgeWatch } from './unstick';

/** Capsule: hooves at y = 0, wide enough for the barrel. */
const RADIUS = 0.5;
const HALF = 0.4;
const CENTRE = RADIUS + HALF;
/** Nose-to-tail hero blocker (horse space): a lying capsule from rump to chest, at belly-to-back height. */
const BLOCK = { half: 0.85, radius: 0.42, y: 1.05, forward: 0.2 } as const;
const REAR_TIME = 1.6;
/** How far ahead of the horse's middle a keep-out zone turns it (m: its nose and a bit). */
const ZONE_REACH = 1.8;
/** Seconds without getting anywhere along a keep-out edge before trying the other way round. */
const ZONE_STUCK = 0.9;

/** Underdamped spring (landing heave). */
class Spring {
  x = 0;
  v = 0;
  constructor(private k: number, private c: number) {}
  step(target: number, dt: number): number {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(): void {
    this.x = this.v = 0;
  }
}

export interface HorseInternal extends VehicleInternal {
  readonly api: HorsePublic;
  /** After the player's animation: pose the rider, measure the seat, draw the reins. */
  lateUpdate(dt: number, riding: boolean): void;
  /** Undo the rider pose before the player's animation update. */
  beforePlayer(): void;
}

export interface HorsePublic extends VehiclePublic {
  readonly kind: 'horse';
  /** The model has loaded (until then the horse is hidden and cannot be mounted). */
  readonly ready: boolean;
  readonly gait: Gait;
  readonly grounded: boolean;
  /** Seconds left of the rear-up emote (0 when not rearing). */
  readonly rearing: number;
}

export interface HorseSpot {
  position: THREE.Vector3;
  yaw: number;
}

export function createHorse(
  ctx: GameContext,
  id: string,
  home: HorseSpot,
  coat: THREE.ColorRepresentation,
  mane: THREE.ColorRepresentation,
  getCamera: () => CameraApi,
  seedBase: number,
): HorseInternal {
  const R = ctx.physics.rapier;
  const world = ctx.physics.world;
  const model = createHorseModel(ctx.scene, coat, mane);
  model.root.visible = false;
  model.root.userData.defaultColor = new THREE.Color(coat).getHex();
  ctx.scene.add(model.root);
  ctx.scene.add(model.blob);

  const collider = world.createCollider(
    R.ColliderDesc.capsule(HALF, RADIUS)
      .setTranslation(home.position.x, home.position.y + CENTRE, home.position.z)
      .setCollisionGroups(groups(GROUP_VEHICLE, 0xffff)),
  );
  const moveGroups = groups(GROUP_VEHICLE, 0xffff & ~GROUP_AVATAR);
  // The upright capsule only covers the barrel: the hero walked into the head and rump (QA5 M6).
  // A nose-to-tail capsule that only the hero's controller feels (filter = avatar), so the horse's
  // own controller and the physics solver ignore it; rays skip it like every vehicle.
  const blocker = world.createCollider(
    R.ColliderDesc.capsule(BLOCK.half, BLOCK.radius).setCollisionGroups(groups(GROUP_VEHICLE, GROUP_AVATAR)),
  );
  const blockQ = new THREE.Quaternion();
  const blockP = new THREE.Vector3();
  const xQuarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const cc = world.createCharacterController(0.03);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
  cc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
  cc.enableAutostep(0.45, 0.25, false);
  cc.enableSnapToGround(0.6);
  cc.setSlideEnabled(true);
  // A soft nudge for balls and props: light "mass", so nothing is shoved hard.
  cc.setApplyImpulsesToDynamicBodies(true);
  cc.setCharacterMass(40);

  const position = new THREE.Vector3().copy(home.position);
  let yaw = home.yaw;
  let speed = 0;
  let vy = 0;
  let grounded = true;
  let airTime = 0;
  let sinceGround = 0;
  let steerSmooth = 0;
  let yawRate = 0;
  let ridden = false;
  /** Rider holding W (or S) into a rim or a wall without getting anywhere (QA7 m5). */
  const wedge = new WedgeWatch();
  /** Unstick hops so far (the vehicles manager shows the reset hint on a new one). */
  let unsticks = 0;
  const unstickEye = new THREE.Vector3();
  const unstickDir = new THREE.Vector3();
  let rearT = -1;
  let mountT = 0;
  let pitch = 0;
  let roll = 0;
  let deepFor = 0;
  let bumpCooldown = 0;
  /** Keep-out zones (the Foam Lava course: keepout.ts) and the whinny's cooldown there (s). */
  const zones = horseZones();
  let zoneCooldown = 0;
  /** Way along the zone edge being followed (0 = none yet), and seconds since the last contact. */
  let zoneSide = 0;
  let zoneAway = 0;
  /** Edge-follow flips since the last clear stretch (both ways blocked: hop out instead). */
  let zoneFlips = 0;
  /** Seconds the horse has stayed within 0.8 m of (zoneX, zoneZ) while following an edge. */
  let zoneStill = 0;
  let zoneX = 0;
  let zoneZ = 0;
  let gait: Gait = 'idle';
  let time = seedBase * 3.7;
  let idleTimer = 4 + seedBase * 2.3;
  let earTimer = 1.5 + seedBase;
  let earT = -1;
  let earSide = 1;
  let greetCooldown = 0;
  let soundOn = false;
  let seed = 1 + Math.floor(seedBase * 1000);
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const heave = new Spring(160, 10);
  const safe = { pos: home.position.clone(), yaw: home.yaw };
  let safeTimer = 0;

  const seat = new THREE.Object3D();
  seat.name = `${id}-seat`;
  const prompt = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const saddle = new THREE.Vector3();
  const bodyQ = new THREE.Quaternion();
  const desired = { x: 0, y: 0, z: 0 };
  const lift = { x: 0, y: 0, z: 0 };
  let blockedFor = 0;
  /** Turning back from deep water: −1 / +1 while turning, 0 otherwise. */
  let turnBackDir = 0;
  let rider: RiderPose | null = null;
  let riderLean = 0;
  const leanQ = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const seatLocal = new THREE.Vector3(0, 0.55, 0);
  let seatLocalValid = false;

  const syncCollider = (): void => {
    collider.setTranslation({ x: position.x, y: position.y + CENTRE, z: position.z });
    blockQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).multiply(xQuarter);
    blockP.set(Math.sin(yaw) * BLOCK.forward, BLOCK.y, Math.cos(yaw) * BLOCK.forward).add(position);
    blocker.setTranslation(blockP);
    blocker.setRotation(blockQ);
  };

  const groundAt = (x: number, z: number, fromY: number): number => {
    const hit = ctx.physics.raycast(tmp.set(x, fromY, z), tmp2.set(0, -1, 0), 80);
    return hit ? hit.point.y : ctx.world.heightAt(x, z);
  };

  const placeAt = (p: THREE.Vector3Like, y: number): void => {
    position.set(p.x, groundAt(p.x, p.z, p.y + 4) + 0.02, p.z);
    yaw = y;
    speed = 0;
    vy = 0;
    grounded = true;
    airTime = 0;
    pitch = roll = 0;
    rearT = -1;
    deepFor = 0;
    heave.reset();
    syncCollider();
    syncModel(0);
  };

  /** Hop back from what the horse pushes against (`dir` 1 = forward) and face the most open way. */
  function unstick(dir: number): void {
    const blocked = dir > 0 ? yaw : yaw + Math.PI;
    unstickEye.set(position.x, position.y + 0.9, position.z);
    unstickDir.set(-Math.sin(blocked), 0, -Math.cos(blocked));
    const room = ctx.physics.raycast(unstickEye, unstickDir, 4)?.distance ?? 4;
    const back = Math.max(0, Math.min(1.8, room - 1.3));
    const bx = position.x + unstickDir.x * back;
    const bz = position.z + unstickDir.z * back;
    unstickEye.set(bx, position.y + 0.9, bz);
    const to = openYaw(yaw, blocked, (y) => ctx.physics.raycast(unstickEye, unstickDir.set(Math.sin(y), 0, Math.cos(y)), 30)?.distance ?? 30);
    placeAt({ x: bx, y: position.y, z: bz }, to);
    // A comic little hop round to the new heading.
    vy = jumpVelocity() * 0.7;
    grounded = false;
    sinceGround = 1;
    heave.v -= 0.6;
    model.play('jump', 1.1, true);
    ctx.audio.play('neigh', { pitch: 1.1 });
    unsticks++;
  }

  function syncModel(dt: number): void {
    model.root.position.copy(position);
    model.root.rotation.set(0, yaw, 0);
    const rear = rearT >= 0 ? rearPitch(rearT, REAR_TIME) : 0;
    model.body.rotation.set(-(pitch + rear), 0, roll, 'YXZ');
    model.body.position.y = heave.step(0, dt);
    // Contact shadow.
    const gy = ctx.world.heightAt(position.x, position.z);
    const above = position.y - gy;
    model.blob.position.set(position.x, Math.max(gy, ctx.world.waterLevel) + 0.05, position.z);
    model.blob.rotation.y = yaw;
    (model.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * clamp(1 - above / 4, 0, 1);
  }

  const api: HorsePublic = {
    kind: 'horse',
    id,
    object: model.root,
    position,
    get unsticks() {
      return unsticks;
    },
    get speed() {
      return Math.abs(speed);
    },
    get ready() {
      return model.ready;
    },
    get gait() {
      return gait;
    },
    get grounded() {
      return grounded;
    },
    get rearing() {
      return rearT >= 0 ? Math.max(0, REAR_TIME - rearT) : 0;
    },
    setColor(c) {
      model.setCoat(c);
    },
    teleport(p, y) {
      placeAt(p, y);
    },
  };

  function startRear(): void {
    if (rearT >= 0 || !grounded) return;
    rearT = 0;
    ctx.audio.play('neigh', { pitch: 0.95 + rnd() * 0.15 });
  }

  /** Probe the ground ahead/behind for slope and water. */
  function terrainAhead(): { rise: number; depthAhead: number; depthHere: number; landSide: number } {
    fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    const hHere = ctx.world.heightAt(position.x, position.z);
    const ax = position.x + fwd.x * 2.4;
    const az = position.z + fwd.z * 2.4;
    const hAhead = ctx.world.heightAt(ax, az);
    const wl = ctx.world.waterLevel;
    // Which side is drier? Probe 3 m out at ±50°.
    const probe = (a: number): number => ctx.world.heightAt(position.x + Math.sin(yaw + a) * 4, position.z + Math.cos(yaw + a) * 4);
    const landSide = Math.sign(probe(1.3) - probe(-1.3)) || 1;
    return { rise: hAhead - hHere, depthAhead: wl - hAhead, depthHere: wl - hHere, landSide };
  }

  function update(dt: number, input: Readonly<InputState> | null): void {
    time += dt;
    const ready = model.ready;
    model.root.visible = ready;
    model.blob.visible = ready;
    bumpCooldown = Math.max(0, bumpCooldown - dt);
    greetCooldown = Math.max(0, greetCooldown - dt);

    // ── Controls
    let throttle = 0;
    let steer = 0;
    let sprint = false;
    if (input) {
      mountT += dt;
      // Gamepad: the triggers ride like the buggy's pedals (RT also counts as Shift → gallop).
      const trig = driveTriggers(ctx.input);
      throttle = clamp(input.moveY + trig.accelerate - trig.brake, -1, 1);
      steer = input.moveX;
      sprint = input.sprint;
      if (input.flopPressed) ctx.audio.play('neigh', { pitch: 0.9 + rnd() * 0.25 });
      if (input.emotePressed) startRear();
      if (mountT > 0.45 && mountT - dt <= 0.45) startRear(); // friendly whinny + rear on mount
      if (input.jumpPressed && sinceGround < 0.12 && rearT < 0 && vy <= 0.1) {
        vy = jumpVelocity();
        grounded = false;
        sinceGround = 1;
        heave.v -= 0.6;
        model.play('jump', clamp(1.46 / 1.25, 0.9, 1.4), true);
        ctx.audio.play('jump', { pitch: 0.7 });
      }
    }
    if (rearT >= 0) {
      rearT += dt;
      throttle = 0;
      if (rearT >= REAR_TIME) {
        rearT = -1;
        heave.v -= 0.8;
        ctx.audio.play('land', { volume: 0.5 });
      }
    }

    // ── Terrain and water
    const t = terrainAhead();
    let target = targetSpeed(throttle, sprint);
    if (target > 0) target *= slopeFactor(t.rise, 2.4);
    // Water: wading slows the horse; deep water ahead and it refuses, turning back to the shore
    // (one turn direction, kept until it is out, so it never dithers).
    const water = waterResponse(Math.max(t.depthAhead, t.depthHere * 0.8));
    if (target > 0) target *= water.factor;
    const wading = t.depthHere > HORSE.wadeDepth * 2 && t.depthAhead > t.depthHere - 0.05; // in, and not heading out
    if (water.turnBack || t.depthAhead >= HORSE.refuseDepth * 0.7 || (wading && throttle >= 0)) {
      if (turnBackDir === 0) turnBackDir = t.landSide;
      steer = -turnBackDir;
      if (target > 0) target = Math.min(target, t.depthAhead > HORSE.refuseDepth ? 0 : 1.6);
    } else if (t.depthAhead < HORSE.wadeDepth) turnBackDir = 0;
    speed = approachSpeed(speed, target, dt);
    if (rearT >= 0) speed = approachSpeed(speed, 0, dt * 2);

    // ── Turning: smooth, slower at a gallop; airborne turns are gentle.
    steerSmooth += (steer - steerSmooth) * Math.min(1, HORSE.turnResponse * dt);
    yawRate = -steerSmooth * turnRate(speed) * (grounded ? 1 : 0.35);
    yaw += yawRate * dt;

    // ── Move (kinematic character controller)
    fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    if (!grounded) vy -= HORSE.gravity * dt;
    else vy = Math.min(vy, -1); // keep a little downward push so snap-to-ground holds on slopes
    desired.x = fwd.x * speed * dt;
    desired.z = fwd.z * speed * dt;
    desired.y = vy * dt;
    // The Foam Lava course (QA8 m11): turned away along its edge with a whinny, never in.
    zoneCooldown = Math.max(0, zoneCooldown - dt);
    zoneAway += dt;
    if (zoneAway > 1) {
      zoneSide = 0;
      zoneFlips = 0;
    }
    // Following an edge but going nowhere (a house at the corner): go round the other way; stuck
    // both ways (a squeeze between the course and the village): hop out of it at once.
    if (zoneSide !== 0 && zoneAway < 0.3 && throttle > 0.5) {
      if (Math.hypot(position.x - zoneX, position.z - zoneZ) > 0.8) {
        zoneX = position.x;
        zoneZ = position.z;
        zoneStill = 0;
      } else if ((zoneStill += dt) > ZONE_STUCK) {
        zoneStill = 0;
        if (++zoneFlips >= 2) {
          zoneFlips = 0;
          zoneSide = 0;
          wedge.reset();
          unstick(1);
        } else zoneSide = -zoneSide;
      }
    } else zoneStill = 0;
    if (ridden && speed > 0.3) {
      const ko = keepOut(zones, position.x, position.z, yaw, desired.x, desired.z, ZONE_REACH, zoneSide);
      if (ko.yaw !== null) {
        zoneSide = ko.side;
        zoneAway = 0;
        desired.x = ko.mx;
        desired.z = ko.mz;
        const d = Math.atan2(Math.sin(ko.yaw - yaw), Math.cos(ko.yaw - yaw));
        yaw += d * Math.min(1, dt * 6);
        fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
        if (zoneCooldown === 0) {
          zoneCooldown = 2.5;
          ctx.audio.play('neigh', { pitch: 1.15 });
          ctx.audio.play('boing', { volume: 0.5 });
          heave.v += 0.5;
        }
      }
    }
    syncCollider();
    if (vy > 0) cc.disableSnapToGround();
    else cc.enableSnapToGround(0.6);
    cc.computeColliderMovement(collider, desired, R.QueryFilterFlags.EXCLUDE_SENSORS, moveGroups);
    let mv = cc.computedMovement();
    let mvx = mv.x;
    let mvy = mv.y;
    let mvz = mv.z;
    let groundedNow = cc.computedGrounded();
    // Heightfield seams can snag the capsule for a frame: retry with a small lift (snap brings
    // the hooves back down next frame).
    const wantH = Math.hypot(desired.x, desired.z);
    if (wantH > 1e-4 && Math.hypot(mvx, mvz) < wantH * 0.6) {
      lift.x = desired.x;
      lift.z = desired.z;
      lift.y = Math.max(desired.y, 0) + 0.08;
      cc.computeColliderMovement(collider, lift, R.QueryFilterFlags.EXCLUDE_SENSORS, moveGroups);
      mv = cc.computedMovement();
      if (Math.hypot(mv.x, mv.z) > Math.hypot(mvx, mvz) + 1e-4) {
        mvx = mv.x;
        mvy = mv.y;
        mvz = mv.z;
        groundedNow = groundedNow || vy <= 0;
      }
    }
    const wasGrounded = grounded;
    const fallSpeed = -vy;
    position.x += mvx;
    position.y += mvy;
    position.z += mvz;
    grounded = groundedNow && vy <= 0.5;
    if (grounded) {
      sinceGround = 0;
      if (!wasGrounded && airTime > 0.25) {
        heave.v -= clamp(fallSpeed * 0.12, 0.3, 1.6);
        ctx.audio.play('land', { volume: clamp(fallSpeed / 12, 0.2, 0.9), pitch: 0.8 });
        if (ridden) getCamera().shake(clamp(fallSpeed / 40, 0.05, 0.3));
        ctx.events.emit('player:land', { speed: fallSpeed });
      }
      airTime = 0;
      if (vy < -1) vy = -1;
    } else {
      sinceGround += dt;
      airTime += dt;
      if (mvy < desired.y - 1e-4 && vy > 0) vy = 0; // bonked a ceiling
    }
    // Blocked (for real, a few frames running): lose speed softly (never a crash), a little bump.
    if (dt > 0 && Math.abs(speed) > 0.5) {
      const actual = (mvx * fwd.x + mvz * fwd.z) / dt;
      blockedFor = Math.abs(actual) < Math.abs(speed) * 0.55 ? blockedFor + dt : 0;
      if (blockedFor > 0.05) {
        const hit = Math.abs(speed) - Math.abs(actual);
        if (hit > 3.5 && bumpCooldown === 0 && ridden) {
          bumpCooldown = 0.6;
          ctx.events.emit('vehicle:bump', { speed: hit });
          ctx.audio.play('bump', { volume: clamp(hit / 12, 0.2, 0.7) });
          getCamera().shake(clamp(hit / 30, 0.05, 0.25));
          heave.v += 0.4;
        }
        speed = actual * 0.6 + speed * 0.4 * (Math.abs(actual) < 0.3 ? 0.3 : 1);
      }
    } else blockedFor = 0;
    syncCollider();
    if (wedge.update(dt, ridden && rearT < 0 ? throttle : 0, position.x, position.z)) unstick(throttle >= 0 ? 1 : -1);

    // ── Deep water / lost: splash and back to the last safe spot.
    if (t.depthHere > HORSE.refuseDepth + 0.35) deepFor += dt;
    else deepFor = 0;
    if (deepFor > 1 || position.y < ctx.world.waterLevel - 8 || position.y < -30) {
      ctx.audio.play('splash');
      placeAt(safe.pos, safe.yaw);
    }

    // ── Safe spot: on dry land, grounded, not on a steep slope.
    safeTimer += dt;
    if (safeTimer > 0.5 && grounded && t.depthHere < -0.2 && ctx.world.isLand(position.x, position.z) && Math.abs(t.rise) < 1.6) {
      safeTimer = 0;
      safe.pos.copy(position);
      safe.yaw = yaw;
    }

    // ── Body attitude: pitch with the slope / jump arc, lean into turns.
    const slopePitch = Math.atan2(ctx.world.heightAt(position.x + fwd.x * 1.1, position.z + fwd.z * 1.1) - ctx.world.heightAt(position.x - fwd.x * 1.1, position.z - fwd.z * 1.1), 2.2);
    const wantPitch = grounded ? clamp(slopePitch, -0.4, 0.4) : clamp(vy * 0.035, -0.3, 0.3);
    pitch += (wantPitch - pitch) * Math.min(1, dt * 8);
    const wantRoll = clamp(yawRate * Math.abs(speed) * 0.018, -0.16, 0.16);
    roll += (wantRoll - roll) * Math.min(1, dt * 5);

    // ── Animation
    gait = grounded || airTime < 0.12 ? gaitFor(speed) : gait;
    let anim: HorseAnim = gait;
    let rate = clipRate(gait, speed) * (speed < -0.1 ? -1 : 1);
    if (!grounded && airTime > 0.12) {
      anim = 'jump';
      rate = 1.15;
    } else if (rearT >= 0) {
      anim = 'idle';
      rate = 1;
    }
    model.play(anim, rate);

    // ── Idle life: variations, ear flicks, a friendly hello when the player walks up.
    if (!ridden && gait === 'idle') {
      idleTimer -= dt;
      if (idleTimer <= 0) {
        idleTimer = 5 + rnd() * 6;
        model.idleVariation(1 + Math.floor(rnd() * 3));
      }
      const pd = ctx.player.position.distanceTo(position);
      if (pd < 5 && greetCooldown === 0 && ctx.player.mode === 'walk' && ctx.session.state.phase === 'playing') {
        greetCooldown = 25;
        ctx.audio.play('neigh', { volume: 0.45, pitch: 1.1 });
        earT = 0;
      }
    }
    earTimer -= dt;
    if (earTimer <= 0) {
      earTimer = 2 + rnd() * 4;
      earT = 0;
      earSide = rnd() < 0.5 ? 1 : -1;
    }
    let earFlick = 0;
    if (earT >= 0) {
      earT += dt;
      earFlick = earSide * Math.sin(Math.min(1, earT / 0.35) * Math.PI);
      if (earT > 0.35) earT = -1;
    }

    syncModel(dt);
    const rear = rearT >= 0 ? clamp(rearPitch(rearT, REAR_TIME) / 0.62, 0, 1) : 0;
    model.update(dt, { turn: clamp(steerSmooth * Math.min(1, Math.abs(speed) / 4), -1, 1), rear, time, earFlick });

    // ── Seat for the rider: the seat bones go on the saddle, leaning with the horse's body.
    model.saddle(saddle);
    model.body.getWorldQuaternion(bodyQ);
    seat.quaternion.copy(bodyQ);
    if (rider && riderLean !== 0) seat.quaternion.multiply(leanQ.setFromAxisAngle(xAxis, -riderLean));
    seat.position.copy(seatLocal).applyQuaternion(seat.quaternion).negate().add(saddle);
    seat.updateMatrixWorld(true);

    // ── Hooves
    if (ridden) {
      const s = grounded ? hoofSound(gait, speed) : { intensity: 0, pitch: 1 };
      ctx.audio.setLoop('gallop', s.intensity, s.pitch);
      soundOn = true;
    } else if (soundOn) {
      ctx.audio.setLoop('gallop', 0);
      soundOn = false;
    }
  }

  function exitSpot(): { position: THREE.Vector3; yaw: number } {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const from = new THREE.Vector3(position.x, position.y + 0.9, position.z);
    // Left, right, behind-left, behind-right, front: never under the hooves.
    const candidates: [number, number][] = [[1.5, -0.1], [-1.5, -0.1], [1.4, -1.4], [-1.4, -1.4], [0, 2.6], [0, -2.8]];
    for (const [x, z] of candidates) {
      const off = new THREE.Vector3(x, 0, z).applyQuaternion(q);
      const target = from.clone().add(off);
      if (ctx.physics.raycast(from, off.clone().normalize(), off.length() + 0.4)) continue;
      const hit = ctx.physics.raycast(new THREE.Vector3(target.x, target.y + 2, target.z), new THREE.Vector3(0, -1, 0), 6);
      if (!hit || hit.normal.y < 0.6) continue;
      if (hit.point.y < ctx.world.waterLevel - 0.3) continue;
      return { position: hit.point.clone().setY(hit.point.y + 0.02), yaw };
    }
    return { position: new THREE.Vector3(position.x, position.y + 2.0, position.z), yaw };
  }

  placeAt(home.position, home.yaw);

  return {
    api,
    mode: 'riding',
    icon: 'horse',
    rescueKeepsRider: true,
    seat,
    seatAnim: 'sit',
    chase: {
      heading: () => yaw,
      speed: () => speed,
      topSpeed: HORSE.gallopSpeed,
      yawRate: () => yawRate,
      distance: 4.3,
      height: 2.2,
    },
    promptPosition: () => prompt.copy(position).setY(position.y + 2.0),
    update,
    beforePlayer() {
      rider?.restore();
    },
    lateUpdate(_dt, riding) {
      if (!riding) {
        model.setReins(null);
        return;
      }
      rider ??= createRiderPose(ctx.player.object);
      // Blend the riding pose in once the hop into the saddle has landed.
      const w = clamp((mountT - 0.28) / 0.22, 0, 1);
      model.body.getWorldQuaternion(bodyQ);
      const ok = rider.apply(w, bodyQ);
      riderLean = rider.lean * w;
      if (ok) {
        if (!seatLocalValid) seatLocal.copy(rider.seatLocal);
        else seatLocal.lerp(rider.seatLocal, 0.25);
        seatLocalValid = true;
      }
      model.setReins(ok && rider.hasHands && w > 0.5 ? rider.hands : null);
    },
    onEnter() {
      ridden = true;
      wedge.reset();
      blocker.setEnabled(false);
      mountT = 0;
      seatLocalValid = false;
      idleTimer = 0;
      model.play('idle', 1, true);
    },
    onExit() {
      ridden = false;
      blocker.setEnabled(true);
      rearT = -1;
      model.setReins(null);
      rider?.restore();
    },
    exitSpot,
    rescue() {
      placeAt(safe.pos, safe.yaw);
      ctx.audio.play('neigh', { volume: 0.7 });
    },
    park() {
      safe.pos.copy(home.position);
      safe.yaw = home.yaw;
      placeAt(home.position, home.yaw);
    },
    setParking(x, z, y) {
      home.position.set(x, ctx.world.heightAt(x, z), z);
      home.yaw = y;
    },
    parking: () => ({ x: home.position.x, z: home.position.z, yaw: home.yaw }),
    footprint: { hw: 0.55, hl: 1.25 },
    dispose() {
      if (soundOn) ctx.audio.setLoop('gallop', 0);
      world.removeCharacterController(cc);
      world.removeCollider(collider, false);
      world.removeCollider(blocker, false);
      model.dispose();
    },
  };

}
