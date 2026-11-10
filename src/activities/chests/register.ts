/** Both-eye chests: key pickup after the rides have moved the player. Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createChests } from '.';

export const order = 110;

export default function register(ctx: GameContext): GameSystem {
  return createChests(ctx);
}
