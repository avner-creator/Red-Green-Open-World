/**
 * Third-person orbit camera: mouse / right-stick orbit with clamped pitch, smooth follow,
 * ray-based collision (never inside terrain or walls), overrides, playful shake, title orbit.
 */
import * as THREE from 'three';
import { CAMERA } from '../config';
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
  let trauma = 0;
  let shakeTime = 0;
  let sinceLook = 99;
  let titleT = 0;
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
    wantDistance += ((override?.distance ?? CAMERA.distance) - wantDistance) * k;
    extraHeight += ((override?.height ?? CAMERA.height) - CAMERA.height - extraHeight) * k;
    lookAhead += ((override?.lookAhead ?? 0) - lookAhead) * k;
    const fovTarget = override?.fov ?? CAMERA.fov;
    if (Math.abs(fovTarget - fov) > 0.01) {
      fov += (fovTarget - fov) * damp(3, dt);
      camera.fov = fov;
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
      if (sinceLook > CAM.autoAlignDelay && hs > 1 && input.moveY > 0.3 && ctx.player.mode === 'walk') {
        yaw += angleDelta(yaw, ctx.player.yaw) * damp(CAM.autoAlignRate * Math.min(1, hs / 6), dt);
      }
      // Smooth follow (tighter horizontally than vertically), with bounded lag.
      const kh = damp(CAM.followRate, dt);
      const kv = damp(CAM.verticalFollowRate, dt);
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
    if (lookAhead !== 0) lookAt.addScaledVector(ctx.player.velocity, lookAhead * 0.1);
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

  return { api, update, snap };
}
