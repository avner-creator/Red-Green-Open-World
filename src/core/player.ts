/**
 * Player: Rapier KinematicCharacterController capsule with arcade feel (camera-relative movement,
 * smooth turning, sprint, coyote time + jump buffer, variable jump height, a little air control),
 * launches, comic flop, respawn, external controllers and (later) vehicles.
 */
import * as THREE from 'three';
import { PLAYER } from '../config';
import type { ExternalController, GameContext, PlayerAnim, PlayerApi, PlayerMode, VehicleApi } from '../types';
import { GROUP_AVATAR, groups } from './physics';
import { angleDelta, approachVec2, cameraRelative, canJump, damp, integrateVertical } from './motion-math';
import { createPlayerFx } from './player-fx';
import { createPlayerModel } from './player-model';
import { CONTROLLER, MOVE } from './tuning';

const HALF = (PLAYER.height - 2 * PLAYER.radius) / 2;
const CENTRE = HALF + PLAYER.radius;
const MOVE_GROUPS = groups(GROUP_AVATAR, 0xffff & ~GROUP_AVATAR);

export interface PlayerInternal {
  api: PlayerApi;
  update(dt: number): void;
  /** Called after teleport/respawn so the camera can snap behind the player. */
  onTeleport: ((yaw: number) => void) | null;
  /** M2 hook: put the player in/out of a vehicle (hides avatar, mode driving/riding). */
  setVehicle(vehicle: VehicleApi | null, mode?: 'driving' | 'riding'): void;
}

