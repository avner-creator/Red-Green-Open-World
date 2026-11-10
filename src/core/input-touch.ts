/**
 * Touch input source: floating left-thumb joystick, right-side drag to look, and on-screen
 * buttons. The DOM for these lives in `src/ui/touch/`; it forwards finger positions here and
 * reads back the knob position to draw it. `createInput` merges the result into `InputState`.
 *
 * Multi-touch safe: the stick and the look drag each own one pointer id; buttons count how many
 * fingers hold them, so two fingers on one button and a finger sliding off never stick a button.
 */
import type { InputApi, SettingsApi } from '../types';
import {
  clampBase,
  followBase,
  isPhoneViewport,
  lookFromDrag,
  lookStep,
  prefersTouch,
  stickRadius,
  stickVector,
  touchQuality,
} from './input-touch-math';
import type { DeviceHints } from './input-touch-math';
import type { Vec2 } from './input-math';

export type TouchButton = 'jump' | 'use' | 'flop' | 'pause' | 'sprint';
/** Buttons that act once per tap (sprint is a toggle and has its own state). */
export type TouchAction = Exclude<TouchButton, 'sprint'>;

export interface TouchStickView {
  /** A finger is on the stick. */
  readonly active: boolean;
  /** Base centre and knob centre in CSS px (viewport coordinates). */
  readonly baseX: number;
  readonly baseY: number;
  readonly knobX: number;
  readonly knobY: number;
  readonly radius: number;
}

export interface TouchControls {
  /** Touch mode: true on touch-first devices and after any touch; false after keys/mouse/pad. */
  readonly active: boolean;
  readonly stick: TouchStickView;
  /** Sprint toggle state. */
  readonly sprint: boolean;
  /** Is this button held by at least one finger? */
  held(b: TouchAction): boolean;
  stickStart(id: number, x: number, y: number): void;
  stickMove(id: number, x: number, y: number): void;
  stickEnd(id: number): void;
  lookStart(id: number, x: number, y: number): void;
  lookMove(id: number, x: number, y: number): void;
  lookEnd(id: number): void;
  buttonDown(b: TouchButton, id: number): void;
  buttonUp(b: TouchButton, id: number): void;
  /** Drop every finger (menu opened, page hidden). The sprint toggle survives. */
  cancelAll(): void;
  /** Rest position of the stick (drawn faintly when no finger is on it). */
  setRest(x: number, y: number): void;
  /** Notified when `active` changes. Returns an unsubscribe function. */
  onActiveChange(cb: (active: boolean) => void): () => void;
}

/** What `createInput` reads every frame. */
export interface TouchFrame {
  move: Vec2;
  lookX: number;
  lookY: number;
  sprint: boolean;
  jump: boolean;
  use: boolean;
  pressed: Set<TouchAction>;
}

export interface TouchSource {
  controls: TouchControls;
  /** Drain the frame's input (look deltas and taps are consumed). */
  read(): TouchFrame;
  /** Gameplay just switched on/off: drop fingers and stale taps. */
  setGameplay(on: boolean): void;
  /** Another device was used (key, mouse, gamepad): hide the touch HUD. */
  noteOtherDevice(): void;
  dispose(): void;
}

const byApi = new WeakMap<InputApi, TouchControls>();

/** The touch controls of an input system (null when the input has no touch source). */
export function touchControls(api: InputApi): TouchControls | null {
  return byApi.get(api) ?? null;
}
export function registerTouchControls(api: InputApi, c: TouchControls): void {
  byApi.set(api, c);
}

