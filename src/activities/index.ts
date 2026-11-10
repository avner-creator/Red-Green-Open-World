/**
 * Activities: Glow Gems, both-eye chests, the balloon skydive and the thrill rides (giant
 * trampoline, bounce pads, rocket pads). One module per activity; pure logic lives in *Logic.ts.
 */
import type { GameContext, GameSystem } from '../types';
import { createBungee } from './bungee';
import { createChests } from './chests';
import { createGear } from './gear';
import { createGems } from './gems';
import { createSecrets } from './secrets';
import { createSilly } from './silly';
import { createSkydive } from './skydive';
import { createThrills } from './thrills';

export { setLaunchGate } from './rocket';
export { thrillSpots } from './thrillSpots';
export { bungeeSpots } from './bungee';
export { sillySpots } from './silly';
export { secretRewardSpots } from './secrets';

export async function createActivities(ctx: GameContext): Promise<GameSystem> {
  const gems = createGems(ctx);
  const thrills = createThrills(ctx);
  const chests = createChests(ctx);
  const gear = createGear(ctx);
  const skydive = createSkydive(ctx);
  const bungee = createBungee(ctx);
  const silly = createSilly(ctx);
  const secrets = createSecrets(ctx);
  return {
    update(dt) {
      // Rides first (they may start/finish a flight and pose the avatar), then the pickup checks
      // see the player's final position for this frame.
      if (ctx.session.state.phase === 'playing') {
        thrills.update(dt);
      }
      skydive.update(dt);
      bungee.update(dt);
      silly.update(dt);
      gems.update(dt);
      chests.update(dt);
      secrets.update(dt); // after chests: arrows read the placed chest keys
      gear.update(dt); // last: dresses the player in its final pose for this frame
    },
    dispose() {
      gems.dispose();
      thrills.dispose();
      chests.dispose();
      gear.dispose?.();
      skydive.dispose();
      bungee.dispose();
      silly.dispose();
      secrets.dispose();
    },
  };
}