export async function createPlayer(ctx: GameContext, cameraYaw: () => number): Promise<PlayerInternal> {
  const R = ctx.physics.rapier;
  const world = ctx.physics.world;
  const model = await createPlayerModel(`${import.meta.env.BASE_URL}assets/models/RobotExpressive.glb`);
  const fx = createPlayerFx(model);
  const object = model.root;
  ctx.scene.add(object);

  const spawn = ctx.world.anchors.spawn;
  const position = object.position;
  position.copy(spawn.position);
  const velocity = new THREE.Vector3();

  const collider = world.createCollider(
    R.ColliderDesc.capsule(HALF, PLAYER.radius)
      .setTranslation(position.x, position.y + CENTRE, position.z)
      .setCollisionGroups(MOVE_GROUPS),
  );
  const cc = world.createCharacterController(CONTROLLER.offset);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.setMaxSlopeClimbAngle((CONTROLLER.maxSlopeDeg * Math.PI) / 180);
  cc.setMinSlopeSlideAngle((CONTROLLER.slideSlopeDeg * Math.PI) / 180);
  cc.enableAutostep(CONTROLLER.stepHeight, CONTROLLER.stepMinWidth, false);
  cc.enableSnapToGround(CONTROLLER.snapDistance);
  cc.setApplyImpulsesToDynamicBodies(true);
  cc.setCharacterMass(CONTROLLER.characterMass);
  cc.setSlideEnabled(true);

  let mode: PlayerMode = 'walk';
  let grounded = false;
  let airTime = 0;
  let airPeak = 0;
  let takeoffY = position.y;
  let sinceGrounded = Infinity;
  let sincePressed = Infinity;
  let jumping = false;
  let jumpCut = false;
  /** Airborne because of a launch/external ride: landings never flop. */
  let launched = false;
  let flopT = 0;
  let groundedFor = 0;
  let safeTimer = 0;
  const safeSpot = spawn.position.clone();
  let safeYaw = spawn.yaw;
  let external: ExternalController | null = null;
  let externalAnim: PlayerAnim = 'idle';
  let vehicle: VehicleApi | null = null;
  const desired = new THREE.Vector3();
  const prevPos = new THREE.Vector3();
  /**
   * Intended horizontal ground velocity while pressing into an obstacle. `velocity` then reports
   * the real (blocked) motion, but the next frame keeps pushing at full speed: zeroing it would
   * starve Rapier's autostep (it needs real per-frame travel to climb kerbs and stairs).
   */
  const intended = { x: 0, z: 0, valid: false };

  const syncCollider = (): void => {
    collider.setTranslation({ x: position.x, y: position.y + CENTRE, z: position.z });
  };

  const setMode = (next: PlayerMode): void => {
    if (next === mode) return;
    const previous = mode;
    mode = next;
    ctx.events.emit('player:mode', { mode: next, previous });
  };

  const resetAir = (): void => {
    grounded = false;
    airTime = 0;
    airPeak = 0;
    takeoffY = position.y;
    sinceGrounded = Infinity;
    jumping = false;
    jumpCut = false;
  };

  const releaseExternal = (): void => {
    const c = external;
    if (!c) return;
    external = null;
    collider.setEnabled(true);
    syncCollider();
    launched = true; // whatever height the ride ended at, the landing is gentle
    if (mode === 'external') setMode('walk');
    c.onRelease?.();
    api.setTilt(0, 0);
  };
  const tiltPivot = new THREE.Vector3();

  const internal: PlayerInternal = {
    api: undefined as unknown as PlayerApi, // set below
    onTeleport: null,
    update,
    setVehicle(v, m = 'driving') {
      if (v) {
        releaseExternal();
        vehicle = v;
        collider.setEnabled(false);
        object.visible = false;
        setMode(m);
      } else if (vehicle) {
        vehicle = null;
        collider.setEnabled(true);
        syncCollider();
        object.visible = true;
        velocity.set(0, 0, 0);
        intended.valid = false;
        resetAir();
        setMode('walk');
      }
    },
  };

  const api: PlayerApi = {
    object,
    position,
    velocity,
    yaw: spawn.yaw,
    get mode() {
      return mode;
    },
    get grounded() {
      return grounded;
    },
    get airTime() {
      return airTime;
    },
    get airPeak() {
      return airPeak;
    },
    get vehicle() {
      return vehicle;
    },
    teleport(p, yaw) {
      position.copy(p);
      if (yaw !== undefined) api.yaw = yaw;
      object.rotation.y = api.yaw;
      velocity.set(0, 0, 0);
      intended.valid = false;
      resetAir();
      launched = false;
      groundedFor = 0;
      syncCollider();
      internal.onTeleport?.(api.yaw);
    },
    launch(v) {
      velocity.copy(v);
      intended.valid = false;
      if (mode === 'flop') {
        fx.reset();
        setMode('walk');
      }
      resetAir();
      launched = true;
      fx.kick(Math.min(4, v.y * 0.15));
    },
    flop() {
      if (mode !== 'walk') return;
      flopT = 0;
      fx.startFlop();
      setMode('flop');
      ctx.events.emit('player:flop', {});
    },
    respawn() {
      releaseExternal();
      if (vehicle) internal.setVehicle(null);
      fx.reset();
      if (mode !== 'walk') setMode('walk');
      api.teleport(new THREE.Vector3(safeSpot.x, safeSpot.y + 0.05, safeSpot.z), safeYaw);
      object.visible = true;
      fx.pop();
      ctx.events.emit('player:respawn', {});
    },
    setExternalController(c) {
      if (c === external) return;
      releaseExternal();
      if (!c) return;
      if (vehicle) internal.setVehicle(null);
      if (mode === 'flop') fx.reset();
      external = c;
      externalAnim = 'idle';
      intended.valid = false;
      collider.setEnabled(false);
      setMode('external');
    },
    setAnimation(a) {
      externalAnim = a;
    },
    setVisible(v) {
      object.visible = v;
    },
    attach(part, o) {
      model.anchors[part].add(o);
      return () => {
        o.removeFromParent();
      };
    },
    setTilt(pitch, roll) {
      // Rotate the squash group, then shift it so the body centre stays put (pivot = centre).
      const s = model.squash;
      s.rotation.set(pitch, 0, roll);
      tiltPivot.set(0, model.centre, 0).applyEuler(s.rotation);
      s.position.set(-tiltPivot.x, model.centre - tiltPivot.y, -tiltPivot.z);
    },
  };
  internal.api = api;
  object.rotation.y = api.yaw;

  // A new session starts from the spawn point again.
  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'title' || (e.phase === 'playing' && e.previous === 'title')) {
      safeSpot.copy(spawn.position);
      safeYaw = spawn.yaw;
    }
    if (e.phase === 'title' && e.previous !== 'title') api.respawn();
  });

  function playAnim(next: PlayerAnim, rate = 1): void {
    model.play(next, rate);
  }

  function updateExternal(dt: number): void {
    const c = external as ExternalController;
    prevPos.copy(position);
    const keep = c.update(dt, ctx.input.state);
    if (dt > 0) velocity.subVectors(position, prevPos).divideScalar(dt);
    object.rotation.y = api.yaw;
    airTime += dt;
    airPeak = Math.max(airPeak, position.y - takeoffY);
    playAnim(externalAnim);
    if (keep === false && external === c) {
      releaseExternal();
      grounded = false;
      sinceGrounded = Infinity;
    }
  }

  function moveCharacter(dt: number, inputActive: boolean): void {
    const input = ctx.input.state;
    const hv = intended.valid ? { x: intended.x, z: intended.z } : { x: velocity.x, z: velocity.z };
    intended.valid = false;
    const startGrounded = grounded;
    const dir = inputActive ? cameraRelative(input.moveX, input.moveY, cameraYaw()) : { x: 0, z: 0 };
    const mag = Math.min(1, Math.hypot(dir.x, dir.z));
    const top = input.sprint && inputActive ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    if (grounded) {
      const accel = mag > 0.01 ? MOVE.groundAccel : MOVE.groundDecel;
      approachVec2(hv, dir.x * top, dir.z * top, accel * dt);
    } else if (mag > 0.01) {
      const before = Math.hypot(hv.x, hv.z);
      hv.x += dir.x * MOVE.airAccel * dt;
      hv.z += dir.z * MOVE.airAccel * dt;
      const after = Math.hypot(hv.x, hv.z);
      const cap = Math.max(before, top * mag);
      if (after > cap) {
        hv.x *= cap / after;
        hv.z *= cap / after;
      }
    }
    if (mode === 'flop' && grounded) approachVec2(hv, 0, 0, MOVE.groundDecel * 0.4 * dt);

    // Face the movement direction (smooth).
    if (mag > 0.05 && mode === 'walk') {
      const target = Math.atan2(dir.x, dir.z);
      api.yaw += angleDelta(api.yaw, target) * damp(MOVE.turnRate, dt);
    }

    // Jump: buffered press + coyote time.
    if (inputActive && input.jumpPressed) sincePressed = 0;
    if (mode === 'walk' && canJump(sinceGrounded, sincePressed, MOVE.coyoteTime, MOVE.jumpBuffer)) {
      velocity.y = PLAYER.jumpSpeed;
      grounded = false;
      sinceGrounded = Infinity;
      sincePressed = Infinity;
      jumping = true;
      jumpCut = false;
      launched = false;
      takeoffY = position.y;
      airPeak = 0;
      fx.kick(2.2);
      ctx.events.emit('player:jump', {});
    }
    if (jumping && !jumpCut && velocity.y > 0 && !input.jump) {
      velocity.y *= MOVE.jumpCutFactor;
      jumpCut = true;
    }

    // Exact constant-gravity integration (accurate apex for 40 m trampoline launches).
    const vy0 = velocity.y;
    const step = integrateVertical(vy0, PLAYER.gravity, dt);
    const dy = step.dy;
    let vy = Math.max(step.vy, -MOVE.maxFallSpeed);
    desired.set(hv.x * dt, dy, hv.z * dt);

    if (vy0 > 0) cc.disableSnapToGround();
    else cc.enableSnapToGround(CONTROLLER.snapDistance);
    cc.computeColliderMovement(collider, desired, R.QueryFilterFlags.EXCLUDE_SENSORS, MOVE_GROUPS);
    const moved = cc.computedMovement();
    position.x += moved.x;
    position.y += moved.y;
    position.z += moved.z;
    syncCollider();

    // Blocked by a wall: report the real speed. In the air, drop the blocked part so launch speed
    // doesn't build up against walls; on the ground keep pushing (see `intended`).
    const wantH = Math.hypot(desired.x, desired.z);
    if (wantH > 1e-5 && dt > 0) {
      const gotH = Math.hypot(moved.x, moved.z);
      if (gotH < wantH * 0.9) {
        if (startGrounded) {
          intended.x = hv.x;
          intended.z = hv.z;
          intended.valid = true;
        }
        hv.x = moved.x / dt;
        hv.z = moved.z / dt;
      }
    }
    // Bumped the ceiling.
    if (vy0 > 0 && moved.y < dy * 0.5 - 1e-4) vy = Math.min(vy, 0);

    const wasGrounded = grounded;
    grounded = cc.computedGrounded() && vy0 <= 0;
    if (grounded) {
      if (!wasGrounded) land(-Math.min(vy0, 0));
      vy = 0;
      sinceGrounded = 0;
      airTime = 0;
      jumping = false;
    } else {
      if (wasGrounded) {
        takeoffY = position.y;
        airPeak = 0;
      }
      sinceGrounded += dt;
      airTime += dt;
      airPeak = Math.max(airPeak, position.y - takeoffY);
    }
    sincePressed += dt;
    velocity.set(hv.x, vy, hv.z);
  }

  function land(speed: number): void {
    const wasLaunched = launched;
    launched = false;
    if (airTime < 0.12 && speed < 3) return; // stepping off a kerb isn't a landing
    ctx.events.emit('player:land', { speed });
    fx.kick(-Math.min(5, 0.8 + speed * 0.18));
    if (!wasLaunched && speed > MOVE.flopLandingSpeed && mode === 'walk') api.flop();
  }

  function updateSafeSpot(dt: number): void {
    if (!grounded || mode !== 'walk') {
      groundedFor = 0;
      return;
    }
    groundedFor += dt;
    safeTimer += dt;
    if (groundedFor < 0.3 || safeTimer < 0.25) return;
    safeTimer = 0;
    if (!ctx.world.isLand(position.x, position.z) || position.y < ctx.world.waterLevel - 0.05) return;
    safeSpot.copy(position);
    safeYaw = api.yaw;
  }

  function checkHazards(): void {
    if (position.y < MOVE.killY) {
      api.respawn();
      return;
    }
    const water = ctx.world.waterLevel;
    if (position.y < water - 0.3 && water - ctx.world.heightAt(position.x, position.z) > MOVE.deepWater) {
      ctx.audio.play('splash');
      api.respawn();
    }
  }

  function chooseAnim(): void {
    const hs = Math.hypot(velocity.x, velocity.z);
    if (mode === 'flop') return playAnim('flop');
    if (!grounded && airTime > 0.12) return playAnim(velocity.y > 0 ? 'jump' : 'fall');
    if (ctx.session.state.phase === 'title') return playAnim('wave');
    if (hs < 0.35) return playAnim('idle');
    const runFrom = (PLAYER.walkSpeed + PLAYER.sprintSpeed) / 2;
    if (hs < runFrom) return playAnim('walk', Math.min(1.5, Math.max(0.55, hs / 3.2)));
    playAnim('run', Math.min(1.4, Math.max(0.8, hs / 7.5)));
  }

  function update(dt: number): void {
    const input = ctx.input.state;
    if (external) {
      updateExternal(dt);
    } else if (vehicle) {
      position.copy(vehicle.position);
    } else {
      if (input.respawnPressed && (mode === 'walk' || mode === 'flop')) api.respawn();
      else if (input.flopPressed && mode === 'walk') api.flop();
      if (mode === 'flop') {
        flopT += dt;
        if (flopT >= MOVE.flopDuration) setMode('walk');
      }
      moveCharacter(dt, mode === 'walk');
      object.rotation.y = api.yaw;
      updateSafeSpot(dt);
      checkHazards();
      chooseAnim();
    }
    fx.update(dt);
    model.update(dt);
  }

  return internal;
}
