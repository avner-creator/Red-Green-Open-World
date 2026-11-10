/**
 * Vehicles manager: E to get in (interaction prompt) and out (hop to a free side), R to unstick,
 * chase camera on/off, parking on a new session. Kind-agnostic: anything implementing
 * `VehicleInternal` (the buggy, the two ranch horses) plugs in here.
 */
import * as THREE from 'three';
import type { ExternalController, GameContext, InteractionApi, VehiclesApi } from '../../types';
import type { CameraInternal } from '../camera';
import type { PlayerInternal } from '../player';
import { createCar } from './car';
import { createHorse } from './horse';
import type { VehicleInternal } from './types';

/**
 * The two paddock horses: offsets from the ranch anchor (metres, world axes), yaw offset, coat,
 * mane. Coats are picked for the red/green channels against grass (dark in R, bright in G): a
 * chestnut is bright in R and dark in G, the grey is bright in both; manes contrast with coats.
 */
const HORSES = [
  { id: 'horse-maple', dx: -3.2, dz: -3, dyaw: 0, coat: 0xc8622c, mane: 0xf4eee0 },
  { id: 'horse-pebble', dx: 3.6, dz: 2.8, dyaw: 2.5, coat: 0xf1eee7, mane: 0x34302d },
] as const;

export interface VehiclesInternal {
  api: VehiclesApi;
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
  const list: VehicleInternal[] = [createCar(ctx, 'buggy', () => camera.api)];
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

  const enter = (v: VehicleInternal): void => {
    if (active || ctx.player.mode !== 'walk') return;
    active = v;
    sinceEnter = 0;
    player.setVehicle(v.api, v.mode, v.seat, v.seatAnim);
    v.onEnter();
    camera.setChase(v.chase);
    ctx.audio.play('jump');
  };

  /** Detach from the active vehicle (camera, engine); the player is handled by the caller. */
  const detach = (): VehicleInternal | null => {
    const v = active;
    if (!v) return null;
    active = null;
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
    if (active?.rescueKeepsRider) {
      // Horse: horse and rider together on the last safe spot; the rider stays in the saddle.
      active.rescue();
      ctx.events.emit('player:respawn', {});
      return;
    }
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

  // New session: everything back to its parking spot.
  removers.push(
    ctx.events.on('session:phase', (e) => {
      if (e.phase === 'title' || (e.phase === 'playing' && e.previous === 'title')) {
        if (active && ctx.player.vehicle === active.api) player.setVehicle(null);
        detach();
        for (const v of list) v.park();
      }
    }),
  );

  return {
    api: { all: list.map((v) => v.api) },
    update(dt) {
      // Something else took the player out (respawn, session end, an activity): let go cleanly.
      if (active && ctx.player.vehicle !== active.api) detach();
      const playing = ctx.session.state.phase === 'playing';
      const input = ctx.input.state;
      for (const v of list) v.update(dt, v === active && playing ? input : null);
      for (const v of list) v.beforePlayer?.();
      if (!active || !playing) return;
      sinceEnter += dt;
      if (input.respawnPressed) rescue();
      else if (input.usePressed && sinceEnter > 0.45) exit();
    },
    lateUpdate(dt) {
      for (const v of list) v.lateUpdate?.(dt, v === active && ctx.player.vehicle === v.api);
    },
    dispose() {
      for (const r of removers) r();
      for (const v of list) v.dispose();
    },
  };
}
