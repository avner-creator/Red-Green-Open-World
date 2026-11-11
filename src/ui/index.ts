/**
 * UI system: title, HUD, tutorial, pause, end screen, grown-up gate + settings, credits.
 * All DOM inside `ctx.uiRoot`. See docs/GAME_DESIGN.md.
 */
import type { GameContext, SessionPhase, UiApi } from '../types';
import { injectCss } from './css';
import { createEconTracker } from './econState';
import { h } from './dom';
import { icon } from './icons';
import { setCharacterAccess } from './characterAccess';
import { applyStoredCharacter, createCharacterSelect, setWardrobeHook } from './characterSelect';
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
import { dialogOpen, typingTarget } from './gameKeys';
import { canDressNow, createDressingRoom, createSeenStore, createWardrobeButton, setWardrobeOpener } from './wardrobe';

/** Title camera: close and low, the hero fills the middle of the screen. */
const TITLE_CAMERA = { distance: 6.4, height: 0.9, fov: 46 };

export function createUi(ctx: GameContext): UiApi {
  injectCss();
  const root = ctx.uiRoot;
  root.classList.add('rg');

  let calibrating = false;
  /**
   * The dressing room was opened from play (HUD button, I key, D-pad left, Gear Shack kiosk): the
   * session is paused and the dressing room is the base screen; closing it resumes play.
   */
  let shopOpen = false;
  const tracker = createEconTracker(ctx);
  const stack: Screen[] = [];
  let shown: Screen | null = null;
  let wasMenu = false;
  /** The title's close-up camera override is on. */
  let titleCam = false;

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
    choose: () => {
      ctx.audio.unlock();
      openSelect();
    },
    openCredits: () => {
      stack.push(credits);
      render();
    },
    openWardrobe: () => {
      if (top() === dress) return;
      stack.push(dress);
      render();
    },
    openHelp: () => {
      stack.push(wayfinding.screen);
      render();
    },
  };

  const openSelect = (): void => {
    stack.push(select);
    render();
  };
  const title = createTitle(ctx, actions);
  const pause = createPause(actions);
  const end = createEnd(ctx, actions, tracker, () => hud.pass.card());
  const seen = createSeenStore();
  ctx.events.on('profile:reset', () => seen.clear());
  const dress = createDressingRoom(ctx, seen, () => {
    if (stack[stack.length - 1] === dress) pop();
    else closeShop();
  });
  /** Open the dressing room from play: pause, dressing room on top; closing resumes. */
  const dressFromPlay = (): void => {
    if (!canDressNow(ctx) || calibrating || ctx.ui.menuOpen) return;
    // Same path as the Gear Shack kiosk: pauses with the dressing room on top, and Pip's how-to.
    ctx.events.emit('shop:open', {});
  };
  setWardrobeOpener(() => {
    if (phase() === 'playing') dressFromPlay();
    else actions.openWardrobe();
  });
  const credits = createCredits({ back: pop });
  const settings = createSettings(ctx, {
    onClose: pop,
    onCredits: () => {
      stack.push(credits);
      render();
    },
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
  const gate: GateScreen = createGate(() => {
    stack.pop();
    stack.push(settings);
    render();
  }, pop);
  const select = createCharacterSelect(ctx, {
    back: pop,
    go: () => (phase() === 'paused' ? resume() : play()),
  });
  // Hero select "dress up": an owned hero becomes the worn one, then the dressing room opens on top
  // (closing it returns to the select). A locked hero opens it for the current hero.
  setWardrobeHook((heroId) => {
    if (ctx.profile.owns(heroId) && ctx.profile.equipped('character') !== heroId) ctx.profile.equip('character', heroId);
    actions.openWardrobe();
  });
  // Pause menu: change hero (same screen as the title's).
  const heroTile = h('button', 'b tile d', { type: 'button', 'aria-label': 'Hero', 'data-testid': 'pause-hero' }, h('span', 'pair', {}, icon('grownup'), icon('sparkle')), 'Hero');
  heroTile.addEventListener('click', openSelect);
  // Right after Resume: row 1 = Resume, Hero, Wardrobe; row 2 = Restart, Home, Grown-ups, "?".
  const pauseGrid = pause.el.querySelector('.grid3, .grid2');
  if (pauseGrid?.firstElementChild) pauseGrid.firstElementChild.after(heroTile);
  else pauseGrid?.append(heroTile);
  applyStoredCharacter(ctx);
  // Tests plug a fake wallet in through this hook (the economy calls setCharacterAccess directly).
  if (ctx.testMode) (window as unknown as { __rgSetCharacterAccess?: typeof setCharacterAccess }).__rgSetCharacterAccess = setCharacterAccess;
  const wayfinding = createWayfinding(ctx, { pause, open: (s) => (stack.push(s), render()), back: pop });
  const all: Screen[] = [title, pause, end, credits, settings, gate, dress, select, wayfinding.screen];
  for (const s of all) root.append(s.el);
  const hud = createHud(ctx, tracker);
  const wardrobeBtn = createWardrobeButton(ctx, seen, dressFromPlay);
  hud.el.append(wardrobeBtn.el);
  const skillChip = createSkillChip(ctx);
  const tutorial = createTutorial(ctx);
  const touch = createTouchUi(ctx);
  all.push(glassesSummary);
  root.append(glassesSummary.el);

  const phase = (): SessionPhase => ctx.session.state.phase;
  const base = (): Screen | null => {
    const p = phase();
    return p === 'title' ? title : p === 'paused' ? (shopOpen ? dress : pause) : p === 'ended' ? end : null;
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
    if (shown === dress && t !== dress) dress.leave();
    // Title: the camera comes close so the hero stands big in the middle (the select does the same).
    if (t === title && !titleCam) {
      titleCam = true;
      ctx.cameraRig.setOverride(TITLE_CAMERA);
    } else if (t !== title && titleCam) {
      titleCam = false;
      if (t !== select) ctx.cameraRig.setOverride(null);
    }
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
      if (t === dress) dress.tab(dir);
    },
  });

  // Help is one key away on the title and in the pause menu too (H / F1 / gamepad Back).
  const helpHere = (): boolean => !calibrating && stack.length === 0 && (top() === title || top() === pause);
  // Wardrobe: I in play (on foot) or on the title / pause menu.
  const dressKey = (): void => {
    if (calibrating || dialogOpen()) return;
    if (phase() === 'playing' && !stack.length) dressFromPlay();
    else if (helpHere()) actions.openWardrobe();
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI' && !e.repeat && !typingTarget(e.target)) {
      e.preventDefault();
      dressKey();
    }
  });
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'KeyH' || e.code === 'F1') && !e.repeat && helpHere() && !typingTarget(e.target) && !dialogOpen()) {
      e.preventDefault();
      actions.openHelp?.();
    }
  });
  let backPrev = false;
  let leftPrev = false;
  const pollHelpPad = (): void => {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pad = [...pads].find((x) => x && x.connected);
    const back = !!pad?.buttons[8]?.pressed;
    if (back && !backPrev && helpHere()) actions.openHelp?.();
    backPrev = back;
    const left = !!pad?.buttons[14]?.pressed;
    // D-pad left opens the dressing room in play (menus use the D-pad to move focus).
    if (left && !leftPrev && phase() === 'playing' && !stack.length) dressFromPlay();
    leftPrev = left;
  };

  ctx.events.on('shop:open', () => {
    if (phase() !== 'playing' || calibrating) return;
    shopOpen = true;
    ctx.session.pause();
  });

  ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'paused') shopOpen = false;
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
      pollHelpPad();
      if (shown === gate) gate.update(dt, pad.aHeld);
      if (shown === settings) settings.update(dt, pad.aHeld);
      if (shown === dress) dress.update(dt);
      if (shown === title) title.update(dt);
      if (shown === glassesSummary) glassesSummary.update(dt);
      hud.update(dt);
      wardrobeBtn.update(dt);
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
