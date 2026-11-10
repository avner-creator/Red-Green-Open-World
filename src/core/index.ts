/**
 * Core gameplay systems: input, physics, player, camera, interactions, vehicles.
 * main.ts calls `input.update`, `physics.step`, then `system.update` each frame.
 */
import type { CameraApi, GameContext, GameSystem, InteractionApi, PlayerApi, VehiclesApi } from '../types';
import { createCameraRig } from './camera';
import { createInteractions } from './interactions';
import { createPlayer } from './player';
import { createVehicles } from './vehicles';

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
  const vehicles = createVehicles(ctx, player, camera, interactions.api);

  return {
    player: player.api,
    cameraRig: camera.api,
    interactions: interactions.api,
    vehicles: vehicles.api,
    system: {
      update(dt) {
        // Vehicles first: the rider then sits exactly where the vehicle is this frame.
        vehicles.update(dt);
        player.update(dt);
        interactions.update(dt);
        camera.update(dt);
      },
    },
  };
}
