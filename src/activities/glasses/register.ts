/**
 * Glasses mechanics: the last pickup-style system, created after every other attraction (only
 * gear, which adds no colliders, comes later). Its site probe runs on the first update anyway,
 * once every attraction has been created. Discovered by `src/activities/index.ts`.
 */
import type { GameContext, GameSystem } from '../../types';
import { createGlasses } from '.';

export const order = 190;

export default function register(ctx: GameContext): GameSystem {
  return createGlasses(ctx);
}
