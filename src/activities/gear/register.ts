/** Outfits, trails, emotes: last, dresses the player in its final pose for this frame. Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createGear } from '.';

export const order = 200;

export default function register(ctx: GameContext): GameSystem {
  return createGear(ctx);
}
