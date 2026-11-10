/**
 * Core gameplay systems: input, physics, player, camera, interactions, vehicles.
 * main.ts calls `input.update`, `physics.step`, then `system.update` each frame.
 */
import type { CameraApi, GameContext, GameSystem, InteractionApi, PlayerApi, VehiclesApi } from '../types';
import { createCameraRig } from './camera';
import { CHARACTERS } from './characters/catalog';
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
  // Long characters get a little more room; skills punch the FOV.
  const roomFor = (id: string): number => {
    const def = CHARACTERS.find((c) => c.id === id);
    return def ? Math.max(0, (def.length - 1.2) * 0.5) : 0;
  };
  camera.setFootExtraDistance(roomFor(player.api.characterId));
  ctx.events.on('player:character', (e) => camera.setFootExtraDistance(roomFor(e.id)));
  ctx.events.on('player:skill', (e) => {
    const punch = { dash: 7, superBounce: 5, doubleJump: 2.5, glide: 1.5, groundPound: -4 }[e.id];
    camera.kick(punch);
  });
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
        vehicles.lateUpdate(dt);
        interactions.update(dt);
        camera.update(dt);
      },
    },
  };
}
