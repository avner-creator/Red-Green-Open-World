/** Carnival Row booth games: a ride-like round that holds the player (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createCarnival } from '.';

export const order = 55;

export default function register(ctx: GameContext): GameSystem {
  return createCarnival(ctx);
}
