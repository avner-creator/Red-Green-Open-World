/** Controls card: pictograms + key caps / gamepad glyphs by mode. HUD overlay (H, "?") and pause screen. */
import type { GameContext } from '../types';
import { controlRow } from './controlGlyphs';
import { cap, padButton } from './glyphs';
import type { ControlId, Device } from './controlGlyphs';
import { clear, h } from './dom';
import { icon } from './icons';
import type { UiIconName } from './icons';
import type { Screen } from './screens';
import { gameplayKeyAllowed } from './gameKeys';

type HeaderIcon = UiIconName | 'walker';

const WALKER =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13.5" cy="3.8" r="2.9"/><g class="o"><path d="M13 8.5l-2.5 5.5 3.5 3.5-1 5M10.5 14l-4.5 1.5M13 8.5l4 3.5 3-1M14 17.5l3.5 4"/></g><g class="w"><path d="M13 8.5l-2.5 5.5 3.5 3.5-1 5M10.5 14l-4.5 1.5M13 8.5l4 3.5 3-1M14 17.5l3.5 4"/></g></svg>';

function headerIcon(name: HeaderIcon): HTMLElement {
  if (name !== 'walker') return icon(name);
  const el = h('span', 'ic');
  el.innerHTML = WALKER;
  return el;
}

const GROUPS: { id: string; icon: HeaderIcon; rows: ControlId[] }[] = [
  { id: 'foot', icon: 'walker', rows: ['move', 'look', 'jump', 'sprint', 'air', 'use', 'skill', 'emote', 'respawn'] },
  { id: 'driving', icon: 'car', rows: ['steer', 'drive', 'hop', 'slide', 'horn', 'exit'] },
  { id: 'riding', icon: 'horse', rows: ['move', 'sprint', 'jump', 'emote', 'exit'] },
  { id: 'skydive', icon: 'parachute', rows: ['move', 'chute', 'look'] },
];

/** The three-column card body for a device. */
export function buildCard(device: Device): HTMLElement {
  const cols = h('div', 'wf-cols');
  for (const g of GROUPS) {
    cols.append(
      h('div', 'wf-col', { 'data-group': g.id }, h('div', 'hd', {}, headerIcon(g.icon)), ...g.rows.map((r) => controlRow(r, device))),
    );
  }
  return cols;
}

function closeButton(onClick: () => void): HTMLButtonElement {
  const b = h('button', 'b wf-close', { type: 'button', 'aria-label': 'Close', 'data-testid': 'controls-close' }, icon('back'));
  b.addEventListener('click', onClick);
  return b;
}

const DEVICE_ICON: Record<Device, UiIconName> = { keyboard: 'mouse', gamepad: 'stick', touch: 'hand' };

/** Device picker on the card: keyboard, gamepad, touch (the active device is preselected). */
function deviceTabs(pick: (d: Device) => void): { el: HTMLElement; set(d: Device): void } {
  const btns = (['keyboard', 'gamepad', 'touch'] as Device[]).map((d) => {
    const b = h('button', 'b d sm wf-dev', { type: 'button', 'aria-label': d, 'aria-pressed': 'false', 'data-testid': `controls-${d}` }, d === 'keyboard' ? cap('W') : d === 'gamepad' ? padButton('A') : null, icon(DEVICE_ICON[d]));
    b.addEventListener('click', () => pick(d));
    return b;
  });
  return {
    el: h('div', 'wf-devs', {}, ...btns),
    set(d) {
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(['keyboard', 'gamepad', 'touch'][i] === d)));
    },
  };
}

function panel(
  device: Device,
  onClose: () => void,
  pick: (d: Device) => void,
): { panel: HTMLElement; body: HTMLElement; close: HTMLButtonElement; tabs: { set(d: Device): void } } {
  const body = h('div', 'wf-body');
  body.append(buildCard(device));
  const close = closeButton(onClose);
  const tabs = deviceTabs(pick);
  tabs.set(device);
  return {
    panel: h('div', 'wf-panel', {}, body, h('div', 'wf-foot', {}, tabs.el, close)),
    body,
    close,
    tabs,
  };
}

