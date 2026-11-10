/** Wayfinding + help: icon compass, controls card (H / "?" / pause), mode hint strips. */
import type { GameContext } from '../types';
import { createCompass } from './compass';
import { createControlsOverlay, createControlsScreen } from './controlsCard';
import { h } from './dom';
import { icon } from './icons';
import { createModeHints } from './modeHints';
import type { Screen } from './screens';
import { injectWayfindingCss } from './wayfindingCss';

export interface Wayfinding {
  /** Pause-menu "Controls" screen; add it to the screen list. */
  screen: Screen;
  update(dt: number): void;
}

export interface WayfindingHooks {
  /** The pause screen element: a "Controls" button is added to its button grid. */
  pause: Screen;
  /** Push a screen on the menu stack. */
  open(screen: Screen): void;
  /** Pop the menu stack. */
  back(): void;
}

export function createWayfinding(ctx: GameContext, hooks: WayfindingHooks): Wayfinding {
  injectWayfindingCss();
  const compass = createCompass(ctx);
  const overlay = createControlsOverlay(ctx);
  const strips = createModeHints(ctx);
  const hud = h('div', 'wf-hud', {}, compass.el, overlay.button, strips.el, overlay.card);
  ctx.uiRoot.append(hud);
  ctx.uiRoot.dataset.mode = 'walk';

  const screen = createControlsScreen(ctx, hooks.back);
  const grid = hooks.pause.el.querySelector('.grid2');
  const b = h('button', 'b d tile', { type: 'button', 'aria-label': 'Controls', 'data-testid': 'pause-controls', style: 'grid-column:1/3' }, h('span', 'pair', {}, icon('stick'), icon('hand')), '?');
  b.addEventListener('click', () => hooks.open(screen));
  grid?.append(b);

  return {
    screen,
    update(dt: number): void {
      compass.update();
      overlay.update();
      strips.update(dt);
    },
  };
}
