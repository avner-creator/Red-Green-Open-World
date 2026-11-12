/**
 * Third-person orbit camera: mouse / right-stick orbit with clamped pitch, smooth follow,
 * ray-based collision (never inside terrain or walls), overrides, playful shake, title orbit.
 */
import * as THREE from 'three';
import { CAMERA, PLAYER } from '../config';
import type { CameraApi, GameContext } from '../types';
import { clamp, orbitOffset, resolveArm, steerOverrideYaw } from './camera-math';
import { createCameraCutout } from './camera-cutout';
import { createCameraOccluders } from './camera-occluders';
import { createPropFade } from './camera-prop-fade';
import { coverFadeAmount, createHeroFade, distToBody, heroAxisTop, heroFadeAmount, HERO_COVER_MAX, screenCover } from './camera-hero-fade';
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
  /**
   * How far below the rider's head the camera aims (m; default 0.35 frames the whole vehicle).
   * Lower = the driver's head and shoulders stay in the picture (QA5 M2).
   */
  readonly lookDrop?: number;
}

const BASE_PITCH = Math.atan2(CAMERA.height, CAMERA.distance);
/** The on-foot camera pulls back (up to `COVER_EXTRA_MAX` m) until the hero covers this share of the screen. */
const COVER_TARGET = 0.2;
const COVER_EXTRA_MAX = 3;

/** Spring arm: sphere casts from the pivot (head) to the wanted camera position. */
const ARM = {
  /** The camera never gets closer than this to a surface (m): over the 0.1 m near plane. */
  hardRadius: 0.22,
  /** A fatter probe sees obstacles coming so the arm eases in instead of snapping. */
  softRadius: 0.55,
  /** Soft hits closer than this are contacts at the start, not obstacles ahead (m). */
  softIgnoreBelow: 1.2,
  /** The fat probe pulls the arm in at most this far ahead of the hard limit (m). */
  softLead: 1.5,
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
  /** A tree crown (render-only, see-through when close) shortens the arm to no less than this (m). */
  crownFloor: 1.7,
  /**
   * On foot, an arm still shorter than this after the lift (scenery right behind the hero, too tall
   * to look over) swings round to the clearer side (QA6 M2), and swings back no further than needed.
   */
  swingBelow: 1.7,
  /** A swing side counts as clear from this arm length (m; or 90% of the wanted length). */
  swingGood: 3.5,
  /** Physics posts slimmer than this (horizontal half-size, m) never pull the camera in. */
  slimPost: 0.16,
} as const;

/** Swing candidates for the on-foot arm (yaw offsets in ± pairs, smallest first, then 180°). */
const SWINGS = [1, 2, 3, 4, 5].flatMap((i) => [(i * Math.PI) / 6, (-i * Math.PI) / 6]).concat(Math.PI);

