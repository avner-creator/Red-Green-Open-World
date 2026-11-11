/**
 * Sky rides (Carnival Island stream O): the stunt-plane sky contest at the airstrip and the
 * friendly dragon at its roost. Both share one arcade flight controller (`pilot.ts` +
 * `flightModel.ts`), so they never take the player from each other or from another ride.
 */
import type * as THREE from 'three';
import type { GameContext, GameSystem } from '../../types';
import { createDragonRide } from './dragon';
import type { DragonRide } from './dragon';
import { getSkyPilot } from './pilot';
import { createPlaneRide } from './plane';
import type { PlaneRide } from './plane';
import { createSkyHud } from './skyHud';

/** `window.__rgSky` in test mode (Playwright drives the rides through it). */
export interface SkyTestApi {
  plane: PlaneRide;
  dragon: DragonRide;
  /** Can a sky ride take the player right now (on foot, not on another ride)? */
  canTake(): boolean;
  /** Every weak-eye-only object the sky rides own (channel tests toggle them). */
  weakObjects(): THREE.Object3D[];
  setWeakVisible(v: boolean): void;
}

declare global {
  interface Window {
    __rgSky?: SkyTestApi;
  }
}

export function createSkyRides(ctx: GameContext): GameSystem {
  const hud = createSkyHud(ctx.uiRoot);
  const plane = createPlaneRide(ctx, hud);
  const dragon = createDragonRide(ctx, hud);

  if (ctx.testMode && typeof window !== 'undefined') {
    const weakObjects = (): THREE.Object3D[] => [...(plane.contest?.weakObjects ?? []), ...dragon.weakObjects];
    window.__rgSky = {
      plane,
      dragon,
      canTake: () => getSkyPilot(ctx).canTake(),
      weakObjects,
      setWeakVisible(v) {
        for (const o of weakObjects()) o.visible = v;
      },
    };
  }

  return {
    update(dt) {
      plane.update(dt);
      dragon.update(dt);
    },
    dispose() {
      plane.dispose();
      dragon.dispose();
      getSkyPilot(ctx).dispose();
      hud.dispose();
      if (typeof window !== 'undefined' && window.__rgSky?.plane === plane) delete window.__rgSky;
    },
  };
}
