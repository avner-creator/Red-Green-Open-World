/**
 * Keyboard + mouse (pointer lock) + gamepad + touch → one `InputState`.
 * This is the only module in the game that reads raw key/mouse/gamepad events; touch fingers come
 * from the on-screen controls in `src/ui/touch` through `touchControls(api)` (see input-touch.ts).
 */
import type { GameContext, InputApi, InputState } from '../types';
import { keyboardMove, lookCurve, mergeMove, radialDeadZone, sanitizeMouseDelta } from './input-math';
import { applyTouchQualityDefault, createTouchSource, registerTouchControls } from './input-touch';
import { LOOK } from './tuning';

const NEUTRAL: Readonly<InputState> = Object.freeze({
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, jump: false, use: false, jumpPressed: false,
  usePressed: false, flopPressed: false, respawnPressed: false, pausePressed: false, skill: false, skillPressed: false,
  emotePressed: false, device: 'keyboard',
});

type Action = 'jump' | 'use' | 'flop' | 'respawn' | 'pause' | 'skill' | 'emote';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'jump', KeyE: 'use', KeyF: 'flop', KeyR: 'respawn', Escape: 'pause', KeyP: 'pause',
  KeyQ: 'skill', KeyC: 'emote', KeyG: 'emote',
};
/** Keys whose browser default (scrolling) we suppress during gameplay. */
const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyR', 'KeyQ', 'KeyC', 'KeyG',
]);

/** Standard gamepad mapping. */
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, lt: 6, rt: 7, start: 9, ls: 10, up: 12 } as const;

/** Analogue triggers (0..1) for driving: core-internal, kept out of `InputState`. */
export interface DriveTriggers {
  accelerate: number;
  brake: number;
}
const triggersByApi = new WeakMap<InputApi, DriveTriggers>();
/** Gamepad RT/LT of the last `update` (zeros without a pad, or while gameplay is off). */
export function driveTriggers(api: InputApi): Readonly<DriveTriggers> {
  return triggersByApi.get(api) ?? { accelerate: 0, brake: 0 };
}
/** Why the last `pausePressed` fired (test log / diagnostics): core-internal. */
export type PauseSource = 'key' | 'pad' | 'touch' | 'lock-esc';
const pauseSourceByApi = new WeakMap<InputApi, { source: PauseSource | null; detail: string }>();
/** Source of this frame's `pausePressed` (null when it is false). */
export function pauseSource(api: InputApi): { source: PauseSource | null; detail: string } {
  return pauseSourceByApi.get(api) ?? { source: null, detail: '' };
}
/** Mouse look is wanted but the pointer is not locked (window lost focus, lock refused, Esc resume). */
const lookHintByApi = new WeakMap<InputApi, () => boolean>();
export function lookHintWanted(api: InputApi): boolean {
  return lookHintByApi.get(api)?.() ?? false;
}
/** How long after a lock loss we wait for an Esc / blur to explain it (ms). */
const LOCK_LOSS_SETTLE_MS = 180;
/** An Esc or a window blur this close to a lock loss explains it (ms). */
const LOCK_LOSS_WINDOW_MS = 600;
/** Pads that report no standard mapping: button 9 is not Start on them (headsets, wheels, HID noise). */
function padPauseAllowed(pad: Gamepad): boolean {
  return pad.mapping === 'standard';
}

const EDGE_FIELDS = ['jumpPressed', 'usePressed', 'flopPressed', 'respawnPressed', 'pausePressed', 'skillPressed', 'emotePressed'] as const;

