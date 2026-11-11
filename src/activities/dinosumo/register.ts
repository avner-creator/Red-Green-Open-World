/** Dino Sumo (bumper arena): a ride that suits the player up (updates before the pickup checks). Discovered by `src/activities/index.ts`. */
import type { GameContext, GameSystem } from '../../types';
import { createDinoSumo } from '.';

export const order = 52;

export default function register(ctx: GameContext): GameSystem {
  return createDinoSumo(ctx);
}
