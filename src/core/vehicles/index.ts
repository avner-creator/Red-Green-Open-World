/**
 * Vehicles manager: E to get in (interaction prompt) and out (hop to a free side), R to unstick,
 * chase camera on/off, parking on a new session. Kind-agnostic: anything implementing
 * `VehicleInternal` (the buggy, the two ranch horses) plugs in here.
 */
import * as THREE from 'three';
import type { ExternalController, GameContext, InteractionApi } from '../../types';
import type { CameraInternal } from '../camera';
import type { PlayerInternal } from '../player';
import { createCar } from './car';
import { createHorse } from './horse';
import { choosePark, pointsAlong, rapierProbe, ringPoints } from './parking';
import { createResetHint } from './reset-hint';
import { GROUND_ROADS, isPaved } from './surface';
import type { VehicleInternal, VehiclesPublic } from './types';

/**
 * The two paddock horses: offsets from the ranch anchor (metres, world axes), yaw offset, coat,
 * mane. Coats are picked for the red/green channels against grass (dark in R, bright in G): a
 * chestnut is bright in R and dark in G, the grey is bright in both; manes contrast with coats.
 */
const HORSES = [
  { id: 'horse-maple', dx: -3.2, dz: -3, dyaw: 0, coat: 0xc8622c, mane: 0xf4eee0 },
  { id: 'horse-pebble', dx: 3.6, dz: 2.8, dyaw: 2.5, coat: 0xf1eee7, mane: 0x34302d },
] as const;

/**
 * Parking search (parking.ts): W from a parked ride should last this many seconds before anything
 * is in the way; the speed models (buggy: 20 m launch in 2 s, then 15.5 m/s on the road and 11 off
 * it; horse: gallop 7.5 m/s); how much of the buggy's run should be road; how far from home a spot
 * may move; and the gap between two parked rides.
 */
const PARK = {
  seconds: 8.6,
  car: { road: 15.5, off: 11, launch: 20, launchTime: 2 },
  horse: { road: 7.5, off: 7.5, launch: 4, launchTime: 1.5 },
  carRoad: 60,
  carRadius: 90,
  horseRadius: 10,
  apart: 5,
} as const;

export interface VehiclesInternal {
  api: VehiclesPublic;
  update(dt: number): void;
  /** After the player's update: rider posing (legs around the horse, hands on the reins). */
  lateUpdate(dt: number): void;
  dispose(): void;
}

/** Hop-out arc from the seat to the ground beside the vehicle (then normal walking resumes). */
function hopOut(ctx: GameContext, to: THREE.Vector3, yaw: number): ExternalController {
  const from = ctx.player.position.clone();
  let t = 0;
  return {
    update(dt) {
      t = Math.min(1, t + dt / 0.42);
      const k = t * t * (3 - 2 * t);
      ctx.player.position.lerpVectors(from, to, k);
      ctx.player.position.y += Math.sin(t * Math.PI) * 0.8;
      ctx.player.yaw = yaw;
      return t < 1;
    },
  };
}

