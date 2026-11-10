/**
 * Vehicles manager: E to get in (interaction prompt) and out (hop to a free side), R to unstick,
 * chase camera on/off, parking on a new session. Kind-agnostic: anything implementing
 * `VehicleInternal` (the buggy now, a horse later) plugs in here.
 */
import * as THREE from 'three';
import type { ExternalController, GameContext, InteractionApi } from '../../types';
import type { CameraInternal } from '../camera';
import type { PlayerInternal } from '../player';
import { createCar } from './car';
import type { VehicleInternal, VehiclesPublic } from './types';

export interface VehiclesInternal {
  api: VehiclesPublic;
  update(dt: number): void;
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
  const removers: (() => void)[] = [];
  let active: VehicleInternal | null = null;
  let sinceEnter = 0;

  const enter = (v: VehicleInternal): boolean => {
    if (active || ctx.player.mode !== 'walk') return false;
    active = v;
    sinceEnter = 0;
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
        radius: 3.1,
        icon: v.icon,
        enabled: () => active === null,
        onUse: () => {
          enter(v);
        },
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
      if (!active || !playing) return;
      sinceEnter += dt;
      if (input.respawnPressed) rescue();
      else if (input.usePressed && sinceEnter > 0.45) exit();
    },
    dispose() {
      for (const r of removers) r();
      for (const v of list) v.dispose();
    },
  };
}
