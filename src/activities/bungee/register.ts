/** Bungee bridge: a ride (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createBungee } from '.';

export const order = 30;

export default function register(ctx: GameContext): GameSystem {
  return createBungee(ctx);
}