function deviceHints(): DeviceHints {
  const mm = (q: string): boolean => {
    try {
      return typeof matchMedia === 'function' && matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  return {
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
    coarse: mm('(pointer: coarse)'),
    fine: mm('(any-pointer: fine)'),
  };
}

const viewport = (): { w: number; h: number } => ({
  w: Math.max(1, window.innerWidth),
  h: Math.max(1, window.innerHeight),
});

const DEFAULTS_KEY = 'rgow.touchDefaults.v1';

/**
 * On a touch-first device, lower the quality once (phones → Low, tablets → Medium) so the first
 * session runs smoothly. Remembered, so a grown-up's later choice in settings is kept.
 */
export function applyTouchQualityDefault(settings: SettingsApi | undefined, testMode: boolean): void {
  if (!settings || testMode || !prefersTouch(deviceHints())) return;
  try {
    if (localStorage.getItem(DEFAULTS_KEY)) return;
    localStorage.setItem(DEFAULTS_KEY, '1');
  } catch {
    /* no storage: apply every boot (still the better default) */
  }
  const { w, h } = viewport();
  const q = touchQuality(true, isPhoneViewport(w, h));
  const order = { low: 0, medium: 1, high: 2 } as const;
  if (q && order[q] < order[settings.get().quality]) settings.set({ quality: q });
}

export function createTouchSource(): TouchSource {
  let active = prefersTouch(deviceHints());
  const listeners = new Set<(a: boolean) => void>();
  const setActive = (a: boolean): void => {
    if (a === active) return;
    active = a;
    for (const cb of listeners) cb(a);
  };

  const stick = { id: -1, active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, radius: 60, restX: 0, restY: 0 };
  const look = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  const holders: Record<TouchAction, Set<number>> = { jump: new Set(), use: new Set(), flop: new Set(), pause: new Set() };
  const taps = new Set<TouchAction>();
  let sprint = false;
  let gameplay = true;

  const resetStick = (): void => {
    stick.id = -1;
    stick.active = false;
    stick.baseX = stick.knobX = stick.restX;
    stick.baseY = stick.knobY = stick.restY;
  };

  const controls: TouchControls = {
    get active() {
      return active;
    },
    stick: {
      get active() {
        return stick.active;
      },
      get baseX() {
        return stick.baseX;
      },
      get baseY() {
        return stick.baseY;
      },
      get knobX() {
        return stick.knobX;
      },
      get knobY() {
        return stick.knobY;
      },
      get radius() {
        return stick.radius;
      },
    },
    get sprint() {
      return sprint;
    },
    held: (b) => holders[b].size > 0,
    stickStart(id, x, y) {
      setActive(true);
      if (stick.id !== -1) return;
      const { w, h } = viewport();
      stick.radius = stickRadius(w, h);
      const b = clampBase(x, y, stick.radius, w, h);
      stick.id = id;
      stick.active = true;
      stick.baseX = b.x;
      stick.baseY = b.y;
      stick.knobX = x;
      stick.knobY = y;
      controls.stickMove(id, x, y);
    },
    stickMove(id, x, y) {
      if (id !== stick.id) return;
      const b = followBase(stick.baseX, stick.baseY, x, y, stick.radius);
      stick.baseX = b.x;
      stick.baseY = b.y;
      stick.knobX = x;
      stick.knobY = y;
    },
    stickEnd(id) {
      if (id === stick.id) resetStick();
    },
    lookStart(id, x, y) {
      setActive(true);
      if (look.id !== -1) return;
      look.id = id;
      look.x = x;
      look.y = y;
    },
    lookMove(id, x, y) {
      if (id !== look.id) return;
      look.dx += lookStep(x - look.x);
      look.dy += lookStep(y - look.y);
      look.x = x;
      look.y = y;
    },
    lookEnd(id) {
      if (id === look.id) look.id = -1;
    },
    buttonDown(b, id) {
      setActive(true);
      if (b === 'sprint') {
        sprint = !sprint;
        return;
      }
      if (b === 'pause' || gameplay) {
        if (holders[b].size === 0) taps.add(b);
        holders[b].add(id);
      }
    },
    buttonUp(b, id) {
      if (b !== 'sprint') holders[b].delete(id);
    },
    cancelAll() {
      resetStick();
      look.id = -1;
      look.dx = look.dy = 0;
      for (const s of Object.values(holders)) s.clear();
    },
    setRest(x, y) {
      stick.restX = x;
      stick.restY = y;
      const { w, h } = viewport();
      stick.radius = stickRadius(w, h);
      if (!stick.active) resetStick();
    },
    onActiveChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };

  // Any touch anywhere turns touch mode on (even on a menu); a real mouse turns it off.
  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') setActive(true);
    else if (e.pointerType === 'mouse') setActive(false);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && (e.movementX !== 0 || e.movementY !== 0) && active && !stick.active && look.id === -1) {
      setActive(false);
    }
  };
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') controls.cancelAll();
  };
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('visibilitychange', onHidden);

  return {
    controls,
    read() {
      const out: TouchFrame = {
        move: { x: 0, y: 0 },
        lookX: 0,
        lookY: 0,
        sprint: false,
        jump: false,
        use: false,
        pressed: new Set(taps),
      };
      taps.clear();
      const { w, h } = viewport();
      if (stick.active) out.move = stickVector(stick.baseX, stick.baseY, stick.knobX, stick.knobY, stick.radius);
      const l = lookFromDrag(look.dx, look.dy, w, h);
      look.dx = look.dy = 0;
      out.lookX = l.x;
      out.lookY = l.y;
      out.sprint = sprint;
      out.jump = holders.jump.size > 0;
      out.use = holders.use.size > 0;
      return out;
    },
    setGameplay(on) {
      gameplay = on;
      controls.cancelAll();
      for (const a of [...taps]) if (a !== 'pause') taps.delete(a);
    },
    noteOtherDevice() {
      if (!stick.active && look.id === -1) setActive(false);
    },
    dispose() {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('visibilitychange', onHidden);
      listeners.clear();
    },
  };
}
