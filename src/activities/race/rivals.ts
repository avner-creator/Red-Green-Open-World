/**
 * The friends' buggies: the same procedural buggy model as the player's (other paint), driven
 * kinematically along the lap by `ai.ts`, with a kinematic Rapier body so bumping them is a real,
 * bouncy push (and they hop and wiggle comically). Each driver is another hero from the catalog
 * (lazily loaded, cached between races). Only exist during a race.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CHARACTERS, type CharacterDef } from '../../core/characters/catalog';
import { loadCharacter, type LoadedCharacter } from '../../core/characters/load';
import { GROUP_VEHICLE, groups } from '../../core/physics';
import { createCarModel, type CarModel } from '../../core/vehicles/car-model';
import { CAR, STATIC_LENGTH, restHeight } from '../../core/vehicles/car-sim';
import type { GameContext } from '../../types';
import { newRival, type RivalState, type RivalTuning } from './ai';
import { leftOf, type Track } from './track';

export interface RivalCar {
  readonly state: RivalState;
  readonly tuning: RivalTuning;
  readonly model: CarModel;
  readonly position: THREE.Vector3;
  readonly characterId: string;
  driver: LoadedCharacter | null;
  /** Comic hop after a bump (seconds left). */
  hop: number;
  readonly body: RAPIER.RigidBody;
  dispose(): void;
}

const driverCache = new Map<string, Promise<LoadedCharacter | null>>();

/** Two friends who are not the player's current hero (stable order). */
export function pickFriends(playerId: string, count = 2): CharacterDef[] {
  const order = ['frog', 'panda', 'bee', 'flamingo', 'rex', 'robot'];
  const list = order.map((id) => CHARACTERS.find((c) => c.id === id)).filter((c): c is CharacterDef => !!c && c.id !== playerId);
  return list.slice(0, count);
}

function loadDriver(def: CharacterDef): Promise<LoadedCharacter | null> {
  let p = driverCache.get(def.id);
  if (!p) {
    p = loadCharacter(def).catch(() => null);
    driverCache.set(def.id, p);
  }
  return p;
}

export function createRivalCar(ctx: GameContext, track: Track, tuning: RivalTuning & { paint: number }, startProgress: number, lateral: number, friend: CharacterDef): RivalCar {
  const model = createCarModel();
  model.setColor(tuning.paint);
  model.root.userData.defaultColor = tuning.paint;
  ctx.scene.add(model.root, model.blob);
  const state = newRival(startProgress, lateral);
  const R = ctx.physics.rapier;
  const world = ctx.physics.world;
  const body: RAPIER.RigidBody = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
  world.createCollider(
    R.ColliderDesc.roundCuboid(CAR.half.x, CAR.half.y, CAR.half.z, CAR.border).setTranslation(0, 0, CAR.colliderZ).setRestitution(0.7).setFriction(0.2).setCollisionGroups(groups(GROUP_VEHICLE, 0xffff)),
    body,
  );
  const position = new THREE.Vector3();
  const car: RivalCar = {
    state,
    tuning,
    model,
    position,
    characterId: friend.id,
    driver: null,
    hop: 0,
    body,
    dispose() {
      if (car.driver) car.driver.object.removeFromParent();
      model.root.removeFromParent();
      model.blob.removeFromParent();
      model.dispose();
      world.removeRigidBody(body);
    },
  };
  void loadDriver(friend).then((d) => {
    if (!d || !model.root.parent) return;
    // A cached driver may still sit in a car from the last race: move it.
    d.object.removeFromParent();
    d.object.position.set(0, 0, 0);
    d.object.rotation.set(0, 0, 0);
    model.seat.add(d.object);
    d.play('sit', 1, 0);
    car.driver = d;
  });
  placeRival(car, track, ctx, 0, true);
  return car;
}

const wheels = [0, 1, 2, 3].map((i) => ({ length: STATIC_LENGTH, spin: 0, steer: 0, front: i < 2 }));
const q = new THREE.Quaternion();
const e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Pose a rival from its state (position on the lap, lane, slope, wobble, hop). */
export function placeRival(car: RivalCar, track: Track, ctx: GameContext, dt: number, teleport = false): void {
  const st = car.state;
  const p = track.at(st.progress);
  const l = leftOf(p.dx, p.dz);
  const x = p.x + l.x * st.lateral;
  const z = p.z + l.z * st.lateral;
  const h = ctx.world.heightAt.bind(ctx.world);
  const ground = h(x, z);
  const hf = h(x + p.dx * 1.2, z + p.dz * 1.2);
  const hb = h(x - p.dx * 1.2, z - p.dz * 1.2);
  const hl = h(x + l.x * 0.9, z + l.z * 0.9);
  const hr = h(x - l.x * 0.9, z - l.z * 0.9);
  car.hop = Math.max(0, car.hop - dt);
  const hopY = car.hop > 0 ? Math.sin((1 - car.hop / 0.7) * Math.PI) * 0.7 : 0;
  const wob = st.oops > 0 ? Math.sin(st.oops * 18) * 0.45 * Math.min(1, st.oops) : 0;
  const wig = car.hop > 0 ? Math.sin(car.hop * 30) * 0.15 : 0;
  const yaw = Math.atan2(p.dx, p.dz) + wob + wig;
  e.set(Math.atan2(hb - hf, 2.4), yaw, Math.atan2(hl - hr, 1.8));
  q.setFromEuler(e);
  car.position.set(x, ground + restHeight() + 0.06 + hopY, z);
  car.model.root.position.copy(car.position);
  car.model.root.quaternion.copy(q);
  car.model.blob.position.set(x, Math.max(ground, ctx.world.waterLevel) + 0.06, z);
  car.model.blob.rotation.y = yaw;
  // Wheels: spin with the speed; front wheels steer into the curve.
  for (const w of wheels) {
    w.spin += (st.speed / CAR.wheelRadius) * dt;
    w.steer = w.front ? Math.max(-0.5, Math.min(0.5, p.k * 2.3)) + wob * 0.5 : 0;
  }
  car.model.update(wheels, 0, wig * 0.5, hopY * 0.1);
  const camDist = ctx.camera.position.distanceTo(car.position);
  car.model.setDetail(camDist < 30);
  if (teleport) {
    car.body.setTranslation(car.position, true);
    car.body.setRotation(q, true);
  } else {
    car.body.setNextKinematicTranslation(car.position);
    car.body.setNextKinematicRotation(q);
  }
  car.driver?.update(dt);
}
