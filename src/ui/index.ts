/**
 * UI system: title, HUD, tutorial, pause, end screen, grown-up gate + settings, credits.
 * All DOM inside `ctx.uiRoot`. See docs/GAME_DESIGN.md.
 */
import type { GameContext, SessionPhase, UiApi } from '../types';
import { injectCss } from './css';
import { createEconTracker } from './econState';
import { createGate } from './gateScreen';
import type { GateScreen } from './gateScreen';
import { createHud } from './hud';
import { createNav } from './nav';
import { createCredits, createEnd, createPause, createTitle } from './screens';
import type { Actions, Screen } from './screens';
import { createSettings } from './settingsScreen';
import { createShop } from './shop';
import { createTutorial } from './tutorial';
import { createWayfinding } from './wayfinding';

export function createUi(ctx: GameContext): UiApi {
  injectCss();
  const root = ctx.uiRoot;
  root.classList.add('rg');

  let calibrating = false;
  /** The Gear Shack is open: the session is paused and the shop is the base screen. */
  let shopOpen = false;
  const tracker = createEconTracker(ctx);
  const stack: Screen[] = [];
  let shown: Screen | null = null;
  let wasMenu = false;

  const play = (): void => {
    ctx.audio.unlock();
    if (ctx.session.state.phase !== 'title') ctx.session.toTitle();
    ctx.session.start();
    capture();
  };
  const capture = (): void => {
    try {
      (ctx.input.capturePointer() as unknown as Promise<void> | undefined)?.catch?.(() => {});
    } catch {
      /* pointer lock can be refused (headless, no gesture): ignore */
    }
  };
  const resume = (): void => {
    ctx.session.resume();
    capture();
  };
  const closeShop = (): void => {
    if (!shopOpen) return;
    shopOpen = false;
    if (ctx.session.state.phase === 'paused') resume();
    else render();
  };
  const pop = (): void => {
    stack.pop();
    render();
  };
  const actions: Actions = {
    play,
    resume,
    restart: play,
    toTitle: () => ctx.session.toTitle(),
    openGate: () => {
      gate.reset();
      stack.push(gate);
      render();
    },
    openCredits: () => {
      stack.push(credits);
      render();
    },
    openWardrobe: () => {
      stack.push(wardrobe);
      render();
    },
  };

  const title = createTitle(ctx, actions);
  const pause = createPause(actions);
  const end = createEnd(ctx, actions, tracker);
  const shop = createShop(ctx, 'shop', closeShop);
  const wardrobe = createShop(ctx, 'wardrobe', pop);
  const credits = createCredits({ back: pop });
  const settings = createSettings(ctx, {
    onClose: pop,
    onCalibrate: () => {
      calibrating = true;
      render();
      ctx.vision.openCalibration(() => {
        calibrating = false;
        render();
      });
    },
  });
  const gate: GateScreen = createGate(() => {
    stack.pop();
    stack.push(settings);
    render();
  }, pop);
  const wayfinding = createWayfinding(ctx, { pause, open: (s) => (stack.push(s), render()), back: pop });
  const all: Screen[] = [title, pause, end, credits, settings, gate, shop, wardrobe, wayfinding.screen];
  for (const s of all) root.append(s.el);
  const hud = createHud(ctx, tracker);
  const tutorial = createTutorial(ctx);

  const phase = (): SessionPhase => ctx.session.state.phase;
  const base = (): Screen | null => {
    const p = phase();
    return p === 'title' ? title : p === 'paused' ? (shopOpen ? shop : pause) : p === 'ended' ? end : null;
  };
  const top = (): Screen | null => {
    if (calibrating) return null;
    return stack.length ? (stack[stack.length - 1] as Screen) : base();
  };
  const menuOpen = (): boolean => phase() !== 'playing' || calibrating;

  function render(): void {
    const t = top();
    for (const s of all) s.el.classList.toggle('on', s === t);
    // The calibration pattern needs the whole screen: no HUD on top of it.
    hud.setVisible((phase() === 'playing' || phase() === 'paused') && !calibrating);
    root.dataset.phase = phase();
    const open = menuOpen();
    if (open && !wasMenu) {
      try {
        ctx.input.releasePointer();
      } catch {
        /* ignore */
      }
    }
    wasMenu = open;
    if (t && t !== shown) t.onShow()?.focus({ preventScroll: true });
    shown = t;
  }

  const nav = createNav({
    root,
    layer: () => top()?.el ?? null,
    back: () => {
      if (stack.length) pop();
      else if (shopOpen) closeShop();
      else if (phase() === 'paused') resume();
    },
    start: () => {
      if (stack.length) pop();
      else if (shopOpen) closeShop();
      else if (phase() === 'paused') resume();
    },
    tab: (dir) => {
      const t = top();
      if (t === shop) shop.tab(dir);
    },
  });

  ctx.events.on('shop:open', () => {
    if (phase() !== 'playing' || calibrating) return;
    shopOpen = true;
    ctx.session.pause();
  });

  ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'paused') shopOpen = false;
    stack.length = 0;
    shown = null;
    nav.notePhaseChange();
    if (e.phase === 'ended') end.fill();
    if (e.phase === 'playing' && e.previous !== 'paused') tutorial.start();
    if (e.phase === 'title' || e.phase === 'ended') tutorial.stop();
    hud.update(0);
    render();
  });
  render();

  return {
    update(dt: number): void {
      const pad = nav.poll(dt);
      if (shown === gate) gate.update(dt, pad.aHeld);
      if (shown === settings) settings.update(dt, pad.aHeld);
      if (shown === shop) shop.update(dt);
      if (shown === wardrobe) wardrobe.update(dt);
      if (shown === title) title.wallet.update(dt);
      hud.update(dt);
      wayfinding.update(dt);
      tutorial.update(dt, phase() === 'playing');
    },
    get menuOpen(): boolean {
      return menuOpen();
    },
  };
}
