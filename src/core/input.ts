/**
 * Keyboard + mouse (pointer lock) + gamepad → one `InputState`.
 * This is the only module in the game that reads raw key/mouse/gamepad events.
 */
import type { GameContext, InputApi, InputState } from '../types';
import { keyboardMove, lookCurve, mergeMove, radialDeadZone, sanitizeMouseDelta } from './input-math';
import { LOOK } from './tuning';

const NEUTRAL: Readonly<InputState> = Object.freeze({
  moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, jump: false, use: false, jumpPressed: false,
  usePressed: false, flopPressed: false, respawnPressed: false, pausePressed: false, device: 'keyboard',
});

type Action = 'jump' | 'use' | 'flop' | 'respawn' | 'pause';

const KEY_ACTIONS: Record<string, Action> = {
  Space: 'jump', KeyE: 'use', KeyF: 'flop', KeyR: 'respawn', Escape: 'pause', KeyP: 'pause',
};
/** Keys whose browser default (scrolling) we suppress during gameplay. */
const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyR',
]);

/** Standard gamepad mapping. */
const PAD = { a: 0, b: 1, x: 2, y: 3, lt: 6, rt: 7, start: 9, ls: 10 } as const;

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
const EDGE_FIELDS = ['jumpPressed', 'usePressed', 'flopPressed', 'respawnPressed', 'pausePressed'] as const;

function isTextField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

export function createInput(ctx: Pick<GameContext, 'canvas' | 'testMode'>): InputApi {
  const state: InputState = { ...NEUTRAL };
  const held = new Set<string>();
  const queued = new Set<Action>();
  let mouseX = 0;
  let mouseY = 0;
  let gameplay = true;
  let device: InputState['device'] = 'keyboard';
  let injected: Partial<InputState> | null = null;
  let intentionalRelease = false;
  let pauseFromLockLoss = false;
  let lockLostAt = -Infinity;
  const padPrev: boolean[] = [];
  let padSprintLatch = false;

  const locked = (): boolean => document.pointerLockElement === ctx.canvas;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTextField(e.target) && e.code !== 'Escape') return;
    device = 'keyboard';
    if (gameplay && GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      const action = KEY_ACTIONS[e.code];
      // Some browsers deliver Esc after it already broke pointer lock: don't pause twice.
      const echo = action === 'pause' && performance.now() - lockLostAt < 400;
      if (action && !echo) queued.add(action);
    }
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    held.delete(e.code);
  };
  const onBlur = (): void => {
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
    else if (gameplay) {
      pauseFromLockLoss = true;
      lockLostAt = performance.now();
    }
    mouseX = mouseY = 0;
  };
  const onCanvasClick = (): void => {
    if (gameplay && !locked()) api.capturePointer();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  ctx.canvas.addEventListener('click', onCanvasClick);

  const key = (...codes: string[]): boolean => codes.some((c) => held.has(c));

  function readGamepad(dt: number): {
    move: { x: number; y: number }; lookX: number; lookY: number; sprint: boolean; jump: boolean; use: boolean;
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
    if (!pad) return null;
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
    const edge = (i: number, action: Action): void => {
      const now = btn(i);
      if (now && !padPrev[i]) pressed.add(action);
    };
    edge(PAD.a, 'jump');
    edge(PAD.x, 'use');
    edge(PAD.b, 'flop');
    edge(PAD.y, 'respawn');
    edge(PAD.start, 'pause');
    const lsNow = btn(PAD.ls);
    if (lsNow && !padPrev[PAD.ls]) padSprintLatch = true;
    for (let i = 0; i < pad.buttons.length; i++) padPrev[i] = btn(i);

    const ax = (i: number): number => pad.axes[i] ?? 0;
    const m = radialDeadZone(ax(0), -ax(1), LOOK.moveDeadZone);
    if (Math.hypot(m.x, m.y) < 0.2) padSprintLatch = false;
    const l = lookCurve(ax(2), ax(3), LOOK.lookDeadZone);
    const anyButton = pad.buttons.some((_, i) => btn(i));
    if (anyButton || m.x !== 0 || m.y !== 0 || l.x !== 0 || l.y !== 0) device = 'gamepad';
    return {
      move: m,
      lookX: l.x * LOOK.stickYawRate * dt,
      lookY: l.y * LOOK.stickPitchRate * dt,
      sprint: btn(PAD.rt) || padSprintLatch,
      jump: btn(PAD.a),
      use: btn(PAD.x),
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
      const pressed = new Set<Action>(queued);
      queued.clear();
      if (pad) for (const a of pad.pressed) pressed.add(a);
      const pausePressed = pressed.has('pause') || pauseFromLockLoss;
      pauseFromLockLoss = false;

      Object.assign(state, NEUTRAL);
      state.device = device;
      state.pausePressed = pausePressed;
      if (gameplay) {
        const kb = keyboardMove(key('KeyA', 'ArrowLeft'), key('KeyD', 'ArrowRight'), key('KeyS', 'ArrowDown'), key('KeyW', 'ArrowUp'));
        const move = pad ? mergeMove(kb, pad.move) : kb;
        state.moveX = move.x;
        state.moveY = move.y;
        state.lookX = mouseX * LOOK.mouseSensitivity + (pad?.lookX ?? 0);
        state.lookY = mouseY * LOOK.mouseSensitivity + (pad?.lookY ?? 0);
        state.sprint = key('ShiftLeft', 'ShiftRight') || !!pad?.sprint;
        state.jump = key('Space') || !!pad?.jump;
        state.use = key('KeyE') || !!pad?.use;
        state.jumpPressed = pressed.has('jump');
        state.usePressed = pressed.has('use');
        state.flopPressed = pressed.has('flop');
        state.respawnPressed = pressed.has('respawn');
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
      if (locked()) return;
      try {
        const r = ctx.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (r && typeof r.catch === 'function') r.catch(() => undefined);
      } catch {
        /* pointer lock unavailable (e.g. no user gesture); mouse look just stays off */
      }
    },
    releasePointer() {
      if (!locked()) return;
      intentionalRelease = true;
      document.exitPointerLock();
    },
    setGameplayEnabled(enabled) {
      if (enabled === gameplay) return;
      gameplay = enabled;
      // Don't carry presses made in a menu into gameplay (or vice versa); pause always survives.
      for (const a of [...queued]) if (a !== 'pause') queued.delete(a);
      mouseX = mouseY = 0;
    },
    inject(patch) {
      injected = patch ? { ...patch } : null;
    },
  };
  triggersByApi.set(api, triggers);
  return api;
}
