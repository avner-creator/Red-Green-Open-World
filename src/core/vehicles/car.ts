/**
 * The buggy as a game object: physics sim + model + input mapping + juice (body lean, bounce,
 * camera shake, engine loop, horn) + rescues (deep water, R, flipped) + parking at the garage.
 */
import * as THREE from 'three';
import type { CameraApi, GameContext, InputState } from '../../types';
import { driveTriggers } from '../input';
import { fixedStepHooks } from '../physics';
import { clamp, DRIVE, engineSound } from './car-math';
import { createCarModel } from './car-model';
import { CAR, NO_CONTROLS, createCarSim, headingOf, restHeight, type CarControls, type CarEnv } from './car-sim';
import { createDust } from './dust';
import { isPaved, nearestRoad } from './surface';
import type { VehicleInternal } from './types';

/** Underdamped spring (body lean / heave): springy, a little wobble. */
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

export function createCar(ctx: GameContext, id: string, getCamera: () => CameraApi): VehicleInternal {
  const anchor = ctx.world.anchors.garage;
  const sim = createCarSim(ctx.physics, anchor.position, anchor.yaw);
  const model = createCarModel();
  ctx.scene.add(model.root);
  ctx.scene.add(model.blob);
  const dust = createDust();
  ctx.scene.add(dust.mesh);
  /** Detail level: the lighter geometry set beyond LOD_FAR m (back within LOD_NEAR), unless driven. */
  const LOD_FAR = 34;
  const LOD_NEAR = 30;
  let far = false;
  let dustAcc = 0;
  let seed = 1;
  /** Deterministic jitter (test mode stays reproducible). */
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const wheelWorld = new THREE.Vector3();
  const dustVel = new THREE.Vector3();
  const side = new THREE.Vector3();

  /** Puffs from the rear tyres: off-road speed, power-slides and landings. */
  function kickDust(dt: number, landed: number): void {
    side.set(-1, 0, 0).applyQuaternion(sim.quaternion);
    const slip = Math.abs(sim.velocity.dot(side));
    const speed = Math.abs(sim.forwardSpeed);
    let rate = 0;
    if (!sim.onRoad && speed > 3) rate += speed * 1.1;
    if (slip > 2) rate += slip * 5;
    if (Math.abs(controls.throttle) > 0.5 && speed < 5 && driven) rate += 6;
    let burst = landed > 3 ? 6 : 0;
    dustAcc += rate * dt;
    while (dustAcc >= 1 || burst > 0) {
      if (burst > 0) burst--;
      else dustAcc -= 1;
      const w = sim.wheels[2 + (seed & 1)];
      if (!w.contact) continue;
      wheelWorld.set(w.local.x, w.local.y - w.length - CAR.wheelRadius * 0.7, w.local.z).applyQuaternion(sim.quaternion).add(sim.position);
      dustVel.copy(sim.velocity).multiplyScalar(0.25).add(tmp.set(rnd() * 1.6, 0.8 + rnd(), rnd() * 1.6));
      dust.emit(wheelWorld, dustVel, 0.8 + rnd() * 0.35 + Math.min(0.6, slip * 0.06));
    }
    dust.update(dt);
  }

  const env: CarEnv = {
    heightAt: (x, z) => ctx.world.heightAt(x, z),
    waterLevel: ctx.world.waterLevel,
    halfSize: ctx.world.size / 2,
    isPaved,
  };
  const pitch = new Spring(110, 11);
  const roll = new Spring(110, 11);
  const heave = new Spring(190, 9);
  const position = new THREE.Vector3();
  const prompt = new THREE.Vector3();
  const safe = { pos: anchor.position.clone(), yaw: anchor.yaw };
  let safeTimer = 0;
  let deepFor = 0;
  let driven = false;
  let engineOn = false;
  const controls: CarControls = { ...NO_CONTROLS };
  const up = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const hooks = fixedStepHooks(ctx.physics);
  /** Render pose (interpolated between physics steps): the model, rider, camera and prompt use it. */
  const sync = (): void => {
    sim.interpolate(hooks.alpha);
    model.root.position.copy(sim.visualPosition);
    model.root.quaternion.copy(sim.visualQuaternion);
    position.copy(sim.visualPosition);
  };

  const groundAt = (x: number, z: number, fromY: number): number => {
    const hit = ctx.physics.raycast(tmp.set(x, fromY, z), new THREE.Vector3(0, -1, 0), 60);
    return hit ? hit.point.y : ctx.world.heightAt(x, z);
  };

  const placeAt = (p: THREE.Vector3Like, yaw: number): void => {
    sim.place(p, yaw);
    pitch.reset();
    roll.reset();
    heave.reset();
    deepFor = 0;
    sync();
    model.update(sim.visualWheels, 0, 0, 0);
  };

  const api: VehicleInternal['api'] = {
    kind: 'car',
    id,
    object: model.root,
    position,
    get speed() {
      return Math.abs(sim.forwardSpeed);
    },
    setColor(c) {
      model.setColor(c);
    },
    teleport(p, yaw) {
      placeAt(p, yaw);
    },
  };

  function readControls(input: Readonly<InputState>): void {
    const trig = driveTriggers(ctx.input);
    controls.throttle = clamp(input.moveY + trig.accelerate - trig.brake, -1, 1);
    controls.steer = input.moveX;
    controls.handbrake = input.jump;
    // Latched until a physics step uses it (a frame can run zero steps at high refresh rates).
    controls.hop = controls.hop || input.jumpPressed;
    if (input.flopPressed) ctx.audio.play('horn');
  }

  /** Landing thud carried from the fixed steps to this frame's dust. */
  let landedThisFrame = 0;

  /** One fixed physics step of handling + its game events (runs inside `physics.step`). */
  function fixedStep(dt: number): void {
    const ev = sim.update(dt, controls, env);
    controls.hop = false;
    landedThisFrame = Math.max(landedThisFrame, ev.landed);
    const cam = getCamera();

    if (ev.bump > 0) {
      ctx.events.emit('vehicle:bump', { speed: ev.bump });
      if (driven) cam.shake(Math.min(0.55, 0.12 + ev.bump / 20));
      heave.v += Math.min(1.6, ev.bump * 0.12);
      roll.v += (Math.random() - 0.5) * Math.min(1.2, ev.bump * 0.1) * (ctx.testMode ? 0 : 1);
    }
    if (ev.landed > 2) {
      heave.v -= Math.min(2.2, ev.landed * 0.16);
      if (driven) cam.shake(Math.min(0.45, ev.landed / 30));
      if (ev.landed > 6) ctx.audio.play('land', { volume: Math.min(1, ev.landed / 14) });
    }
    if (ev.hopped) {
      heave.v += 0.9;
      ctx.audio.play('jump', { pitch: 0.75 });
    }
    if (ev.righted) ctx.audio.play('boing');

    // Deep water: the sea turns you back, and if you still end up stuck, a splash and a rescue.
    if (ev.depth > 0.8) deepFor += dt;
    else deepFor = 0;
    if (deepFor > 1.2) {
      ctx.audio.play('splash');
      placeAt(safe.pos, safe.yaw);
    }
    if (sim.position.y < -30) placeAt(safe.pos, safe.yaw);

    // Safe spot: all wheels down, upright, on dry land.
    safeTimer += dt;
    up.set(0, 1, 0).applyQuaternion(sim.quaternion);
    if (safeTimer > 0.5 && sim.contacts === 4 && up.y > 0.9 && ev.depth < -0.1 && ctx.world.isLand(sim.position.x, sim.position.z)) {
      safeTimer = 0;
      safe.pos.set(sim.position.x, sim.position.y - restHeight(), sim.position.z);
      safe.yaw = sim.yaw();
    }
  }
  const unhookBefore = hooks.onBeforeStep(fixedStep);
  const unhookAfter = hooks.onAfterStep(() => sim.snapshot());

  /** Once per rendered frame, after `physics.step`: controls for the next steps, then visuals. */
  function update(dt: number, input: Readonly<InputState> | null): void {
    if (input) readControls(input);
    else Object.assign(controls, NO_CONTROLS);

    sync();
    const vp = sim.visualPosition;
    kickDust(dt, landedThisFrame);
    landedThisFrame = 0;
    const p = pitch.step(clamp(-sim.accelLong * 0.0055, -0.075, 0.075), dt);
    const r = roll.step(clamp(sim.accelLat * 0.0062, -0.11, 0.11), dt);
    const h = heave.step(0, dt);
    model.update(sim.visualWheels, p, r, clamp(h, -0.12, 0.15));
    const camDist = ctx.camera.position.distanceTo(vp);
    far = !driven && (far ? camDist > LOD_NEAR : camDist > LOD_FAR);
    model.setDetail(!far);

    // Contact shadow on the ground under the car.
    const gy = ctx.world.heightAt(vp.x, vp.z);
    const above = vp.y - restHeight() - gy;
    model.blob.position.set(vp.x, Math.max(gy, ctx.world.waterLevel) + 0.06, vp.z);
    model.blob.rotation.y = headingOf(sim.visualQuaternion);
    (model.blob.material as THREE.MeshBasicMaterial).opacity = 0.5 * clamp(1 - above / 3, 0, 1);

    if (driven) {
      const s = engineSound(sim.forwardSpeed, controls.throttle, DRIVE.topSpeedRoad);
      ctx.audio.setLoop('engine', s.intensity, s.pitch);
      engineOn = true;
    } else if (engineOn) {
      ctx.audio.setLoop('engine', 0);
      engineOn = false;
    }
  }

  function exitSpot(): { position: THREE.Vector3; yaw: number } {
    const yaw = sim.yaw();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const from = new THREE.Vector3(sim.position.x, sim.position.y + 0.5, sim.position.z);
    const candidates: [number, number][] = [[1.9, -0.2], [-1.9, -0.2], [0, -3.0], [0, 3.1], [1.9, 1.5], [-1.9, 1.5]];
    for (const [x, z] of candidates) {
      const off = new THREE.Vector3(x, 0, z).applyQuaternion(q);
      const target = from.clone().add(off);
      const blocked = ctx.physics.raycast(from, off, off.length() + 0.4);
      if (blocked) continue;
      const hit = ctx.physics.raycast(new THREE.Vector3(target.x, target.y + 2, target.z), new THREE.Vector3(0, -1, 0), 6);
      if (!hit || hit.normal.y < 0.6) continue;
      if (hit.point.y < ctx.world.waterLevel - 0.3) continue;
      return { position: hit.point.clone().setY(hit.point.y + 0.02), yaw };
    }
    return { position: new THREE.Vector3(sim.position.x, sim.position.y + 1.9, sim.position.z), yaw };
  }

  function rescue(): void {
    const road = nearestRoad(sim.position.x, sim.position.z);
    if (road.dist < 90) {
      const heading = sim.yaw();
      let yaw = Math.atan2(road.dirX, road.dirZ);
      if (Math.cos(yaw - heading) < 0) yaw += Math.PI;
      // Sit on the road's edge-side lane so the player can stand beside it on the tarmac.
      const y = groundAt(road.x, road.z, ctx.world.heightAt(road.x, road.z) + 6);
      placeAt(new THREE.Vector3(road.x, y, road.z), yaw);
    } else {
      placeAt(safe.pos, safe.yaw);
    }
  }

  placeAt(anchor.position, anchor.yaw);

  return {
    api,
    mode: 'driving',
    icon: 'car',
    seat: model.seat,
    seatAnim: 'sit',
    chase: {
      heading: () => headingOf(sim.visualQuaternion),
      speed: () => sim.forwardSpeed,
      topSpeed: DRIVE.topSpeedRoad,
      yawRate: () => sim.visualYawRate,
      distance: 4.6,
      height: 2.0,
    },
    promptPosition: () => prompt.copy(sim.visualPosition).setY(sim.visualPosition.y + 0.9),
    update,
    onEnter() {
      driven = true;
    },
    onExit() {
      driven = false;
      Object.assign(controls, NO_CONTROLS);
    },
    exitSpot,
    rescue,
    park() {
      safe.pos.copy(anchor.position);
      safe.yaw = anchor.yaw;
      placeAt(anchor.position, anchor.yaw);
    },
    dispose() {
      unhookBefore();
      unhookAfter();
      if (engineOn) ctx.audio.setLoop('engine', 0);
      model.root.removeFromParent();
      model.blob.removeFromParent();
      dust.mesh.removeFromParent();
      dust.dispose();
      model.dispose();
      sim.dispose();
    },
  };
}
