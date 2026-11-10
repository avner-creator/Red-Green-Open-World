/**
 * Gear: things to wear (outfits, paints, trails, emotes) and putting equipped items on the player
 * and the buggy. Stub for now: the gear worker fills it in.
 */
import type { GameContext, GameSystem } from '../../types';

export function createGear(ctx: GameContext): GameSystem {
  void ctx;
  return {
    update() {
      // TODO(gear): register gear items with ctx.economy and show what is equipped.
    },
    dispose() {
      // nothing yet
    },
  };
}
