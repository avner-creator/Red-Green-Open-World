/**
 * Third-person orbit camera: mouse / right-stick orbit with clamped pitch, smooth follow,
 * ray-based collision (never inside terrain or walls), overrides, playful shake, title orbit.
 */
import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';
import type { CameraApi, GameContext } from '../types';
import { clamp, orbitOffset, resolveArm, steerOverrideYaw } from './camera-math';
import { createCameraOccluders } from './camera-occluders';
import { RAY_GROUPS } from './physics';
import { angleDelta, damp, followMoving } from './motion-math';
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

/** Spring arm: sphere casts from the pivot (head) to the wanted camera position. */
const ARM = {
  /** The camera never gets closer than this to a surface (m): over the 0.1 m near plane. */
  hardRadius: 0.22,
  /** A fatter probe sees obstacles coming so the arm eases in instead of snapping. */
  softRadius: 0.55,
  /** Soft hits closer than this are contacts at the start, not obstacles ahead (m). */
  softIgnoreBelow: 1.2,
  /** Closest the camera gets to the pivot (m). */
  hardMin: 0.25,
  easeIn: 7,
  /** When the arm is blocked this short, try swinging over (or under) the obstacle. */
  liftWhenShorter: 2.4,
  liftUp: 0.6,
  liftDown: -0.32,
  liftRate: 3,
  /** Extra pitch to look over a low obstacle hiding the hero's body (rad). */
  seeOver: 0.3,
  /** Camera stays this far above the terrain (m). */
  groundClearance: 0.3,
} as const;

/** Test-mode hook (`window.__rgCamera`, only with `?test=1`). */
export interface CameraDebug {
  /** Set the orbit yaw/pitch as if the player had looked there (no auto-align for a while). */
  setView(yaw: number, pitch?: number): void;
  state(): { yaw: number; pitch: number; lift: number; distance: number; want: number; triangles: number; capsules: number; lastHit: { phys: number | null; occ: number | null; collider: number } };
  /**
   * Check the current view against the rendered scene (three.js raycasts against the real render
   * meshes, independent of the occluder proxies): `blocked` = fraction of rays from the camera to
   * points on the hero hidden by world geometry, `inside` = the camera sits inside geometry (the
   * pivot → camera segment enters a surface) or inside a tree crown.
   */
  probe(): { blocked: number; headHidden: boolean; inside: boolean; insideCrown: boolean; near: number; hits: string[] };
}