/** Test-mode hook (`window.__rgCamera`, only with `?test=1`). */
export interface CameraDebug {
  /** Set the orbit yaw/pitch as if the player had looked there (no auto-align for a while). */
  setView(yaw: number, pitch?: number): void;
  state(): { yaw: number; pitch: number; lift: number; distance: number; want: number; triangles: number; capsules: number; lastHit: { phys: number | null; occ: number | null; collider: number }; heroFade: number; swinging: boolean; cover: number };
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
  /** Scripted-camera unblock: next scan countdown and the clear yaw being swung to (or null). */
  let scanT = 0;
  let swingTo: number | null = null;
  /** The on-foot swing heads for a clearly longer side (the lift then stays off). */
  let swingGood = false;
  const cutout = createCameraCutout();
  const occluders = createCameraOccluders(ctx.scene, (m) => cutout.patch(m.material));
  const heroFade = createHeroFade();
  const propFade = createPropFade(ctx.scene);
  const heroMid = new THREE.Vector3();
  const heroBox = new THREE.Box3();
  /** Top of the hero incl. hat, above the feet (m), and seconds to its next measurement. */
  let heroTop = heroAxisTop(PLAYER.height, null);
  let topT = 0;
  /** The hero's bounds incl. worn items relative to the feet (re-measured with `heroTop`). */
  const heroRel = new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, PLAYER.height, 0.4));
  /**
   * Share of the screen (width × height) the hero's bounds covered last frame (QA8 m5): above
   * `HERO_COVER_MAX` the arm swings or lifts for a longer view, and the hero fades a little.
   */
  let cover = 0;
  const coverBox = new THREE.Box3();
  /**
   * Extra follow distance (m) that brings a big hero (a pup in a wizard hat) back under the cover
   * limit with a clear arm: size on screen goes as 1 / distance², so the distance that gives the
   * target cover is the same wherever the camera is now (no hunting).
   */
  let coverExtra = 0;
  const R = ctx.physics.rapier;
  const ballHard = new R.Ball(ARM.hardRadius);
  const ballSoft = new R.Ball(ARM.softRadius);
  const IDQ = { x: 0, y: 0, z: 0, w: 1 };
  const probeDir = new THREE.Vector3();
  const seeFrom = new THREE.Vector3();
  const seeTo = new THREE.Vector3();
  const seeDir = new THREE.Vector3();
  let lastHit: { phys: number | null; occ: number | null; collider: number } = { phys: null, occ: null, collider: -1 };

  /**
   * Physics colliders the arm may stop at: not slim upright posts (a sign pole, a lamp post, a
   * board's leg). Those hide at most a sliver of the hero and would otherwise snap the camera into
   * the hero's head as they pass behind them.
   */
  const notSlim = (c: InstanceType<typeof R.Collider>): boolean => {
    const t = c.shapeType();
    if (t === R.ShapeType.Cylinder || t === R.ShapeType.Capsule || t === R.ShapeType.Cone) {
      const q = c.rotation();
      // Upright only (a log lying down is not a post).
      const upright = 1 - 2 * (q.x * q.x + q.z * q.z) > 0.9;
      return !(upright && c.radius() < ARM.slimPost);
    }
    if (t === R.ShapeType.Cuboid) {
      const h = c.halfExtents();
      if (!h) return true;
      const q = c.rotation();
      // World AABB half-size along x and z of the rotated box.
      const m00 = 1 - 2 * (q.y * q.y + q.z * q.z);
      const m01 = 2 * (q.x * q.y - q.w * q.z);
      const m02 = 2 * (q.x * q.z + q.w * q.y);
      const m20 = 2 * (q.x * q.z - q.w * q.y);
      const m21 = 2 * (q.y * q.z + q.w * q.x);
      const m22 = 1 - 2 * (q.x * q.x + q.y * q.y);
      const ex = Math.abs(m00) * h.x + Math.abs(m01) * h.y + Math.abs(m02) * h.z;
      const ez = Math.abs(m20) * h.x + Math.abs(m21) * h.y + Math.abs(m22) * h.z;
      return !(ex < ARM.slimPost && ez < ARM.slimPost && h.y > Math.max(h.x, h.z));
    }
    return true;
  };

  /** Distance from `origin` along unit `d` a sphere can travel before touching anything, or null. */
  function clearAlong(origin: THREE.Vector3, d: THREE.Vector3, max: number, radius: number, ball: InstanceType<typeof R.Ball>): number | null {
    const hit = ctx.physics.world.castShape(origin, IDQ, d, ball, 0, max, false, R.QueryFilterFlags.EXCLUDE_SENSORS, RAY_GROUPS, undefined, undefined, notSlim);
    let best = hit ? hit.time_of_impact : null;
    // Chase cams (buggy at speed) keep to physics colliders: roadside crowns flicking past would
    // snap the arm in and out and break the drive's smoothness.
    let o = chase ? null : occluders.cast(origin, d, best ?? max, radius);
    if (o !== null && o < ARM.crownFloor) {
      // Foliage this close is cut away (camera-cutout.ts): a crown never pulls the camera into the
      // hero's head (QA6 m7, pines); only solid occluders may.
      const solid = occluders.cast(origin, d, best ?? max, radius, false);
      o = solid !== null && solid <= o + 1e-3 ? solid : Math.min(ARM.crownFloor, best ?? max);
    }
    if (ball === ballHard) lastHit = { phys: best, occ: o, collider: hit ? hit.collider.handle : -1 };
    if (o !== null && (best === null || o < best)) best = o;
    return best;
  }

  /** Is the hero's torso or head hidden from a camera at `pivot + d·dist` (physics or render occluders)? */
  function bodyHidden(d: THREE.Vector3, dist: number): boolean {
    seeFrom.copy(pivot).addScaledVector(d, dist);
    for (const h of [CAM.pivotHeight * 0.5, Math.max(CAM.pivotHeight, heroTop - 0.1)]) {
      seeTo.copy(ctx.player.position).setY(ctx.player.position.y + h);
      seeDir.subVectors(seeTo, seeFrom);
      // Stop short of the hero: whatever they stand in (a planter) is not the camera's to fix.
      const len = seeDir.length() - 0.6;
      if (len <= 0.1) continue;
      seeDir.normalize();
      if (ctx.physics.raycast(seeFrom, seeDir, len) !== null || occluders.cast(seeFrom, seeDir, len, 0) !== null) return true;
    }
    return false;
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
    // A big hero on a clear arm: pull back until they cover no more than the target share.
    if (!chase && phase !== 'title' && distance >= wantDistance * 0.95 && cover > 0 && cover < 1) {
      const need = distance * Math.sqrt(cover / COVER_TARGET);
      const extra = clamp(need - (override?.distance ?? baseDist), 0, COVER_EXTRA_MAX);
      coverExtra += (extra - coverExtra) * damp(2, dt);
    } else if (chase || phase === 'title') coverExtra = 0;
    wantDistance += ((override?.distance ?? baseDist) + coverExtra - wantDistance) * k;
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
    const scripted = !!override && override.yawOffset === undefined;
    // On foot (no override), scenery right behind the hero (a kiosk wall, a tall board: QA6 M2)
    // swings the arm round to the nearest clearly longer side: a clear side view beats a steep
    // look down at the top of the hero's head. Scanned before the lift, which it then replaces.
    const footSwing = phase !== 'title' && !chase && !override;
    if (footSwing) {
      scanT -= dt;
      if (scanT <= 0) {
        scanT = 0.15;
        const keep = yaw;
        // While the hero is being steered the move basis is the camera's yaw: a swing would bend
        // their path (and walking on clears the arm anyway), so it waits until they stop; the hero
        // fade covers the moment in between.
        const steering = Math.abs(input.moveX) + Math.abs(input.moveY) > 0.1;
        const here = clearAlong(pivot, armDir(pitch, probeDir), reach, ARM.hardRadius, ballHard) ?? reach;
        // The hero (hat and all) filling the screen counts as an arm that is too short: ask for one
        // long enough to bring them under the limit (size on screen goes as 1 / distance²).
        const big = cover > HERO_COVER_MAX && here < wantDistance * 0.9;
        const need = big ? Math.min(wantDistance * 0.9, here * Math.sqrt(cover / HERO_COVER_MAX) + 0.3) : Math.min(ARM.swingBelow, wantDistance * 0.5);
        // A swing under way runs to its end (it only stops early once the arm is all but clear).
        if (steering && swingTo === null) {
          // (no new swing while steering)
        } else if (here >= wantDistance * 0.9 || (swingTo === null && here >= need)) {
          swingTo = null;
          swingGood = false;
        } else if (swingTo === null) {
          // A big hero only needs the arm that brings them under the cover limit.
          const good = big ? need : Math.min(wantDistance * 0.9, Math.max(ARM.swingGood, here * 1.5 + 0.5));
          // The smallest swing (± pair: the longer side) that is clearly longer; else the longest.
          let pick: number | null = null;
          let pickD = -1;
          let any: number | null = null;
          let anyD = here + (big ? 0.3 : 0.5);
          for (let i = 0; i < SWINGS.length && pick === null; i += 2) {
            for (let k = i; k < Math.min(i + 2, SWINGS.length); k++) {
              yaw = keep + SWINGS[k];
              const d = clearAlong(pivot, armDir(pitch, probeDir), reach, ARM.hardRadius, ballHard) ?? reach;
              if (d >= good && d > pickD) {
                pick = yaw;
                pickD = d;
              }
              if (d > anyD) {
                any = yaw;
                anyD = d;
              }
            }
          }
          swingTo = pick ?? any;
          swingGood = pick !== null;
        }
        yaw = keep;
      }
    }
    // Chase framing is the vehicle's own; the swing over/under is for the hero on foot or riding
    // (the horse's chase too: QA7 m5, a rim right behind the rider).
    if (phase !== 'title' && (!chase || ctx.player.mode === 'riding')) {
      const base = clearAlong(pivot, armDir(pitch, probeDir), reach, ARM.hardRadius, ballHard);
      const baseD = base === null ? wantDistance : base;
      if (baseD < Math.min(ARM.liftWhenShorter, wantDistance * 0.5) || (cover > HERO_COVER_MAX && baseD < wantDistance * 0.9)) {
        if (!(footSwing && swingTo !== null && swingGood)) {
          // Blocked right behind the hero: swing over (or under) it if that gives a clearly longer view.
          let bestD = baseD;
          // A big hero (QA8 m5): any rise that reaches the arm length they need will do.
          const coverNeed = cover > HERO_COVER_MAX ? Math.min(wantDistance * 0.9, baseD * Math.sqrt(cover / HERO_COVER_MAX) + 0.2) : Infinity;
          for (const dp of [ARM.liftUp, CAM.maxPitch - pitch, ARM.liftDown]) {
            const p = clamp(pitch + dp, CAM.minPitch, CAM.maxPitch);
            if (Math.abs(p - pitch) < 0.05) continue;
            const h = clearAlong(pivot, armDir(p, probeDir), reach, ARM.hardRadius, ballHard);
            const d = h === null ? wantDistance : h;
            if (d > bestD * 1.4 + 0.4 || (d >= coverNeed && d > bestD + 0.2)) {
              bestD = d;
              liftTarget = p - pitch;
            }
          }
          // Keep the current swing while it is still needed (no flip-flopping between frames).
          if (liftTarget === 0 && Math.abs(lift) > 0.02) liftTarget = lift;
        }
      } else if (bodyHidden(armDir(pitch, probeDir), Math.min(wantDistance, baseD))) {
        // A planter, counter or bush between the camera and the hero's body: look over it.
        liftTarget = Math.min(ARM.seeOver, CAM.maxPitch - pitch);
      }
    }
    // Scripted cameras (celebrations, results, countdowns: an override without a fixed yaw) may
    // not end in a bush, a sign or the hero's head (QA5 m5/m9): when the arm is cut short, swing
    // round to the clearest of 8 directions instead of sitting at the obstacle.
    if (phase !== 'title' && !chase && scripted) {
      scanT -= dt;
      if (scanT <= 0) {
        scanT = 0.25;
        swingTo = null;
        armDir(pitch, probeDir);
        const here = clearAlong(pivot, probeDir, reach, ARM.hardRadius, ballHard) ?? reach;
        if (here < wantDistance * 0.7) {
          const keep = yaw;
          let best = here;
          for (let i = 1; i < 8; i++) {
            yaw = keep + (i * Math.PI) / 4;
            const d = clearAlong(pivot, armDir(pitch, probeDir), reach, ARM.hardRadius, ballHard) ?? reach;
            if (d > best + 0.5) {
              best = d;
              swingTo = yaw;
            }
          }
          yaw = keep;
        }
      }
    } else if (!footSwing) swingTo = null;
    // The player's own look input always wins over a swing.
    if (swingTo !== null && Math.abs(input.lookX) < 1e-5) {
      yaw += angleDelta(yaw, swingTo) * damp(scripted ? 4 : 8, dt);
      if (!scripted && Math.abs(angleDelta(yaw, swingTo)) < 0.03) swingTo = null;
    }
    lift += (liftTarget - lift) * damp(ARM.liftRate, dt);
    armDir(clamp(pitch + lift, CAM.minPitch, CAM.maxPitch), dir);
    const hardHit = clearAlong(pivot, dir, reach, ARM.hardRadius, ballHard);
    const softHit = clearAlong(pivot, dir, reach, ARM.softRadius, ballSoft);
    const hard = hardHit === null ? null : Math.max(ARM.hardMin, hardHit - 0.04);
    // The fat probe starts touching anything within its radius of the head (a wall beside the
    // hero): it only anticipates obstacles further out and never pulls the arm in closer than that.
    // It only leads the hard limit by `softLead`: a wall grazing the fat probe alongside a clear arm
    // (the hero's back to a long wall, arm swung along it: QA6 M2) must not hold the camera at 1.5 m.
    const soft = softHit === null || softHit < ARM.softIgnoreBelow ? null : Math.max(softHit, (hard ?? wantDistance) - ARM.softLead);
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
    if (chaseK > 0.001) lookAt.y -= (chase?.lookDrop ?? 0.35) * chaseK; // frame the vehicle and its driver
    camera.lookAt(lookAt);
    heroMid.copy(ctx.player.position).setY(ctx.player.position.y + CAM.pivotHeight * 0.55);
    cutout.update(camera.position, heroMid, phase !== 'title');
    // Last resort: still pinned within reach of the hero's body → dither the hero away rather than
    // render the inside of their head (QA6 M2). Riding in a vehicle never fades the hero.
    // Hats and held items count as the hero (QA7 m2: a camera in a top hat while waiting at a
    // booth): the body axis reaches up to the top of everything the hero wears (re-measured a few
    // times a second, kept relative to the feet in between).
    const pp = ctx.player.position;
    topT -= dt;
    if (topT <= 0) {
      topT = 0.3;
      heroBox.setFromObject(ctx.player.object);
      heroTop = heroAxisTop(PLAYER.height, heroBox.isEmpty() ? null : heroBox.max.y - pp.y);
      if (!heroBox.isEmpty()) heroRel.copy(heroBox).translate(tmp.copy(pp).negate());
    }
    const body = distToBody(camera.position, pp.x, pp.z, pp.y + 0.25, pp.y + heroTop, PLAYER.radius * 0.8);
    // Props flagged `cameraFade` (the Gear Shack rocket) between the camera and the hero: see-through.
    propFade.update(camera.position, pp, heroTop, dt, phase !== 'title' && !chase);
    camera.updateMatrixWorld();
    cover = phase === 'title' || chase ? 0 : screenCover(camera, coverBox.copy(heroRel).translate(pp));
    // On horseback too (QA7 m5: pinned against the foam-course rim, the camera sat in the hero's
    // head); the buggy keeps its own chase framing. A hero still filling the screen after the swing
    // and lift (QA8 m5) fades part-way too.
    const fadeOk = phase !== 'title' && (!chase || ctx.player.mode === 'riding');
    heroFade.update(ctx.player.object, fadeOk ? Math.max(heroFadeAmount(body), coverFadeAmount(cover)) : 0);

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
      // A see-through prop (camera-prop-fade.ts) dithered mostly away is not in the picture.
      if (((o.userData as { cameraFaded?: number }).cameraFaded ?? 0) > 0.5) return false;
      return !!(o as THREE.Mesh).isMesh && !(mm && mm.transparent && mm.opacity < 0.5) && !(mm && !mm.colorWrite);
    };
    /** First rendered surface hit from `from` along `dir` within `max` (not the hero), or null. */
    const firstHit = (from: THREE.Vector3, dirN: THREE.Vector3, max: number): THREE.Intersection | null => {
      rc.set(from, dirN);
      rc.near = 0;
      rc.far = max;
      rc.layers.mask = camera.layers.mask;
      rc.camera = camera;
      for (const h of rc.intersectObjects(ctx.scene.children, true)) {
        if (!shown(h.object) || isHero(h.object)) continue;
        // Foliage the see-through cut removes there is not in the picture.
        const mat = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[];
        if (!Array.isArray(mat) && cutout.patched(mat) && cutout.covers(h.point)) continue;
        return h;
      }
      return null;
    };
    return {
      setView(y, pt) {
        yaw = y;
        if (pt !== undefined) pitch = clamp(pt, CAM.minPitch, CAM.maxPitch);
        sinceLook = 0;
      },
      state: () => ({ yaw, pitch, lift, distance, want: wantDistance, triangles: occluders.stats().triangles, capsules: occluders.stats().capsules, lastHit, heroFade: heroFade.amount, swinging: swingTo !== null, cover }),
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
        // Inside a crown counts only where its foliage is not cut away round the camera.
        const insideCrown = occluders.inside(camera.position, 0) && !cutout.covers(camera.position);
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
