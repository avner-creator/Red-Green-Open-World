/** Buggy workshop (upgrades on the garage turntable): before the race, which reads the fitted parts. Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createWorkshop } from '.';

export const order = 78;

export default function register(ctx: GameContext): GameSystem {
  return createWorkshop(ctx);
}
