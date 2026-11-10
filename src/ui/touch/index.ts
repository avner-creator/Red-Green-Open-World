/**
 * On-screen touch controls: floating joystick (left), drag-to-look (right), jump / use / sprint /
 * flop / pause buttons, a rotate-to-landscape overlay, and the phone plumbing (visual viewport,
 * fullscreen on Play, audio unlock on first touch). Finger input goes to core through
 * `touchControls(ctx.input)`; this module only draws and forwards.
 */
import { touchControls } from '../../core/input-touch';
import type { TouchButton, TouchControls } from '../../core/input-touch';
import type { GameContext, IconName } from '../../types';
import { h } from '../dom';
import { icon } from '../icons';
import type { UiIconName } from '../icons';
import { TOUCH_CSS } from './css';
import { createPlatform } from './platform';

export interface TouchUi {
  /** `playing`: the session is running and no menu/calibration is on top. */
  update(dt: number, playing: boolean): void;
}

/** Seconds the first-play hints may stay up. */
const HINT_SECONDS = 8;

const JUMP_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.8l9 9.4h-5.4v5.6H8.4v-5.6H3z"/><rect x="5" y="18.6" width="14" height="3.6" rx="1.6"/></svg>';

function svgIcon(svg: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'ic';
  el.innerHTML = svg;
  return el;
}

let cssDone = false;
function injectTouchCss(): void {
  if (cssDone) return;
  cssDone = true;
  const el = document.createElement('style');
  el.textContent = TOUCH_CSS;
  document.head.appendChild(el);
}

