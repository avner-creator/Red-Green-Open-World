/**
 * Test-only hooks for the per-layer fade, Auto challenge and layer masks: `window.__rgChallenge`,
 * installed by `createVision` only when `ctx.testMode` (`?test=1`). Nothing here is reachable in
 * normal play, including the mask debug view.
 */
import type * as THREE from 'three';
import { VisionLayer } from '../types';
import type { ChallengeModifiers } from '../types';
import type { DebugView, DichopticPass, LayerCoverage } from './DichopticPass';
import type { ChallengeDriver, ChallengeDriverState } from './challenge/driver';
import type { LayerFade } from './challenge/fade';
import type { EffectiveUniforms } from './math';

export interface ChallengeTestApi {
  /** The numbers in the compositor shader after the last render. */
  effective(): EffectiveUniforms;
  /** Staircase internals (level, streak, drought timer, steps, phase, enabled, forced). */
  staircase(): ChallengeDriverState;
  /** Where the eased modifiers are heading. */
  target(): ChallengeModifiers;
  /** Current per-layer fade values. */
  fades(): { weak: number; strong: number };
  /** Coverage of a layer's mask from the last render ('weak' / 'strong' or a VisionLayer). */
  layerCoverage(layer: 'weak' | 'strong' | VisionLayer): LayerCoverage;
  /** Show a layer's mask as grey instead of the game frame (default 'off'). */
  setDebugView(view: DebugView): void;
  /** Advance fades and challenge easing by `seconds` without rendering. */
  advance(seconds: number): void;
  /** Jump the challenge easing to its target. */
  settle(): void;
}

declare global {
  interface Window {
    __rgChallenge?: ChallengeTestApi;
  }
}

export function installChallengeHooks(deps: {
  renderer: THREE.WebGLRenderer;
  pass: DichopticPass;
  driver: ChallengeDriver;
  fades: { weak: LayerFade; strong: LayerFade };
}): void {
  const { renderer, pass, driver, fades } = deps;
  window.__rgChallenge = {
    effective: () => pass.effective(),
    staircase: () => driver.state(),
    target: () => ({ ...driver.target() }),
    fades: () => ({ weak: fades.weak.value, strong: fades.strong.value }),
    layerCoverage(layer) {
      const which = layer === 'strong' || layer === VisionLayer.StrongOnly ? 'strong' : 'weak';
      return pass.readCoverage(renderer, which);
    },
    setDebugView(view) {
      pass.debugView = view === 'weak' || view === 'strong' ? view : 'off';
    },
    advance(seconds) {
      fades.weak.update(seconds);
      fades.strong.update(seconds);
      driver.update(seconds);
    },
    settle: () => driver.settle(),
  };
}
