/** Scoops ice-cream shop: after the pickups (its own E prompt), before gear dresses the player. Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createScoops } from '.';

export const order = 150;

export default function register(ctx: GameContext): GameSystem {
  return createScoops(ctx);
}
