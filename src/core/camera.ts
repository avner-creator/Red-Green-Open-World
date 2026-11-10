/**
 * Third-person orbit camera: mouse / right-stick orbit with clamped pitch, smooth follow,
 * ray-based collision (never inside terrain or walls), overrides, playful shake, title orbit.
 */
import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';
import type { CameraApi, GameContext } from '../types';
import { clamp, orbitOffset, resolveCameraDistance, steerOverrideYaw } from './camera-math';
import { angleDelta, damp } from './motion-math';
import { CAM } from './tuning';

type Override = Parameters<CameraApi['setOverride']>[0];

export interface CameraInternal {
  api: CameraApi;
  update(dt: number): void;
  /** Snap behind the player looking along `yaw` (after teleport/respawn). */
  snap(yaw: number): void;
  /** Chase-camera mode for a vehicle (null = normal on-foot orbit). Blends smoothly both ways. */
  setChase(source: ChaseSource | null): void;
  /** Extra on-foot follow distance (metres) for long characters (the T-rex). */
  setFootExtraDistance(metres: number): void;
  /** Quick FOV punch (degrees, decays in ~0.3 s): skills, big moments. Deterministic. */
  kick(fovDegrees: number): void;
}

/** What the chase camera needs from a vehicle. */
export interface ChaseSource {
  /** Heading of the vehicle's nose (yaw, radians). */
  heading(): number;
  /** Signed forward speed (m/s). */
  speed(): number;
  /** Speed at which the camera reaches its widest FOV / furthest distance. */
  readonly topSpeed: number;
  /** Turn rate (rad/s, + = left): the camera leans into turns. */
  yawRate(): number;
  /** Base follow distance and FOV for this vehicle. */
  readonly distance: number;
  readonly height: number;
}

const BASE_PITCH = Math.atan2(CAMERA.height, CAMERA.distance);

