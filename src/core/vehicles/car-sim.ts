/**
 * Buggy physics: a Rapier dynamic chassis held up by four ray-cast springs, with arcade
 * velocity-level handling on top (drive, grip, bicycle-model yaw), auto-righting, hop,
 * bouncy bumps, water slow-down and a soft island boundary. No meshes here (unit-testable).
 *
 * Chassis frame: +Z forward, +Y up, +X left. Origin = centre of the chassis collider.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from '../../config';
import type { PhysicsApi } from '../../types';
import { GROUP_AVATAR, GROUP_VEHICLE, groups } from '../physics';
import { DRIVE, clamp, driveAccel, gripRate, integrateSpeed, smoothSteer, steerAngle, waterSpeedCap, yawRateFor } from './car-math';

/** Shared dimensions (the model is built around these). */
export const CAR = {
  mass: 520,
  /** Chassis collider: rounded box. */
  half: { x: 0.8, y: 0.26, z: 1.58 },
  border: 0.14,
  colliderZ: 0.04,
  /** Low centre of mass → hard to flip. */
  com: { x: 0, y: -0.34, z: 0.05 },
  wheelX: 0.9,
  wheelFrontZ: 1.2,
  wheelRearZ: -1.1,
  hardY: 0.02,
  wheelRadius: 0.43,
  wheelWidth: 0.36,
  restLength: 0.5,
  maxCompress: 0.36,
  stiffness: 17000,
  damping: 1700,
  restitution: 0.55,
  hopSpeed: 6.2,
  hopCooldown: 0.55,
} as const;

export interface CarControls {
  /** −1..1: forward / brake-reverse. */
  throttle: number;
  /** −1..1: + = steer right (input convention, moveX). */
  steer: number;
  handbrake: boolean;
  /** Edge: hop this frame. */
  hop: boolean;
}

export const NO_CONTROLS: CarControls = { throttle: 0, steer: 0, handbrake: false, hop: false };

export interface CarEnv {
  heightAt(x: number, z: number): number;
  waterLevel: number;
  /** Half the island size (soft boundary pushes back inside). */
  halfSize: number;
  isPaved(x: number, z: number): boolean;
}

export interface WheelState {
  contact: boolean;
  /** Current suspension length (hard point → wheel centre), m. */
  length: number;
  /** Rolling angle (rad). */
  spin: number;
  /** Steer angle (rad, + = left). */
  steer: number;
  /** Chassis-space hard point. */
  readonly local: THREE.Vector3;
  readonly front: boolean;
}

export interface CarStepEvents {
  /** Speed of an unexpected velocity change (hit something), else 0. */
  bump: number;
  /** Downward speed at touch-down after real air time, else 0. */
  landed: number;
  /** Flipped over and was popped back upright. */
  righted: boolean;
  hopped: boolean;
  /** Water depth under the car (≤ 0 when dry). */
  depth: number;
}

