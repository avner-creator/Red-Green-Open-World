/** Sky rides (plane contest, dragon tour): rides that fly the player (update before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createSkyRides } from '.';

export const order = 70;

export default function register(ctx: GameContext): GameSystem {
  return createSkyRides(ctx);
}
