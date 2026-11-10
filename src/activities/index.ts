/**
 * Activities: Glow Gems, the giant trampoline and the bounce pads.
 * One module per activity; pure logic lives in gemLogic.ts and bounceLogic.ts.
 */
import type { GameContext, GameSystem } from '../types';
import { createChests } from './chests';
import { createGems } from './gems';
import { createThrills } from './thrills';

export { setLaunchGate } from './rocket';
export { thrillSpots } from './thrillSpots';

export async function createActivities(ctx: GameContext): Promise<GameSystem> {
  const gems = createGems(ctx);
  const thrills = createThrills(ctx);
  const chests = createChests(ctx);
  return {
    update(dt) {
      if (ctx.session.state.phase === 'playing') {
        thrills.update(dt);
      }
      gems.update(dt);
      chests.update(dt);
    },
    dispose() {
      gems.dispose();
      thrills.dispose();
      chests.dispose();
    },
  };
}
