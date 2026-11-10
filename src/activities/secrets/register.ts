/** Secret paths and vaults: after chests (the arrows read the placed chest keys). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createSecrets } from '.';

export const order = 120;

export default function register(ctx: GameContext): GameSystem {
  return createSecrets(ctx);
}
