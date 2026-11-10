/**
 * UI system: title, HUD, tutorial, pause, end screen, grown-up gate + settings, credits.
 * All DOM inside `ctx.uiRoot`. See docs/GAME_DESIGN.md.
 */
import type { GameContext, SessionPhase, UiApi } from '../types';
import { injectCss } from './css';
import { h } from './dom';
import { icon } from './icons';
import { setCharacterAccess } from './characterAccess';
import { applyStoredCharacter, createCharacterSelect } from './characterSelect';
import { createGlassesSummary } from './glasses/summaryScreen';
import { createGate } from './gateScreen';
import type { GateScreen } from './gateScreen';
import { createHud } from './hud';
import { createNav } from './nav';
import { createCredits, createEnd, createPause, createTitle } from './screens';
import type { Actions, Screen } from './screens';
import { createSettings } from './settingsScreen';
import { createSkillChip } from './skillButton';
import { createTouchUi } from './touch';
import { createTutorial } from './tutorial';
import { createWayfinding } from './wayfinding';

export function createUi(ctx: GameContext): UiApi {
  injectCss();
  const root = ctx.uiRoot;
  root.classList.add('rg');

  let calibrating = false;
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
    choose: () => {
      ctx.audio.unlock();
      openSelect();
    },
    openCredits: () => {
      stack.push(credits);
      render();
    },
  };

  const openSelect = (): void => {
    stack.push(select);
    render();
  };
  const title = createTitle(actions);
  const pause = createPause(actions);
  const end = createEnd(ctx, actions);
  const credits = createCredits({ back: pop });
  const settings = createSettings(ctx, {
    onClose: pop,
    onSummary: () => (stack.push(glassesSummary), render()),
    onCalibrate: () => {
      calibrating = true;
      render();
      ctx.vision.openCalibration(() => {
        calibrating = false;
        render();
      });
    },
  });
  const glassesSummary = createGlassesSummary(ctx, { back: pop });
  const gate: GateScreen =createGate(() => {
    stack.pop();
    stack.push(settings);
    render();
  }, pop);
  const select = createCharacterSelect(ctx, {
    back: pop,
    go: () => (phase() === 'paused' ? resume() : play()),
  });
  // Pause menu: change hero (same screen as the title's).
  const heroTile = h('button', 'b tile d', { type: 'button', 'aria-label': 'Hero', 'data-testid': 'pause-hero' }, h('span', 'pair', {}, icon('grownup'), icon('sparkle')), 'Hero');
  heroTile.addEventListener('click', openSelect);
  pause.el.querySelector('.grid2')?.append(heroTile);
  applyStoredCharacter(ctx);
  // Tests plug a fake wallet in through this hook (the economy calls setCharacterAccess directly).
  if (ctx.testMode) (window as unknown as { __rgSetCharacterAccess?: typeof setCharacterAccess }).__rgSetCharacterAccess = setCharacterAccess;
  const wayfinding = createWayfinding(ctx, { pause, open: (s) => (stack.push(s), render()), back: pop });
  const all: Screen[] = [title, pause, end, credits, settings, gate, select, wayfinding.screen];
  for (const s of all) root.append(s.el);
  const hud = createHud(ctx);
  const skillChip = createSkillChip(ctx);
  const tutorial = createTutorial(ctx);
  const touch = createTouchUi(ctx);
  all.push(glassesSummary);
  root.append(glassesSummary.el);

  const phase = (): SessionPhase => ctx.session.state.phase;
  const base = (): Screen | null => {
    const p = phase();
    return p === 'title' ? title : p === 'paused' ? pause : p === 'ended' ? end : null;
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
    if (shown === select && t !== select) select.leave();
    if (t && t !== shown) t.onShow()?.focus({ preventScroll: true });
    shown = t;
  }

  const nav = createNav({
    root,
    layer: () => top()?.el ?? null,
    back: () => {
      if (stack.length) pop();
      else if (phase() === 'paused') resume();
    },
    start: () => {
      if (stack.length) pop();
      else if (phase() === 'paused') resume();
    },
  });

  ctx.events.on('session:phase', (e) => {
    select.leave();
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
      hud.update(dt);
      skillChip.update();
      if (shown === select) select.update();
      wayfinding.update(dt);
      tutorial.update(dt, phase() === 'playing');
      touch.update(dt, phase() === 'playing' && !calibrating);
    },
    get menuOpen(): boolean {
      return menuOpen();
    },
  };
}
