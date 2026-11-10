/**
 * Core gameplay systems: input, physics, player, camera, interactions, vehicles.
 * main.ts calls `input.update`, `physics.step`, then `system.update` each frame.
 */
import type { CameraApi, GameContext, GameSystem, InteractionApi, PlayerApi, VehiclesApi } from '../types';
import { createCameraRig } from './camera';
import { createInteractions } from './interactions';
import { createPlayer } from './player';

export { createInput } from './input';
export { createPhysics } from './physics';

export interface PlayerSystems {
  player: PlayerApi;
  cameraRig: CameraApi;
  interactions: InteractionApi;
  vehicles: VehiclesApi;
  system: GameSystem;
}

export async function createPlayerSystems(ctx: GameContext): Promise<PlayerSystems> {
  // The camera is created after the player but the player needs its yaw: late-bound getter.
  let cameraYaw = (): number => 0;
  const player = await createPlayer(ctx, () => cameraYaw());
  ctx.player = player.api;
  const camera = createCameraRig(ctx);
  cameraYaw = () => camera.api.yaw;
  player.onTeleport = (yaw) => camera.snap(yaw);
  const interactions = createInteractions(ctx);
  // Cars and horse arrive in M2 (player.setVehicle is ready for them).
  const vehicles: VehiclesApi = { all: [] };

  return {
    player: player.api,
    cameraRig: camera.api,
    interactions: interactions.api,
    vehicles,
    system: {
      update(dt) {
        player.update(dt);
        interactions.update(dt);
        camera.update(dt);
      },
    },
  };
}
