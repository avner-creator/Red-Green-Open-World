/**
 * Activities: Glow Gems, both-eye chests, the balloon skydive and the thrill rides (giant
 * trampoline, bounce pads, rocket pads). One module per activity; pure logic lives in *Logic.ts.
 */
import type { GameContext, GameSystem } from '../types';
import { createChests } from './chests';
import { createGems } from './gems';
import { createSecrets } from './secrets';
import { createSkydive } from './skydive';
import { createThrills } from './thrills';

export { setLaunchGate } from './rocket';
export { thrillSpots } from './thrillSpots';
export { secretRewardSpots } from './secrets';

export async function createActivities(ctx: GameContext): Promise<GameSystem> {
  const gems = createGems(ctx);
  const thrills = createThrills(ctx);
  const chests = createChests(ctx);
  const skydive = createSkydive(ctx);
  const secrets = createSecrets(ctx);
  return {
    update(dt) {
      // Rides first (they may start/finish a flight and pose the avatar), then the pickup checks
      // see the player's final position for this frame.
      if (ctx.session.state.phase === 'playing') {
        thrills.update(dt);
      }
      skydive.update(dt);
      gems.update(dt);
      chests.update(dt);
      secrets.update(dt); // after chests: arrows read the placed chest keys
    },
    dispose() {
      gems.dispose();
      thrills.dispose();
      chests.dispose();
      skydive.dispose();
      secrets.dispose();
    },
  };
}
