/**
 * The thrill rides in one package: giant trampoline, bounce pads and rocket pads, sharing one
 * Flight runner (air tricks, exact arcs) and one confetti pool.
 */
import type { GameContext } from '../types';
import type * as THREE from 'three';
import { ThrillConfetti } from './thrillConfetti';
import { getFlight } from './flight';
import { createBouncePads } from './pads';
import { createRocketPads, setLaunchGate } from './rocket';
import type { RocketInfo, RocketPads } from './rocket';
import { thrillSpots } from './thrillSpots';
import { createTrampoline } from './trampoline';

/** Test hook (`window.__rgThrills`, only with `?test=1`). */
export interface ThrillsTestApi {
  /** Net and pad coordinates (null until the first playing frame builds them). */
  rocket(): RocketInfo | null;
  /** Launch rocket pad `i` as if stepped on. */
  launchRocket(i: number): void;
  /** Trampoline mat centre (world, mat surface height). */
  trampoline(): THREE.Vector3;
  /** Open (true) or close (false) the rocket launch gate. */
  setGate(open: boolean): void;
  spots(): { tag: string; x: number; y: number; z: number }[];
}

declare global {
  interface Window {
    __rgThrills?: ThrillsTestApi;
  }
}

export interface Thrills {
  update(dt: number): void;
  dispose(): void;
}

export function createThrills(ctx: GameContext): Thrills {
  thrillSpots.length = 0;
  const flight = getFlight(ctx);
  const confetti = new ThrillConfetti();
  ctx.scene.add(confetti.group);
  const trampoline = createTrampoline(ctx, flight, confetti);
  const pads = createBouncePads(ctx, flight, trampoline);
  // The rocket site search raycasts against props, which only exist in the physics world after the
  // first step, so the rocket pads are built on the first update.
  let rocket: RocketPads | null = null;
  if (ctx.testMode && typeof window !== 'undefined') {
    window.__rgThrills = {
      rocket: () => rocket?.info ?? null,
      launchRocket: (i) => rocket?.launchFrom(i),
      setGate: (open) => setLaunchGate(open ? null : () => false),
      trampoline: () => trampoline.centre.clone(),
      spots: () => thrillSpots.map((s) => ({ tag: s.tag, x: s.position.x, y: s.position.y, z: s.position.z })),
    };
  }
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
