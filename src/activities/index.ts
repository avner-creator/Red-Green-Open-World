/**
 * Activities: Glow Gems, the giant trampoline and the bounce pads.
 * One module per activity; pure logic lives in gemLogic.ts and bounceLogic.ts.
 */
import type { GameContext, GameSystem } from '../types';
import { createChests } from './chests';
import { createGear } from './gear';
import { createGems } from './gems';
import { createBouncePads } from './pads';
import { createTrampoline } from './trampoline';
import { createSkydive } from './skydive';

export async function createActivities(ctx: GameContext): Promise<GameSystem> {
  const gems = createGems(ctx);
  const trampoline = createTrampoline(ctx);
  const pads = createBouncePads(ctx);
  const chests = createChests(ctx);
  const gear = createGear(ctx);
  const skydive = createSkydive(ctx);
  return {
    update(dt) {
      if (ctx.session.state.phase === 'playing') {
        trampoline.update(dt);
        pads.update(dt);
      }
      gems.update(dt);
      chests.update(dt);
      gear.update(dt);
      skydive.update(dt);
    },
    dispose() {
      gems.dispose();
      trampoline.dispose();
      pads.dispose();
      chests.dispose();
      gear.dispose?.();
      skydive.dispose();
    },
  };
}