export function createVehicles(ctx: GameContext, player: PlayerInternal, camera: CameraInternal, interactions: InteractionApi): VehiclesInternal {
  const list: VehicleInternal[] = [createCar(ctx, 'buggy', () => camera.api, (yaw) => camera.snap(yaw))];
  const ranch = ctx.world.anchors.ranch;
  HORSES.forEach((h, i) => {
    const x = ranch.position.x + h.dx;
    const z = ranch.position.z + h.dz;
    const home = { position: new THREE.Vector3(x, ctx.world.heightAt(x, z), z), yaw: ranch.yaw + h.dyaw };
    list.push(createHorse(ctx, h.id, home, h.coat, h.mane, () => camera.api, i + 1));
  });
  const removers: (() => void)[] = [];
  let active: VehicleInternal | null = null;
  let sinceEnter = 0;
  /** Unstick count of the active ride when last seen (a new hop shows the reset hint). */
  let seenUnsticks = 0;
  /** The reset hint was tapped (touch): reset on the next update. */
  let hintTapped = false;
  const hint = createResetHint(ctx.uiRoot ?? null, () => {
    hintTapped = true;
  });

  const enter = (v: VehicleInternal): boolean => {
    if (active || ctx.player.mode !== 'walk') return false;
    active = v;
    sinceEnter = 0;
    seenUnsticks = v.api.unsticks;
    player.setVehicle(v.api, v.mode, v.seat, v.seatAnim);
    v.onEnter();
    camera.setChase(v.chase);
    ctx.audio.play('jump');
    return true;
  };

  /** Detach from the active vehicle (camera, engine); the player is handled by the caller. */
  const detach = (): VehicleInternal | null => {
    const v = active;
    if (!v) return null;
    active = null;
    hint.hide();
    hintTapped = false;
    v.onExit();
    camera.setChase(null);
    return v;
  };

  const exit = (): void => {
    const v = detach();
    if (!v) return;
    const spot = v.exitSpot();
    player.setVehicle(null);
    ctx.player.setAnimation('jump');
    ctx.player.setExternalController(hopOut(ctx, spot.position, spot.yaw));
  };

  /** R while driving: vehicle upright on the nearest road, player standing beside it. */
  const rescue = (): void => {
    // R always lets go (every ride, the horse too): the vehicle goes back to a safe spot and the
    // rider stands beside it. (The horse used to keep its rider on R; batch-2 rule: R releases.)
    const v = detach();
    if (!v) return;
    player.setVehicle(null);
    v.rescue();
    const spot = v.exitSpot();
    ctx.player.teleport(spot.position, spot.yaw);
    ctx.events.emit('player:respawn', {});
  };

  for (const v of list) {
    removers.push(
      interactions.add({
        id: `vehicle:${v.api.id}`,
        position: () => v.promptPosition(),
        radius: v.mode === 'riding' ? 3.4 : 3.1,
        icon: v.icon,
        enabled: () => active === null && (v.api as { ready?: boolean }).ready !== false,
        onUse: () => enter(v),
      }),
    );
  }

  // Parking poses by measurement (QA8 m2), once the whole island (activities too) has its
  // colliders: the first time the rides are parked for a session.
  let measured = false;
  const measureParking = (): void => {
    if (measured) return;
    measured = true;
    const taken: { x: number; z: number }[] = [];
    for (const v of list) {
      const home = v.parking();
      const probe = rapierProbe(ctx, v.footprint.hw, v.footprint.hl, v.mode === 'driving' ? isPaved : undefined);
      const car = v.mode === 'driving';
      // The buggy: along the roads round the garage; a horse: round its paddock spot.
      const cands = car ? [home, ...pointsAlong(GROUND_ROADS, home.x, home.z, PARK.carRadius, 5)] : ringPoints(home.x, home.z, PARK.horseRadius, 3);
      const free = (x: number, z: number, yaw: number): boolean =>
        !probe.overlaps(x, z, yaw) && taken.every((t) => Math.hypot(t.x - x, t.z - z) > PARK.apart);
      const pose = choosePark(probe, cands, car ? PARK.car : PARK.horse, PARK.seconds, home.yaw, free, car ? PARK.carRoad : 0);
      taken.push(pose);
      v.setParking(pose.x, pose.z, pose.yaw);
    }
  };

  // New session: everything back to its parking spot.
  removers.push(
    ctx.events.on('session:phase', (e) => {
      if (e.phase === 'title' || (e.phase === 'playing' && e.previous === 'title')) {
        if (active && ctx.player.vehicle === active.api) player.setVehicle(null);
        detach();
        measureParking();
        for (const v of list) v.park();
      }
    }),
  );

  return {
    api: {
      all: list.map((v) => v.api),
      board(id) {
        const v = list.find((c) => c.api.id === id);
        return v ? enter(v) : false;
      },
    },
    update(dt) {
      // Something else took the player out (respawn, session end, an activity): let go cleanly.
      if (active && ctx.player.vehicle !== active.api) detach();
      const playing = ctx.session.state.phase === 'playing';
      const input = ctx.input.state;
      for (const v of list) v.update(dt, v === active && playing ? input : null);
      for (const v of list) v.beforePlayer?.();
      hint.update(dt, input.device);
      if (!active || !playing) {
        hintTapped = false;
        return;
      }
      sinceEnter += dt;
      // Free ride hopped itself unstuck (QA7 M1): show how to reset for a few seconds.
      const n = active.api.unsticks;
      if (n !== seenUnsticks) {
        seenUnsticks = n;
        hint.show(6);
      }
      // R: an activity may take it first (the race pops the buggy back onto the track).
      if (input.respawnPressed || hintTapped) {
        hintTapped = false;
        if (!active.api.buggy?.onRescue?.()) rescue();
      }
      else if (input.usePressed && sinceEnter > 0.45) exit();
    },
    lateUpdate(dt) {
      for (const v of list) v.lateUpdate?.(dt, v === active && ctx.player.vehicle === v.api);
    },
    dispose() {
      hint.dispose();
      for (const r of removers) r();
      for (const v of list) v.dispose();
    },
  };
}
