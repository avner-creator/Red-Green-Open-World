/**
 * Activities: Glow Gems, both-eye chests, the balloon skydive and the thrill rides (giant
 * trampoline, bounce pads, rocket pads). One module per activity; pure logic lives in *Logic.ts.
 */
import type { GameContext, GameSystem } from '../types';
import { createBubbleBall } from './bubbleball';
import { createChests } from './chests';
import { createDinoSumo } from './dinosumo';
import { createGems } from './gems';
import { createSkydive } from './skydive';
import { createThrills } from './thrills';

export { setLaunchGate } from './rocket';
export { thrillSpots } from './thrillSpots';

export async function createActivities(ctx: GameContext): Promise<GameSystem> {
  const gems = createGems(ctx);
  const thrills = createThrills(ctx);
  const chests = createChests(ctx);
  const skydive = createSkydive(ctx);
  const bubbleBall = createBubbleBall(ctx);
  const dinoSumo = createDinoSumo(ctx);
  return {
    update(dt) {
      // Rides first (they may start/finish a flight and pose the avatar), then the pickup checks
      // see the player's final position for this frame.
      if (ctx.session.state.phase === 'playing') {
        thrills.update(dt);
      }
      skydive.update(dt);
      bubbleBall.update(dt);
      dinoSumo.update(dt);
      gems.update(dt);
      chests.update(dt);
    },
    dispose() {
      gems.dispose();
      thrills.dispose();
      chests.dispose();
      skydive.dispose();
      bubbleBall.dispose?.();
      dinoSumo.dispose?.();
    },
  };
}
