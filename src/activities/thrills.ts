/**
 * The thrill rides in one package: giant trampoline, bounce pads and rocket pads, sharing one
 * Flight runner (air tricks, exact arcs) and one confetti pool.
 */
import type { GameContext } from '../types';
import { Confetti } from './chests/confetti';
import { getFlight } from './flight';
import { createBouncePads } from './pads';
import { createRocketPads } from './rocket';
import type { RocketPads } from './rocket';
import { thrillSpots } from './thrillSpots';
import { createTrampoline } from './trampoline';

export interface Thrills {
  update(dt: number): void;
  dispose(): void;
}

export function createThrills(ctx: GameContext): Thrills {
  thrillSpots.length = 0;
  const flight = getFlight(ctx);
  const confetti = new Confetti();
  ctx.scene.add(confetti.group);
  const trampoline = createTrampoline(ctx, flight, confetti);
  const pads = createBouncePads(ctx, flight, trampoline);
  // The rocket site search raycasts against props, which only exist in the physics world after the
  // first step, so the rocket pads are built on the first update.
  let rocket: RocketPads | null = null;
  return {
    update(dt) {
      rocket ??= createRocketPads(ctx, flight, confetti);
      trampoline.update(dt);
      pads.update(dt);
      rocket.update(dt);
      flight.update(dt);
      confetti.update(dt);
    },
    dispose() {
      flight.dispose();
      trampoline.dispose();
      pads.dispose();
      rocket?.dispose();
      confetti.group.removeFromParent();
      confetti.dispose();
      thrillSpots.length = 0;
    },
  };
}