export function createCameraRig(ctx: GameContext): CameraInternal {
  const camera = ctx.camera;
  let yaw = ctx.player.yaw;
  let pitch = BASE_PITCH;
  let distance: number = CAMERA.distance;
  let override: Override = null;
  // Smoothed (blended) override values.
  let wantDistance: number = CAMERA.distance;
  let extraHeight = 0;
  let fov: number = CAMERA.fov;
  let lookAhead = 0;
  let chase: ChaseSource | null = null;
  /** 0 = on foot, 1 = full chase framing (blended). */
  let chaseK = 0;
  let trauma = 0;
  let shakeTime = 0;
  let sinceLook = 99;
  let titleT = 0;
  let footExtra = 0;
  let fovKick = 0;
  const pivot = new THREE.Vector3();
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let first = true;

  const playerPivot = (out: THREE.Vector3): THREE.Vector3 =>
    out.copy(ctx.player.position).setY(ctx.player.position.y + CAM.pivotHeight);

  ctx.events.on('player:land', (e) => {
    if (e.speed > 9) api.shake(Math.min(0.6, (e.speed - 9) / 25));
  });

  const api: CameraApi = {
    camera,
    setOverride(o) {
      override = o;
    },
    shake(amount) {
      if (ctx.testMode) return;
      trauma = Math.min(1, trauma + Math.max(0, amount));
    },
    get yaw() {
      return yaw;
    },
  };

  function setChase(source: ChaseSource | null): void {
    chase = source;
    sinceLook = 99; // swing in behind the vehicle right away
  }

  function snap(newYaw: number): void {
    yaw = newYaw;
    pitch = BASE_PITCH;
    playerPivot(pivot);
    distance = wantDistance;
    first = false;
  }

  function update(dt: number): void {
    const phase = ctx.session.state.phase;
    const input = ctx.input.state;
    const k = damp(4, dt);
    chaseK += ((chase ? 1 : 0) - chaseK) * damp(3, dt);
    // Chase framing: further back and a wider FOV as speed builds (sense of speed).
    const sp = chase ? Math.min(1, Math.abs(chase.speed()) / Math.max(1, chase.topSpeed)) : 0;
    // On foot: a touch of look-ahead, distance and FOV as the run builds up to a sprint.
    const pv = ctx.player.velocity;
    const run =
      !chase && ctx.player.mode === 'walk' ? Math.max(0, Math.min(1, (Math.hypot(pv.x, pv.z) - PLAYER.walkSpeed * 0.5) / (PLAYER.sprintSpeed - PLAYER.walkSpeed * 0.5))) : 0;
    const baseDist = chase ? chase.distance + sp * 1.3 : CAMERA.distance + footExtra + run * CAM.sprintExtraDistance;
    const baseHeight = chase ? chase.height : CAMERA.height;
    const baseFov = chase ? CAMERA.fov + 4 + sp * 9 : CAMERA.fov + run * CAM.sprintExtraFov;
    wantDistance += ((override?.distance ?? baseDist) - wantDistance) * k;
    extraHeight += ((override?.height ?? baseHeight) - CAMERA.height - extraHeight) * k;
    lookAhead += ((override?.lookAhead ?? (chase ? 1.2 : run * CAM.sprintLookAhead)) - lookAhead) * k;
    const fovTarget = override?.fov ?? baseFov;
    fovKick *= Math.exp(-10 * dt);
    if (Math.abs(fovKick) < 0.01) fovKick = 0;
    if (Math.abs(fovTarget - fov) > 0.01 || fovKick !== 0 || Math.abs(camera.fov - fov) > 1e-3) {
      fov += (fovTarget - fov) * damp(3, dt);
      camera.fov = fov + fovKick;
      camera.updateProjectionMatrix();
    }

    playerPivot(target);
    if (first) {
      pivot.copy(target);
      first = false;
    }

    if (phase === 'title') {
      if (!ctx.testMode) titleT += dt;
      yaw = ctx.player.yaw + Math.PI + 0.5 + titleT * CAM.titleOrbitRate;
      pitch = 0.22;
      pivot.copy(target);
    } else {
      const looking = Math.abs(input.lookX) + Math.abs(input.lookY) > 1e-5;
      yaw -= input.lookX;
      pitch = clamp(pitch + input.lookY, CAM.minPitch, CAM.maxPitch);
      sinceLook = looking ? 0 : sinceLook + dt;
      yaw = steerOverrideYaw(yaw, ctx.player.yaw, override, sinceLook, CAM.autoAlignDelay, 2, dt);
      // Gently swing behind a player who runs forward-ish and isn't steering the camera.
      const hs = Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z);
      if (chase) {
        // Chase: swing in behind the nose (look ahead into turns) unless the player is looking around.
        const v = chase.speed();
        if (sinceLook > 0.6 && v > -2) {
          const want = chase.heading() + Math.max(-0.35, Math.min(0.35, chase.yawRate() * 0.22));
          yaw += angleDelta(yaw, want) * damp(1.2 + 3 * Math.min(1, Math.abs(v) / 8), dt);
          pitch += (0.24 - pitch) * damp(1.5, dt);
        }
      } else if (sinceLook > CAM.autoAlignDelay && hs > 1 && input.moveY > 0.3 && ctx.player.mode === 'walk') {
        yaw += angleDelta(yaw, ctx.player.yaw) * damp(CAM.autoAlignRate * Math.min(1, hs / 6), dt);
      }
      // Smooth follow (tighter horizontally than vertically), with bounded lag.
      const kh = damp(CAM.followRate, dt);
      // Fast falls (skydive, big bounces) tighten the vertical follow so the camera doesn't hang
      // metres above the player looking down on them.
      const kv = damp(CAM.verticalFollowRate + Math.abs(ctx.player.velocity.y) * CAM.fallFollowGain, dt);
      pivot.x += (target.x - pivot.x) * kh;
      pivot.z += (target.z - pivot.z) * kh;
      pivot.y += (target.y - pivot.y) * kv;
      tmp.subVectors(pivot, target);
      if (tmp.length() > CAM.maxLag) pivot.copy(target).addScaledVector(tmp.normalize(), CAM.maxLag);
    }

    // Collision: ray from the pivot towards the wanted camera position.
    const off = orbitOffset(yaw, pitch, 1);
    dir.set(off.x, off.y + extraHeight / Math.max(1, wantDistance), off.z).normalize();
    const hit = ctx.physics.raycast(pivot, dir, wantDistance + CAM.collisionMargin);
    distance = resolveCameraDistance(distance, wantDistance, hit ? hit.distance : null, CAM.collisionMargin, CAM.minDistance, CAM.easeOutRate, dt);
    camera.position.copy(pivot).addScaledVector(dir, distance);

    lookAt.copy(pivot);
    if (lookAhead !== 0) {
      tmp.copy(ctx.player.velocity).setY(ctx.player.velocity.y * 0.2);
      if (tmp.length() > 20) tmp.setLength(20);
      lookAt.addScaledVector(tmp, lookAhead * 0.1);
    }
    if (chaseK > 0.001) lookAt.y -= 0.35 * chaseK; // frame the whole vehicle, not just the driver
    camera.lookAt(lookAt);

    if (trauma > 0) {
      shakeTime += dt;
      const s = trauma * trauma * 0.06;
      camera.rotation.x += Math.sin(shakeTime * 37) * s;
      camera.rotation.y += Math.sin(shakeTime * 29 + 1.3) * s;
      camera.rotation.z += Math.sin(shakeTime * 23 + 2.1) * s * 0.5;
      trauma = Math.max(0, trauma - dt * 1.6);
    }
  }

  return {
    api,
    update,
    snap,
    setChase,
    setFootExtraDistance(m) {
      footExtra = Math.max(0, m);
    },
    kick(deg) {
      fovKick = Math.max(-12, Math.min(12, fovKick + deg));
    },
  };
}
