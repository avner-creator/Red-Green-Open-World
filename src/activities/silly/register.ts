/** Silly Zone: launches the player (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createSilly } from '.';

export const order = 40;

export default function register(ctx: GameContext): GameSystem {
  return createSilly(ctx);
}