function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export function createInput(ctx: Pick<GameContext, 'canvas' | 'testMode'> & Partial<Pick<GameContext, 'settings'>>): InputApi {
  applyTouchQualityDefault(ctx.settings, ctx.testMode);
  const touch = createTouchSource();
  const state: InputState = { ...NEUTRAL };
  const held = new Set<string>();
  const queued = new Set<Action>();
  let mouseX = 0;
  let mouseY = 0;
  let gameplay = true;
  let device: InputState['device'] = 'keyboard';
  let injected: Partial<InputState> | null = null;
  let intentionalRelease = false;
  /** Time of an unexplained pointer-lock loss still being classified (Esc → pause; blur → hint). */
  let lockLossPending: number | null = null;
  let lastEscAt = -Infinity;
  let lastBlurAt = -Infinity;
  /** The game asked for pointer lock and has not released it on purpose since. */
  let wantLock = false;
  const pauseInfo: { source: PauseSource | null; detail: string } = { source: null, detail: '' };
  let queuedPauseDetail = '';
  const padPrev: boolean[] = [];
  let padKey = '';
  let padSprintLatch = false;

  const locked = (): boolean => document.pointerLockElement === ctx.canvas;
  /**
   * Automated browsers (Playwright, `navigator.webdriver`) never get a real pointer lock: in
   * headless Chromium a granted lock balloons the renderer to 2+ GB within seconds and it is
   * killed (measured: every viewport size; a blank WebGL page with a lock also stalls). Tests that
   * need the real lock pass `&reallock=1`. Real players are unaffected.
   */
  const automationNoLock =
    typeof navigator !== 'undefined' && navigator.webdriver === true &&
    !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('reallock') === '1');
  let lockRequests = 0;

  /** True while we re-dispatch the Esc the browser swallowed (so in-game cards can close on it). */
  let replayingEsc = false;
  /** The last real Esc key-down was consumed (preventDefault) by an in-game card. */
  let lastEscConsumed = false;
  const onKeyDownCapture = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' || replayingEsc) return;
    lastEscAt = performance.now();
    lastEscConsumed = false;
    queueMicrotask(() => (lastEscConsumed = e.defaultPrevented));
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (replayingEsc) return;
    if (isTextField(e.target) && e.code !== 'Escape') return;
    device = 'keyboard';
    touch.noteOtherDevice();
    if (gameplay && GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      const action = KEY_ACTIONS[e.code];
      // Some browsers deliver Esc after it already broke pointer lock: the lock-loss classifier
      // pauses for it, so don't queue a second pause.
      const echo = action === 'pause' && lockLossPending !== null;
      if (action && !echo) {
        queued.add(action);
        if (action === 'pause') queuedPauseDetail = e.code;
      }
    }
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    // Chrome swallows the Esc key-down that exits pointer lock; its key-up may still arrive.
    if (e.code === 'Escape') lastEscAt = performance.now();
    held.delete(e.code);
  };
  const onBlur = (): void => {
    lastBlurAt = performance.now();
    held.clear();
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (!locked()) return;
    device = 'keyboard';
    mouseX += sanitizeMouseDelta(e.movementX);
    mouseY += sanitizeMouseDelta(e.movementY);
  };
  const onLockChange = (): void => {
    if (locked()) {
      // A fresh lock supersedes an earlier release request whose exit never came (the browser
      // re-locked first); a stale flag would swallow the next real lock loss (no pause).
      intentionalRelease = false;
      return;
    }
    if (intentionalRelease) intentionalRelease = false;
    // Not ours: Esc (browser-handled, usually no key-down reaches us) or the window losing focus
    // (alt-tab, an OS notification, another app). Only Esc pauses; the rest keeps playing with a
    // "click to look" hint. Classified a moment later, once a trailing blur / Esc key-up arrived.
    else if (gameplay) lockLossPending = performance.now();
    mouseX = mouseY = 0;
  };
  const onCanvasClick = (): void => {
    if (gameplay && !locked()) api.capturePointer();
  };
  /** Resolves a pending lock loss: true = it was Esc (pause), false = not yet / not Esc. */
  const lockLossPauses = (now: number): boolean => {
    if (lockLossPending === null) return false;
    const t = lockLossPending;
    const near = (at: number): boolean => Math.abs(at - t) < LOCK_LOSS_WINDOW_MS;
    if (near(lastEscAt) && now - t >= 30) {
      lockLossPending = null;
      // The Esc already closed an open card (Fun Pass, controls) where the browser let it through.
      return gameplay && !lastEscConsumed && !escClosesCard();
    }
    if (now - t < LOCK_LOSS_SETTLE_MS) return false;
    lockLossPending = null;
    const focusLost = near(lastBlurAt) || document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus());
    // Focused, no blur: the only thing left that drops the lock is the browser's own Esc handling.
    return gameplay && !focusLost && !escClosesCard();
  };
  /**
   * Chrome keeps the Esc that exits pointer lock to itself. Replay it to the page: an open in-game
   * card (Fun Pass, controls card) closes on it and calls preventDefault, and then Esc only meant
   * "close the card", not "pause". Our own key handlers ignore the replay.
   */
  const escClosesCard = (): boolean => {
    if (typeof KeyboardEvent === 'undefined') return false;
    const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    replayingEsc = true;
    try {
      // Real key events target the focused element, so window capture listeners see them first.
      (document.activeElement ?? document.body).dispatchEvent(ev);
    } finally {
      replayingEsc = false;
    }
    return ev.defaultPrevented;
  };

  window.addEventListener('keydown', onKeyDownCapture, true);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  ctx.canvas.addEventListener('click', onCanvasClick);

  const key = (...codes: string[]): boolean => codes.some((c) => held.has(c));

  function readGamepad(dt: number): {
    move: { x: number; y: number }; lookX: number; lookY: number; sprint: boolean; jump: boolean; use: boolean; skill: boolean;
    pressed: Set<Action>; rt: number; lt: number;
  } | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        if (p.mapping === 'standard') break;
      }
    }
    if (!pad) {
      padKey = '';
      return null;
    }
    // A pad seen for the first time (or swapped) starts from its current buttons: a button already
    // down when it connects (or a stuck one) is not a press.
    const id = `${pad.index}:${pad.id}`;
    const fresh = id !== padKey;
    padKey = id;
    const btn = (i: number): boolean => {
      const b = pad.buttons[i];
      return !!b && (b.pressed || b.value > LOOK.triggerThreshold);
    };
    const trigger = (i: number): number => {
      const b = pad.buttons[i];
      if (!b) return 0;
      const v = Math.max(b.value, b.pressed ? 1 : 0);
      return v < 0.08 ? 0 : Math.min(1, (v - 0.08) / 0.84);
    };
    const pressed = new Set<Action>();
    if (fresh) for (let i = 0; i < pad.buttons.length; i++) padPrev[i] = btn(i);
    const edge = (i: number, action: Action): void => {
      const now = btn(i);
      if (now && !padPrev[i]) pressed.add(action);
    };
    edge(PAD.a, 'jump');
    edge(PAD.x, 'use');
    edge(PAD.b, 'flop');
    edge(PAD.y, 'respawn');
    if (padPauseAllowed(pad)) edge(PAD.start, 'pause');
    edge(PAD.lb, 'skill');
    edge(PAD.up, 'emote');
    const lsNow = btn(PAD.ls);
    if (lsNow && !padPrev[PAD.ls]) padSprintLatch = true;
    for (let i = 0; i < pad.buttons.length; i++) padPrev[i] = btn(i);

    const ax = (i: number): number => pad.axes[i] ?? 0;
    const m = radialDeadZone(ax(0), -ax(1), LOOK.moveDeadZone);
    if (Math.hypot(m.x, m.y) < 0.2) padSprintLatch = false;
    const l = lookCurve(ax(2), ax(3), LOOK.lookDeadZone);
    const anyButton = pad.buttons.some((_, i) => btn(i));
    if (anyButton || m.x !== 0 || m.y !== 0 || l.x !== 0 || l.y !== 0) {
      device = 'gamepad';
      touch.noteOtherDevice();
    }
    return {
      move: m,
      lookX: l.x * LOOK.stickYawRate * dt,
      lookY: l.y * LOOK.stickPitchRate * dt,
      sprint: btn(PAD.rt) || padSprintLatch,
      jump: btn(PAD.a),
      use: btn(PAD.x),
      skill: btn(PAD.lb),
      pressed,
      rt: trigger(PAD.rt),
      lt: trigger(PAD.lt),
    };
  }

  const triggers: DriveTriggers = { accelerate: 0, brake: 0 };
  const api: InputApi = {
    state,
    update(dt) {
      const pad = readGamepad(dt);
      const tf = touch.read();
      const pressed = new Set<Action>(queued);
      queued.clear();
      pauseInfo.source = null;
      pauseInfo.detail = '';
      if (pressed.has('pause')) {
        pauseInfo.source = 'key';
        pauseInfo.detail = queuedPauseDetail;
      }
      if (pad?.pressed.has('pause') && !pauseInfo.source) {
        pauseInfo.source = 'pad';
        pauseInfo.detail = `start (${pad.pressed.size} pressed)`;
      }
      if (pad) for (const a of pad.pressed) pressed.add(a);
      if (tf.pressed.has('pause') && !pauseInfo.source) pauseInfo.source = 'touch';
      for (const a of tf.pressed) pressed.add(a);
      if (lockLossPauses(performance.now()) && !pauseInfo.source) {
        pauseInfo.source = 'lock-esc';
        pressed.add('pause');
      }
      const pausePressed = pressed.has('pause');

      Object.assign(state, NEUTRAL);
      // The touch HUD is up while touch is the active device (a key, mouse or pad turns it off).
      state.device = touch.controls.active ? 'touch' : device;
      state.pausePressed = pausePressed;
      if (gameplay) {
        const kb = keyboardMove(key('KeyA', 'ArrowLeft'), key('KeyD', 'ArrowRight'), key('KeyS', 'ArrowDown'), key('KeyW', 'ArrowUp'));
        const move = mergeMove(pad ? mergeMove(kb, pad.move) : kb, tf.move);
        state.moveX = move.x;
        state.moveY = move.y;
        state.lookX = mouseX * LOOK.mouseSensitivity + (pad?.lookX ?? 0) + tf.lookX;
        state.lookY = mouseY * LOOK.mouseSensitivity + (pad?.lookY ?? 0) + tf.lookY;
        state.sprint = key('ShiftLeft', 'ShiftRight') || !!pad?.sprint || tf.sprint;
        state.jump = key('Space') || !!pad?.jump || tf.jump;
        state.use = key('KeyE') || !!pad?.use || tf.use;
        state.jumpPressed = pressed.has('jump');
        state.usePressed = pressed.has('use');
        state.flopPressed = pressed.has('flop');
        state.respawnPressed = pressed.has('respawn');
        state.skill = key('KeyQ') || !!pad?.skill || tf.skill;
        state.skillPressed = pressed.has('skill');
        state.emotePressed = pressed.has('emote');
      }
      triggers.accelerate = gameplay && pad ? pad.rt : 0;
      triggers.brake = gameplay && pad ? pad.lt : 0;
      mouseX = mouseY = 0;

      if (injected) {
        Object.assign(state, injected);
        // Edge-triggered fields fire once per injection; held values persist until cleared.
        let rest: Partial<InputState> | null = null;
        for (const [k, v] of Object.entries(injected) as [keyof InputState, unknown][]) {
          if ((EDGE_FIELDS as readonly string[]).includes(k)) continue;
          rest ??= {};
          (rest as Record<string, unknown>)[k] = v;
        }
        injected = rest;
      }
    },
    capturePointer() {
      // Touch play has no pointer lock (phones don't support it; a stray lock would eat taps).
      if (touch.controls.active) return;
      wantLock = true;
      if (locked()) return;
      lockRequests++;
      if (automationNoLock) return;
      try {
        const r = ctx.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (r && typeof r.catch === 'function') r.catch(() => undefined);
      } catch {
        /* pointer lock unavailable (e.g. no user gesture); mouse look just stays off */
      }
    },
    releasePointer() {
      wantLock = false;
      if (!locked()) return;
      intentionalRelease = true;
      document.exitPointerLock();
    },
    setGameplayEnabled(enabled) {
      if (enabled === gameplay) return;
      gameplay = enabled;
      touch.setGameplay(enabled);
      // Don't carry presses made in a menu into gameplay (or vice versa); pause always survives.
      for (const a of [...queued]) if (a !== 'pause') queued.delete(a);
      if (!enabled) lockLossPending = null;
      mouseX = mouseY = 0;
    },
    inject(patch) {
      injected = patch ? { ...patch } : null;
    },
  };
  triggersByApi.set(api, triggers);
  pauseSourceByApi.set(api, pauseInfo);
  if (ctx.testMode) (window as unknown as { __rgLockRequests?: () => number }).__rgLockRequests = () => lockRequests;
  lookHintByApi.set(api, () => gameplay && wantLock && !locked() && !touch.controls.active && device === 'keyboard');
  registerTouchControls(api, touch.controls);
  return api;
}