export function createTouchUi(ctx: GameContext): TouchUi {
  const tc = touchControls(ctx.input);
  if (!tc) return { update: () => undefined };
  const c: TouchControls = tc;
  injectTouchCss();
  const root = ctx.uiRoot;
  const platform = createPlatform(ctx, c);

  const left = h('div', 'tz l', { 'data-testid': 'touch-stick-zone' });
  const right = h('div', 'tz r', { 'data-testid': 'touch-look-zone' });
  const knob = h('div', 'tknob', {}, icon('stick'));
  const base = h('div', 'tstick', { 'data-testid': 'touch-stick' });
  const probe = h('div', 'tprobe');

  const button = (b: TouchButton, label: string, content: HTMLElement): HTMLButtonElement => {
    const el = h('button', `tbtn ${b}`, { type: 'button', 'aria-label': label, 'data-testid': `touch-${b}`, tabindex: '-1' }, content);
    const fingers = new Set<number>();
    const release = (e: PointerEvent): void => {
      if (!fingers.delete(e.pointerId)) return;
      c.buttonUp(b, e.pointerId);
      if (fingers.size === 0) el.classList.remove('down');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fingers.add(e.pointerId);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer: no capture needed */
      }
      el.classList.add('down');
      c.buttonDown(b, e.pointerId);
      if (b === 'sprint') el.setAttribute('aria-pressed', String(c.sprint));
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    // Taps are handled on pointerdown; swallow the click so it can't reach anything else.
    el.addEventListener('click', (e) => e.preventDefault());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  };

  const useIcon = h('span', 'tslot');
  const flopIcon = h('span', 'tslot');
  const jump = button('jump', 'Jump', svgIcon(JUMP_SVG));
  const use = button('use', 'Use', useIcon);
  const sprint = button('sprint', 'Sprint', icon('bolt'));
  sprint.setAttribute('aria-pressed', 'false');
  const flop = button('flop', 'Flop', flopIcon);
  const pause = button('pause', 'Pause', icon('pause'));
  const lookHint = h('div', 'thint look', {}, icon('hand', 'hand'), icon('eye', 'eye'));

  const el = h('div', 'touch', { 'data-testid': 'touch-hud' }, probe, left, right, base, knob, lookHint, flop, use, sprint, jump, pause);
  root.append(el);
  useIcon.style.display = flopIcon.style.display = 'contents';

  // ── zones: one finger each; extra fingers on a busy zone are ignored ──
  const zone = (z: HTMLElement, start: (id: number, x: number, y: number) => void, move: typeof start, end: (id: number) => void): void => {
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        z.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      start(e.pointerId, e.clientX, e.clientY);
    });
    z.addEventListener('pointermove', (e) => {
      // Coalesced events give smoother look on 120 Hz screens; only the last position matters
      // for the stick, every step for look (sum of deltas is the same either way).
      move(e.pointerId, e.clientX, e.clientY);
    });
    const up = (e: PointerEvent): void => end(e.pointerId);
    z.addEventListener('pointerup', up);
    z.addEventListener('pointercancel', up);
    z.addEventListener('lostpointercapture', up);
  };
  zone(left, c.stickStart, c.stickMove, c.stickEnd);
  zone(right, c.lookStart, c.lookMove, c.lookEnd);

  // ── layout: stick rest position from the viewport and safe areas ──
  let lastW = 0;
  let lastH = 0;
  const layout = (): void => {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    if (w === lastW && hgt === lastH) return;
    lastW = w;
    lastH = hgt;
    const cs = getComputedStyle(probe);
    const sl = parseFloat(cs.paddingLeft) || 0;
    const sb = parseFloat(cs.paddingBottom) || 0;
    const margin = Math.min(w, hgt) * 0.07;
    c.setRest(0, 0);
    const r = c.stick.radius;
    c.setRest(sl + margin + r, hgt - sb - margin - r * 0.9);
    el.style.setProperty('--r', `${r}px`);
  };

  // ── per-frame view ──
  let shown = false;
  let touchOn = false;
  let lastUse: UiIconName | null = null;
  let lastUseCls = '';
  let lastFlop: UiIconName | null = null;
  let kx = NaN;
  let ky = NaN;
  let bx = NaN;
  let by = NaN;
  let hintT = -1;
  let moved = false;
  let looked = false;

  const setIcon = (slot: HTMLElement, name: UiIconName): void => {
    slot.replaceChildren(icon(name));
  };

  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous !== 'paused') {
      hintT = 0;
      moved = looked = false;
    }
    if (e.phase === 'title' || e.phase === 'ended') hintT = -1;
  });

  return {
    update(dt, playing) {
      platform.update();
      if (c.active !== touchOn) {
        touchOn = c.active;
        root.classList.toggle('touch-on', touchOn);
      }
      const show = touchOn && playing && !platform.portrait;
      if (show !== shown) {
        shown = show;
        el.classList.toggle('on', show);
        if (!show) for (const b of [jump, use, sprint, flop, pause]) b.classList.remove('down');
      }
      if (!show) return;
      layout();

      const st = c.stick;
      if (st.knobX !== kx || st.knobY !== ky || st.baseX !== bx || st.baseY !== by) {
        kx = st.knobX;
        ky = st.knobY;
        bx = st.baseX;
        by = st.baseY;
        // Draw the knob inside the ring even when the finger is past it (base follows anyway).
        const dx = kx - bx;
        const dy = ky - by;
        const len = Math.hypot(dx, dy);
        const k = len > st.radius ? st.radius / len : 1;
        base.style.transform = `translate(${bx}px,${by}px)`;
        knob.style.transform = `translate(${bx + dx * k}px,${by + dy * k}px)`;
      }
      base.classList.toggle('on', st.active);
      knob.classList.toggle('on', st.active);

      // Use button: the focused thing's icon, "exit" in a vehicle, a dim hand otherwise.
      const mode = ctx.player.mode;
      const inVehicle = mode === 'driving' || mode === 'riding';
      const focus: IconName | null = ctx.interactions.focused?.icon ?? null;
      const ui: UiIconName = inVehicle ? 'exit' : focus ?? 'hand';
      const cls = inVehicle || focus ? 'ready' : 'idle';
      if (ui !== lastUse) {
        lastUse = ui;
        setIcon(useIcon, ui);
      }
      if (cls !== lastUseCls) {
        use.classList.remove(lastUseCls || 'idle');
        use.classList.add(cls);
        lastUseCls = cls;
      }
      // In the buggy the flop button honks.
      const fl: UiIconName = mode === 'driving' ? 'speaker' : 'flop';
      if (fl !== lastFlop) {
        lastFlop = fl;
        setIcon(flopIcon, fl);
      }
      sprint.setAttribute('aria-pressed', String(c.sprint));
      // An activity's own action prompt (skydive: jump out, open the chute) means "press jump".
      jump.classList.toggle('cue', !!root.querySelector('.rg-sky-prompt.on'));

      // First-play hints until the player has both moved and looked.
      if (hintT >= 0) {
        hintT += dt;
        const s = ctx.input.state;
        if (st.active && Math.hypot(s.moveX, s.moveY) > 0.2) moved = true;
        if (Math.abs(s.lookX) + Math.abs(s.lookY) > 0.002) looked = true;
        if (hintT > HINT_SECONDS || (moved && looked)) hintT = -1;
      }
      base.classList.toggle('hint', hintT >= 0 && !moved && !st.active);
      lookHint.classList.toggle('on', hintT >= 0 && !looked);
    },
  };
}
