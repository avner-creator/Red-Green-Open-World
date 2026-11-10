/** Balloon skydive: a ride (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createSkydive } from '.';

export const order = 20;

export default function register(ctx: GameContext): GameSystem {
  return createSkydive(ctx);
}