declare global {
  interface Window {
    __rgCamera?: CameraDebug;
  }
}

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
  /** Last frame's follow target (the follow integrates its motion exactly within a frame). */
  const prevTarget = new THREE.Vector3();
  /**
   * Smoothed player velocity for the look-ahead. The raw one is a per-frame finite difference
   * (seated: Δseat/dt), which turns millimetre wobbles at 120-144 Hz into visible aim twitches.
   */
  const lookVel = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let first = true;
  /** Pitch added by the spring arm to swing over / under an obstacle right behind the hero. */
  let lift = 0;
  const occluders = createCameraOccluders(ctx.scene);
  const R = ctx.physics.rapier;
  const ballHard = new R.Ball(ARM.hardRadius);
  const ballSoft = new R.Ball(ARM.softRadius);
  const IDQ = { x: 0, y: 0, z: 0, w: 1 };
  const probeDir = new THREE.Vector3();
  const seeFrom = new THREE.Vector3();
  const seeTo = new THREE.Vector3();
  const seeDir = new THREE.Vector3();
  let lastHit: { phys: number | null; occ: number | null; collider: number } = { phys: null, occ: null, collider: -1 };

  /** Distance from `origin` along unit `d` a sphere can travel before touching anything, or null. */
  function clearAlong(origin: THREE.Vector3, d: THREE.Vector3, max: number, radius: number, ball: InstanceType<typeof R.Ball>): number | null {
    const hit = ctx.physics.world.castShape(origin, IDQ, d, ball, 0, max, false, R.QueryFilterFlags.EXCLUDE_SENSORS, RAY_GROUPS);
    let best = hit ? hit.time_of_impact : null;
    // Chase cams (buggy at speed) keep to physics colliders: roadside crowns flicking past would
    // snap the arm in and out and break the drive's smoothness.
    const o = chase ? null : occluders.cast(origin, d, best ?? max, radius);
    if (ball === ballHard) lastHit = { phys: best, occ: o, collider: hit ? hit.collider.handle : -1 };
    if (o !== null && (best === null || o < best)) best = o;
    return best;
  }

  /** Is the hero's torso hidden from a camera at `pivot + d·dist` (physics or render occluders)? */
  function bodyHidden(d: THREE.Vector3, dist: number): boolean {
    seeFrom.copy(pivot).addScaledVector(d, dist);
    seeTo.copy(ctx.player.position).setY(ctx.player.position.y + CAM.pivotHeight * 0.5);
    seeDir.subVectors(seeTo, seeFrom);
    // Stop short of the hero: whatever they stand in (a planter) is not the camera's to fix.
    const len = seeDir.length() - 0.6;
    if (len <= 0.1) return false;
    seeDir.normalize();
    return ctx.physics.raycast(seeFrom, seeDir, len) !== null || occluders.cast(seeFrom, seeDir, len, 0) !== null;
  }

  /** Unit arm direction for `p` (pitch) at the current yaw, with the override's extra height. */
  function armDir(p: number, out: THREE.Vector3): THREE.Vector3 {
    const off = orbitOffset(yaw, p, 1);
    return out.set(off.x, off.y + extraHeight / Math.max(1, wantDistance), off.z).normalize();
  }

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
    prevTarget.copy(pivot);
    lookVel.set(0, 0, 0);
    distance = wantDistance;
    lift = 0;
    first = false;
    occluders.refresh(pivot);
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
      prevTarget.copy(target);
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
      // Fast falls (skydive, big bounces) tighten the vertical follow so the camera doesn't hang
      // metres above the player looking down on them.
      const rv = CAM.verticalFollowRate + Math.abs(ctx.player.velocity.y) * CAM.fallFollowGain;
      pivot.x = followMoving(pivot.x, prevTarget.x, target.x, CAM.followRate, dt);
      pivot.z = followMoving(pivot.z, prevTarget.z, target.z, CAM.followRate, dt);
      pivot.y = followMoving(pivot.y, prevTarget.y, target.y, rv, dt);
      tmp.subVectors(pivot, target);
      if (tmp.length() > CAM.maxLag) pivot.copy(target).addScaledVector(tmp.normalize(), CAM.maxLag);
    }

    prevTarget.copy(target);

    // Spring arm: sphere casts from the pivot against physics colliders and render-only occluders
    // (tree crowns, merged props). Snaps in only as far as it must, eases in early, out slowly.
    occluders.update(pivot, dt);
    const reach = wantDistance + 0.2;
    let liftTarget = 0;
    // Chase framing is the vehicle's own; the swing over/under is for the hero on foot or riding.
    if (phase !== 'title' && !chase) {
      const base = clearAlong(pivot, armDir(pitch, probeDir), reach, ARM.hardRadius, ballHard);
      const baseD = base === null ? wantDistance : base;
      if (baseD < Math.min(ARM.liftWhenShorter, wantDistance * 0.5)) {
        // Blocked right behind the hero: swing over (or under) it if that gives a clearly longer view.
        let bestD = baseD;
        for (const dp of [ARM.liftUp, CAM.maxPitch - pitch, ARM.liftDown]) {
          const p = clamp(pitch + dp, CAM.minPitch, CAM.maxPitch);
          if (Math.abs(p - pitch) < 0.05) continue;
          const h = clearAlong(pivot, armDir(p, probeDir), reach, ARM.hardRadius, ballHard);
          const d = h === null ? wantDistance : h;
          if (d > bestD * 1.4 + 0.4) {
            bestD = d;
            liftTarget = p - pitch;
          }
        }
        // Keep the current swing while it is still needed (no flip-flopping between frames).
        if (liftTarget === 0 && Math.abs(lift) > 0.02) liftTarget = lift;
      } else if (bodyHidden(armDir(pitch, probeDir), Math.min(wantDistance, baseD))) {
        // A planter, counter or bush between the camera and the hero's body: look over it.
        liftTarget = Math.min(ARM.seeOver, CAM.maxPitch - pitch);
      }
    }
    lift += (liftTarget - lift) * damp(ARM.liftRate, dt);
    armDir(clamp(pitch + lift, CAM.minPitch, CAM.maxPitch), dir);
    const hardHit = clearAlong(pivot, dir, reach, ARM.hardRadius, ballHard);
    const softHit = clearAlong(pivot, dir, reach, ARM.softRadius, ballSoft);
    const hard = hardHit === null ? null : Math.max(ARM.hardMin, hardHit - 0.04);
    // The fat probe starts touching anything within its radius of the head (a wall beside the
    // hero): it only anticipates obstacles further out and never pulls the arm in closer than that.
    const soft = softHit === null || softHit < ARM.softIgnoreBelow ? null : softHit;
    distance = resolveArm(distance, wantDistance, hard, soft, ARM.easeIn, CAM.easeOutRate, dt);
    camera.position.copy(pivot).addScaledVector(dir, distance);
    const ground = ctx.world.heightAt(camera.position.x, camera.position.z) + ARM.groundClearance;
    if (Number.isFinite(ground) && camera.position.y < ground) camera.position.y = ground;

    lookVel.lerp(ctx.player.velocity, damp(CAM.lookVelRate, dt));
    lookAt.copy(pivot);
    if (lookAhead !== 0) {
      tmp.copy(lookVel).setY(lookVel.y * 0.2);
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

  if (ctx.testMode && typeof window !== 'undefined') window.__rgCamera = createDebug();

  function createDebug(): CameraDebug {
    const rc = new THREE.Raycaster();
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    const s = new THREE.Vector3();
    const right = new THREE.Vector3();
    const upv = new THREE.Vector3();
    const p = new THREE.Vector3();
    const d = new THREE.Vector3();
    const isHero = (o: THREE.Object3D): boolean => {
      for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q === ctx.player.object) return true;
      return false;
    };
    const shown = (o: THREE.Object3D): boolean => {
      for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const mm = Array.isArray(m) ? m[0] : m;
      return !!(o as THREE.Mesh).isMesh && !(mm && mm.transparent && mm.opacity < 0.5) && !(mm && !mm.colorWrite);
    };
    /** First rendered surface hit from `from` along `dir` within `max` (not the hero), or null. */
    const firstHit = (from: THREE.Vector3, dirN: THREE.Vector3, max: number): THREE.Intersection | null => {
      rc.set(from, dirN);
      rc.near = 0;
      rc.far = max;
      rc.layers.mask = camera.layers.mask;
      rc.camera = camera;
      for (const h of rc.intersectObjects(ctx.scene.children, true)) if (shown(h.object) && !isHero(h.object)) return h;
      return null;
    };
    return {
      setView(y, pt) {
        yaw = y;
        if (pt !== undefined) pitch = clamp(pt, CAM.minPitch, CAM.maxPitch);
        sinceLook = 0;
      },
      state: () => ({ yaw, pitch, lift, distance, want: wantDistance, triangles: occluders.stats().triangles, capsules: occluders.stats().capsules, lastHit }),
      probe() {
        // Instanced meshes cache their bounds; the scatter refills instances every view change.
        ctx.scene.traverse((o) => {
          const im = o as THREE.InstancedMesh;
          if (im.isInstancedMesh) {
            im.boundingSphere = null;
            im.boundingBox = null;
          }
        });
        camera.updateMatrixWorld();
        box.setFromObject(ctx.player.object);
        box.getCenter(c);
        box.getSize(s);
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        upv.setFromMatrixColumn(camera.matrixWorld, 1);
        const pts: [number, number][] = [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.2], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.15], [-0.25, -0.15]];
        let blocked = 0;
        let headHidden = false;
        const hits: string[] = [];
        const w = Math.max(s.x, s.z);
        for (const [u, v] of pts) {
          p.copy(c).addScaledVector(right, u * w).addScaledVector(upv, v * s.y);
          d.subVectors(p, camera.position);
          const len = d.length();
          const h = firstHit(camera.position, d.normalize(), Math.max(0, len - 0.6));
          if (h) {
            blocked++;
            if (v === 0.3) headHidden = true;
            hits.push(`${h.object.name || h.object.type}@${u},${v}:${(h.point.y - ctx.player.position.y).toFixed(2)}`);
          }
        }
        d.subVectors(camera.position, pivot);
        const near = d.length();
        const inner = firstHit(pivot, d.normalize(), near);
        const insideCrown = occluders.inside(camera.position, 0);
        if (inner) hits.push(`inner:${inner.object.name || inner.object.type}@${inner.distance.toFixed(2)}`);
        return { blocked: blocked / pts.length, headHidden, inside: !!inner || insideCrown, insideCrown, near, hits };
      },
    };
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