export interface CarSim {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly wheels: readonly WheelState[];
  /** Signed forward speed (m/s). */
  readonly forwardSpeed: number;
  /** Smoothed longitudinal / lateral acceleration (m/s²), for body lean. */
  readonly accelLong: number;
  readonly accelLat: number;
  readonly contacts: number;
  /** Top speed for the current surface (road / grass / water). */
  readonly topSpeed: number;
  readonly onRoad: boolean;
  readonly airTime: number;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly velocity: THREE.Vector3;
  /** Heading (yaw of the nose around +Y; facing = (sin yaw, 0, cos yaw)). */
  yaw(): number;
  update(dt: number, controls: CarControls, env: CarEnv): CarStepEvents;
  /** Put the car upright at `pos` (wheels on the ground at pos.y) facing `yaw`, at rest. */
  place(pos: THREE.Vector3Like, yaw: number): void;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = PLAYER.gravity;
/** Fraction of the along-slope gravity cancelled while the wheels are down. */
const SLOPE_ASSIST = 0.75;
/** Suspension length when parked on flat ground. */
export const STATIC_LENGTH = CAR.restLength - (CAR.mass * GRAVITY) / 4 / CAR.stiffness;

/** Height of the chassis origin above the ground when resting on its springs. */
export function restHeight(): number {
  const staticCompress = (CAR.mass * GRAVITY) / 4 / CAR.stiffness;
  return CAR.wheelRadius + CAR.restLength - staticCompress - CAR.hardY;
}

export function createCarSim(physics: PhysicsApi, start: THREE.Vector3, startYaw: number): CarSim {
  const R = physics.rapier;
  const world = physics.world;
  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y + restHeight(), start.z)
      .setRotation(yawQuat(startYaw))
      .setLinearDamping(0.05)
      .setAngularDamping(0.8)
      .setCcdEnabled(true)
      .setAdditionalMassProperties(
        CAR.mass,
        CAR.com,
        // Principal inertia: roll/pitch a bit heavier than a plain box → lazier to tip over.
        { x: CAR.mass * 0.42, y: CAR.mass * 0.55, z: CAR.mass * 0.3 },
        { x: 0, y: 0, z: 0, w: 1 },
      ),
  );
  const collider = world.createCollider(
    R.ColliderDesc.roundCuboid(CAR.half.x, CAR.half.y, CAR.half.z, CAR.border)
      .setTranslation(0, 0, CAR.colliderZ)
      .setDensity(0)
      .setFriction(0.25)
      .setRestitution(CAR.restitution)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setCollisionGroups(groups(GROUP_VEHICLE, 0xffff)),
    body,
  );
  const rayGroups = groups(0xffff, 0xffff & ~GROUP_AVATAR);

  const wheels: WheelState[] = [];
  for (const [x, z, front] of [
    [CAR.wheelX, CAR.wheelFrontZ, true],
    [-CAR.wheelX, CAR.wheelFrontZ, true],
    [CAR.wheelX, CAR.wheelRearZ, false],
    [-CAR.wheelX, CAR.wheelRearZ, false],
  ] as const) {
    wheels.push({ contact: false, length: CAR.restLength, spin: 0, steer: 0, local: new THREE.Vector3(x, CAR.hardY, z), front });
  }

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const velocity = new THREE.Vector3();
  const omega = new THREE.Vector3();
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const hard = new THREE.Vector3();
  const pointVel = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const lastSet = new THREE.Vector3();
  let lastSetValid = false;
  let steer = 0;
  let forwardSpeed = 0;
  let prevForward = 0;
  let accelLong = 0;
  let accelLat = 0;
  let contacts = 0;
  let topSpeed: number = DRIVE.topSpeedRoad;
  let onRoad = true;
  let airTime = 0;
  let hopCooldown = 0;
  let bumpCooldown = 0;
  let flippedFor = 0;

  const readState = (): void => {
    const t = body.translation();
    const r = body.rotation();
    position.set(t.x, t.y, t.z);
    quaternion.set(r.x, r.y, r.z, r.w);
    const v = body.linvel();
    velocity.set(v.x, v.y, v.z);
    const w = body.angvel();
    omega.set(w.x, w.y, w.z);
    up.set(0, 1, 0).applyQuaternion(quaternion);
    fwd.set(0, 0, 1).applyQuaternion(quaternion);
    right.set(-1, 0, 0).applyQuaternion(quaternion);
  };

  function place(pos: THREE.Vector3Like, yaw: number): void {
    body.setTranslation({ x: pos.x, y: pos.y + restHeight() + 0.05, z: pos.z }, true);
    body.setRotation(yawQuat(yaw), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    lastSetValid = false;
    steer = 0;
    forwardSpeed = prevForward = accelLong = accelLat = 0;
    flippedFor = 0;
    airTime = 0;
    for (const w of wheels) w.length = STATIC_LENGTH;
    readState();
  }

  function suspension(dt: number): void {
    contacts = 0;
    const rayLen = CAR.restLength + CAR.wheelRadius;
    const dir = { x: -up.x, y: -up.y, z: -up.z };
    for (const w of wheels) {
      hard.copy(w.local).applyQuaternion(quaternion).add(position);
      const ray = new R.Ray({ x: hard.x, y: hard.y, z: hard.z }, dir);
      const hit = world.castRay(ray, rayLen, true, R.QueryFilterFlags.EXCLUDE_SENSORS, rayGroups, undefined, body);
      const free = CAR.restLength;
      if (!hit) {
        w.contact = false;
        // Wheels droop smoothly when airborne.
        w.length += (free - w.length) * (1 - Math.exp(-14 * dt));
        continue;
      }
      contacts++;
      w.contact = true;
      const len = clamp(hit.timeOfImpact - CAR.wheelRadius, CAR.restLength - CAR.maxCompress, CAR.restLength);
      w.length = len;
      const compression = CAR.restLength - len;
      // Velocity of the hard point along the spring (+ = compressing).
      tmp.subVectors(hard, position);
      pointVel.copy(omega).cross(tmp).add(velocity);
      const compVel = -pointVel.dot(up);
      let force = CAR.stiffness * compression + CAR.damping * compVel;
      // Bump stop: a much stiffer spring in the last 6 cm.
      const stop = compression - (CAR.maxCompress - 0.06);
      if (stop > 0) force += CAR.stiffness * 6 * stop;
      force = clamp(force, 0, CAR.mass * GRAVITY * 3);
      const j = force * dt;
      body.applyImpulseAtPoint({ x: up.x * j, y: up.y * j, z: up.z * j }, { x: hard.x, y: hard.y, z: hard.z }, true);
    }
  }

  function update(dt: number, c: CarControls, env: CarEnv): CarStepEvents {
    const ev: CarStepEvents = { bump: 0, landed: 0, righted: false, hopped: false, depth: 0 };
    if (dt <= 0) return ev;
    readState();
    hopCooldown = Math.max(0, hopCooldown - dt);
    bumpCooldown = Math.max(0, bumpCooldown - dt);

    // Bump: horizontal velocity changed by something other than us (a wall, a prop).
    if (lastSetValid) {
      const dx = velocity.x - lastSet.x;
      const dz = velocity.z - lastSet.z;
      const dv = Math.hypot(dx, dz);
      if (dv > 2.6 && bumpCooldown <= 0) {
        ev.bump = dv;
        bumpCooldown = 0.35;
        // A comic little hop off the bump (and never more than a hop).
        velocity.y = Math.max(velocity.y, Math.min(4.5, 1.6 + dv * 0.22));
      }
    }

    const wasAir = contacts === 0;
    suspension(dt);
    const v2 = body.linvel();
    velocity.set(v2.x, v2.y, v2.z).setY(Math.max(velocity.y, v2.y));
    const w2 = body.angvel();
    omega.set(w2.x, w2.y, w2.z);

    if (contacts === 0) airTime += dt;
    else {
      if (wasAir && airTime > 0.25) ev.landed = Math.max(0, -velocity.y);
      airTime = 0;
    }
    const gf = Math.min(1, contacts / 2);

    // Surface → top speed.
    onRoad = env.isPaved(position.x, position.z);
    const depth = env.waterLevel - env.heightAt(position.x, position.z);
    ev.depth = depth;
    topSpeed = waterSpeedCap(onRoad ? DRIVE.topSpeedRoad : DRIVE.topSpeedOffroad, depth);

    // Steering (smoothed) and drive.
    steer = smoothSteer(steer, clamp(c.steer, -1, 1), dt);
    forwardSpeed = velocity.dot(fwd);
    const angle = steerAngle(-steer, forwardSpeed, DRIVE.topSpeedRoad);
    for (const w of wheels) {
      w.steer = w.front ? angle : 0;
      w.spin += (forwardSpeed / CAR.wheelRadius) * dt;
    }
    if (gf > 0) {
      // Arcade hills: most of gravity's pull along the nose is cancelled (climbs and parks easily).
      velocity.addScaledVector(fwd, GRAVITY * fwd.y * SLOPE_ASSIST * dt * gf);
      forwardSpeed = velocity.dot(fwd);
      const a = driveAccel(forwardSpeed, c.throttle, topSpeed);
      const nextF = integrateSpeed(forwardSpeed, a, dt, c.throttle);
      velocity.addScaledVector(fwd, (nextF - forwardSpeed) * gf);
      // Grip: bleed off sideways sliding.
      const side = velocity.dot(right);
      const grip = gripRate(forwardSpeed, steer, DRIVE.topSpeedRoad, c.handbrake && Math.abs(forwardSpeed) > 4);
      velocity.addScaledVector(right, -side * (1 - Math.exp(-grip * dt)) * gf);
      // Yaw follows the bicycle model.
      let target = yawRateFor(forwardSpeed, angle);
      if (c.handbrake && Math.abs(forwardSpeed) > 4) target *= 1.4;
      const wu = omega.dot(up);
      omega.addScaledVector(up, (target - wu) * (1 - Math.exp(-DRIVE.yawFollow * dt)) * gf);
      // Settle pitch/roll wobble on the ground (springs do the rest).
      tmp.copy(up).multiplyScalar(omega.dot(up));
      const perp = omega.clone().sub(tmp);
      omega.addScaledVector(perp, -(1 - Math.exp(-2.5 * dt)) * gf);
      if (c.hop && hopCooldown <= 0 && contacts >= 2) {
        velocity.y = Math.max(velocity.y, 0) + CAR.hopSpeed;
        omega.addScaledVector(right, 0.6); // nose up a touch
        hopCooldown = CAR.hopCooldown;
        ev.hopped = true;
      }
    }

    // Auto-righting: always lean back towards upright; stronger when tilted far or airborne.
    const tilt = Math.acos(clamp(up.y, -1, 1));
    if (contacts < 4 || tilt > 0.5) {
      tmp.crossVectors(up, UP);
      const sinT = tmp.length();
      if (sinT > 1e-4) {
        tmp.divideScalar(sinT);
        const k = contacts === 0 ? 7 : tilt > 0.6 ? 9 : 3;
        omega.addScaledVector(tmp, tilt * k * dt);
      } else if (up.y < 0) {
        omega.addScaledVector(fwd, 6 * dt); // exactly upside down: roll either way
      }
      if (contacts === 0) {
        // Air: calm the spin so it lands on its wheels.
        const wy = omega.y;
        omega.multiplyScalar(Math.exp(-1.6 * dt));
        omega.y = wy;
      }
    }
    // Flipped / on its side and slow: pop back upright.
    if (up.y < 0.35 && velocity.length() < 3) flippedFor += dt;
    else flippedFor = 0;
    if (flippedFor > 1.1) {
      const ground = env.heightAt(position.x, position.z);
      place(new THREE.Vector3(position.x, Math.max(ground, position.y - 0.4) + 0.6, position.z), headingOf(quaternion));
      ev.righted = true;
      return ev;
    }

    // Water: extra drag (the cap above already slows the engine).
    if (depth > 0.05) {
      const k = 1 - Math.exp(-clamp(depth, 0, 1.5) * 2.5 * dt);
      velocity.x -= velocity.x * k;
      velocity.z -= velocity.z * k;
    }
    // Soft island boundary: a gentle push back towards the middle.
    const edge = Math.max(Math.abs(position.x), Math.abs(position.z)) - (env.halfSize - 30);
    if (edge > 0) {
      tmp.set(-position.x, 0, -position.z).normalize();
      velocity.addScaledVector(tmp, Math.min(12, edge * 1.5) * dt);
    }

    // Smoothed accelerations for the body lean.
    const aL = (forwardSpeed - prevForward) / dt;
    prevForward = forwardSpeed;
    accelLong += (clamp(aL, -30, 30) - accelLong) * (1 - Math.exp(-8 * dt));
    accelLat += (clamp(forwardSpeed * omega.dot(up), -30, 30) - accelLat) * (1 - Math.exp(-8 * dt));

    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    body.setAngvel({ x: omega.x, y: omega.y, z: omega.z }, true);
    lastSet.copy(velocity);
    lastSetValid = true;
    return ev;
  }

  readState();
  return {
    body,
    collider,
    wheels,
    get forwardSpeed() {
      return forwardSpeed;
    },
    get accelLong() {
      return accelLong;
    },
    get accelLat() {
      return accelLat;
    },
    get contacts() {
      return contacts;
    },
    get topSpeed() {
      return topSpeed;
    },
    get onRoad() {
      return onRoad;
    },
    get airTime() {
      return airTime;
    },
    position,
    quaternion,
    velocity,
    yaw: () => headingOf(quaternion),
    update,
    place,
    dispose() {
      world.removeRigidBody(body);
    },
  };
}

function yawQuat(yaw: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

const fwdTmp = new THREE.Vector3();
/** Yaw of the chassis nose projected onto the ground plane. */
export function headingOf(q: THREE.Quaternion): number {
  fwdTmp.set(0, 0, 1).applyQuaternion(q);
  if (Math.abs(fwdTmp.x) + Math.abs(fwdTmp.z) < 1e-4) fwdTmp.set(0, 0, 1);
  return Math.atan2(fwdTmp.x, fwdTmp.z);
}
