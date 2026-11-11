/** Buggy race: a ride that seats the player in the buggy (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createRace } from '.';

export const order = 80;

export default function register(ctx: GameContext): GameSystem {
  return createRace(ctx);
}