export interface ControlsOverlay {
  /** The round "?" button. */
  button: HTMLElement;
  card: HTMLElement;
  readonly open: boolean;
  toggle(): void;
  close(): void;
  update(): void;
}

/** In-HUD toggle: "?" button, key H, gamepad Back/Select. Does not pause. */
export function createControlsOverlay(ctx: GameContext): ControlsOverlay {
  let open = false;
  let device: Device = 'keyboard';
  const keySlot = h('span', 'hk');
  const button = h('button', 'wf-help', { type: 'button', 'aria-label': 'Controls', 'aria-pressed': 'false', 'data-testid': 'help' }, h('span', 'q', {}, '?'), keySlot);
  let keyDevice: Device | null = null;
  const showKey = (d: Device): void => {
    if (d === keyDevice) return;
    keyDevice = d;
    clear(keySlot);
    if (d === 'keyboard') keySlot.append(cap('H'));
    else if (d === 'gamepad') keySlot.append(padButton('BACK'));
  };
  showKey(ctx.input.state.device);
  /** A device picked on the card sticks until the card closes. */
  let picked: Device | null = null;
  const { panel: p, body, close, tabs } = panel(device, () => api.close(), (d) => {
    picked = d;
    device = d;
    render();
  });
  const card = h('div', 'wf-card', { 'data-testid': 'controls-card' }, p);
  // The button must not keep keyboard focus (Space would re-click it while playing).
  button.addEventListener('click', () => {
    api.toggle();
    button.blur();
  });
  void close;

  const render = (): void => {
    clear(body);
    body.append(buildCard(device));
    tabs.set(device);
  };
  const set = (on: boolean): void => {
    open = on;
    card.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
    picked = null;
    if (on) {
      device = ctx.input.state.device;
      render();
    }
  };

  const typing = (t: EventTarget | null): boolean => {
    const e = t as HTMLElement | null;
    return !!e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA');
  };
  window.addEventListener('keydown', (e) => {
    if (ctx.session.state.phase !== 'playing' || typing(e.target)) return;
    if (e.code === 'KeyH' || e.code === 'F1') {
      if (!gameplayKeyAllowed(e, ctx.session.state.phase)) return;
      if (!e.repeat) api.toggle();
      e.preventDefault();
    } else if (e.code === 'Escape' && open) {
      // Close the card instead of pausing the game.
      e.preventDefault();
      e.stopImmediatePropagation();
      set(false);
    }
  }, true);

  let backPrev = false;
  const api: ControlsOverlay = {
    button,
    card,
    get open() {
      return open;
    },
    toggle: () => set(!open),
    close: () => set(false),
    update(): void {
      if (ctx.session.state.phase !== 'playing') {
        if (open) set(false);
        backPrev = false;
        return;
      }
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const pad = [...pads].find((x) => x && x.connected);
      const back = !!pad?.buttons[8]?.pressed;
      if (back && !backPrev) api.toggle();
      backPrev = back;
      showKey(ctx.input.state.device);
      if (open && !picked && ctx.input.state.device !== device) {
        device = ctx.input.state.device;
        render();
      }
    },
  };
  return api;
}

/** Pause-menu version: a stack screen with a back button. */
export function createControlsScreen(ctx: GameContext, onBack: () => void): Screen {
  let device: Device = 'keyboard';
  const show = (d: Device): void => {
    device = d;
    clear(body);
    body.append(buildCard(device));
    tabs.set(device);
  };
  const { panel: p, body, close, tabs } = panel(device, onBack, show);
  const el = h('div', 'screen dim', { 'data-screen': 'controls' }, p);
  return {
    el,
    onShow(): HTMLElement {
      show(ctx.input.state.device);
      return close;
    },
  };
}
