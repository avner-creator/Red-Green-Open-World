/** Foam Lava obstacle course: a ride that drives the player (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createFoamLava } from '.';

export const order = 60;

export default function register(ctx: GameContext): GameSystem {
  return createFoamLava(ctx);
}
