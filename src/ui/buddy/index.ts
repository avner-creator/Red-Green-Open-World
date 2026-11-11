/**
 * Pip's UI: the speech bubble (one at a time, typewriter, anchored above Pip and kept off the
 * hero), HUD callouts (ring + wobbling arrow around an element) and the round "Pip" button.
 * Created by `src/buddy/index.ts`; everything lives inside `ctx.uiRoot`.
 */
import type { ActiveLine } from '../../buddy/dialogue';
import { PRIORITY } from '../../buddy/dialogue';
import { HUD } from '../../buddy/script';
import type { HudKey } from '../../buddy/script';
import { clear, h, retrigger } from '../dom';
import { cap, padButton } from '../glyphs';
import { actionGlyph } from './action';
import { injectBuddyCss } from './css';
import { buddyPicto } from './picto';
import { placeBubble } from './place';
import type { Rect } from './place';

export interface BuddyUi {
  readonly button: HTMLButtonElement;
  readonly bubble: HTMLElement;
  /** Show a line (null hides the bubble). */
  show(active: ActiveLine | null): void;
  /**
   * Per frame: typewriter fraction, Pip's head on screen (px in uiRoot space, null = off screen:
   * the bubble docks next to the Pip button) and the hero's screen box to keep clear.
   */
  update(reveal: number, pip: { x: number; y: number; on?: boolean } | null, hero: Rect | null): void;
  setDevice(device: 'keyboard' | 'gamepad' | 'touch'): void;
  /** HUD element under the last mouse position, if Pip can explain it. */
  hovered(): HudKey | null;
  onAsk(fn: () => void): void;
  onTapBubble(fn: () => void): void;
  dispose(): void;
}

const ARROW =
  '<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M2 20 L26 2 L26 12 L58 12 L58 28 L26 28 L26 38 Z" fill="#ffd93b" stroke="#000" stroke-width="4.5" stroke-linejoin="round"/><path d="M8 20 L24 8" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/></svg>';

export function createBuddyUi(root: HTMLElement): BuddyUi {
  injectBuddyCss();
  const pic = h('span', 'pic');
  const act = h('span', 'act');
  const extra = h('span', 'pic2');
  const shown = h('span', '');
  const hidden = h('span', 'hide');
  const say = h('span', 'say t', {}, shown, hidden);
  const bubble = h('div', 'pipb', { 'data-testid': 'pip-bubble', role: 'status', 'aria-live': 'polite' }, pic, act, extra, say);
  const ring = h('div', 'pipring', { 'data-testid': 'pip-callout' });
  const arrow = h('div', 'piparrow');
  arrow.innerHTML = ARROW;
  const keySlot = h('span', '');
  const button = h('button', 'pipbtn', { type: 'button', 'aria-label': 'Ask Pip', 'data-testid': 'pip-button' }, buddyPicto('pip'), keySlot);
  root.append(ring, arrow, button, bubble);

  let active: ActiveLine | null = null;
  let revealed = -1;
  let callout: string | null = null;
  let device: 'keyboard' | 'gamepad' | 'touch' | null = null;
  /** Draw the action glyph (key cap / pad button / touch gesture) for the current device. */
  const drawAction = (): void => {
    clear(act);
    const a = active?.line.action;
    act.classList.toggle('on', !!a);
    bubble.dataset.action = a ?? '';
    if (a) act.append(actionGlyph(a, device ?? 'keyboard'));
  };
  let mouse: { x: number; y: number } | null = null;
  let askFn: () => void = () => {};
  let tapFn: () => void = () => {};

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && !document.pointerLockElement) mouse = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    retrigger(button, 'down');
    askFn();
  });
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    tapFn();
  });

  const bounds = (): Rect => {
    const w = root.clientWidth || window.innerWidth;
    const hh = root.clientHeight || window.innerHeight;
    const m = Math.max(8, Math.min(w, hh) * 0.02);
    // Keep clear of the top HUD row (wallet, timer, compass).
    const top = Math.max(m, hh * 0.13);
    return { x: m, y: top, w: w - 2 * m, h: hh - top - m };
  };

  /** Screen boxes of the HUD pieces the bubble must not cover (relative to the UI root). */
  const AVOID =
    '[data-testid="wallet"],[data-testid="combo"],[data-testid="missions"],[data-testid="compass"],[data-testid="skill-chip"],' +
    '[data-testid="prompt"],[data-testid="mode-strip"],[data-testid="stars"],[data-testid="timer"],[data-testid="help"],' +
    '[data-testid^="touch-"],[data-testid="pip-button"]';
  const hudRects = (host: DOMRect): Rect[] => {
    const out: Rect[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(AVOID)) {
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      out.push({ x: b.left - host.left, y: b.top - host.top, w: b.width, h: b.height });
    }
    return out;
  };

  const placeCallout = (): void => {
    if (!callout) return;
    const el = root.querySelector<HTMLElement>(callout);
    const r = el?.getBoundingClientRect();
    const host = root.getBoundingClientRect();
    if (!el || !r || r.width < 2 || r.height < 2 || getComputedStyle(el).visibility === 'hidden') {
      ring.classList.remove('on');
      arrow.classList.remove('on');
      return;
    }
    const pad = Math.max(5, Math.min(host.width, host.height) * 0.012);
    const x = r.left - host.left - pad;
    const y = r.top - host.top - pad;
    const w = r.width + pad * 2;
    const hh = r.height + pad * 2;
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = `${w}px`;
    ring.style.height = `${hh}px`;
    ring.classList.add('on');
    // Arrow: outside the ring, on the side facing the screen centre, pointing at the ring.
    const cx = x + w / 2;
    const cy = y + hh / 2;
    const sx = host.width / 2 - cx;
    const sy = host.height / 2 - cy;
    const len = Math.hypot(sx, sy) || 1;
    const ux = sx / len;
    const uy = sy / len;
    // Distance from the ring centre to its edge along (ux, uy).
    const edge = Math.min(Math.abs(w / 2 / (ux || 1e-6)), Math.abs(hh / 2 / (uy || 1e-6)));
    const tipX = cx + ux * (edge + 4);
    const tipY = cy + uy * (edge + 4);
    const ang = Math.atan2(-uy, -ux) + Math.PI; // arrow svg points left (tip at x=0)
    arrow.style.left = `${tipX}px`;
    arrow.style.top = `${tipY - arrow.offsetHeight / 2}px`;
    arrow.style.transform = `rotate(${ang}rad)`;
    arrow.classList.add('on');
  };

  return {
    button,
    bubble,
    show(a) {
      active = a;
      revealed = -1;
      callout = a?.line.callout ?? null;
      if (!callout) {
        ring.classList.remove('on');
        arrow.classList.remove('on');
      }
      if (!a) {
        bubble.classList.remove('on');
        button.classList.remove('talk');
        return;
      }
      clear(pic);
      pic.append(buddyPicto(a.line.icon));
      clear(extra);
      extra.classList.toggle('on', !!a.line.extra);
      if (a.line.extra) extra.append(buddyPicto(a.line.extra));
      bubble.dataset.extra = a.line.extra ?? '';
      drawAction();
      shown.textContent = '';
      hidden.textContent = a.line.text;
      bubble.dataset.text = a.line.text;
      bubble.dataset.icon = a.line.icon;
      bubble.dataset.id = a.line.id ?? '';
      bubble.classList.toggle('story', a.line.priority >= PRIORITY.story);
      bubble.classList.add('on');
      retrigger(bubble, 'pop');
      button.classList.add('talk');
    },
    update(reveal, pip, hero) {
      if (!active) return;
      const text = active.line.text;
      const k = Math.round(reveal * text.length);
      if (k !== revealed) {
        revealed = k;
        shown.textContent = text.slice(0, k);
        hidden.textContent = text.slice(k);
      }
      const host = root.getBoundingClientRect();
      const w = bubble.offsetWidth;
      const hh = bubble.offsetHeight;
      const u = Math.max(5, Math.min(22, Math.min(host.width, host.height) * 0.01));
      let anchor: { x: number; y: number } | null = pip;
      bubble.classList.toggle('edge', !!pip && pip.on === false);
      if (!anchor) {
        // Pip is off screen: dock beside the Pip button, tail towards it.
        const b = button.getBoundingClientRect();
        anchor = { x: b.left - host.left + b.width / 2, y: b.top - host.top };
      }
      const p = placeBubble(anchor, w, hh, bounds(), hero, u * 3.4, hudRects(host));
      bubble.style.left = `${p.x}px`;
      bubble.style.top = `${p.y}px`;
      bubble.style.setProperty('--tx', `${p.tail}px`);
      bubble.classList.toggle('below', p.below);
      placeCallout();
    },
    setDevice(d) {
      if (d === device) return;
      device = d;
      if (active) drawAction();
      clear(keySlot);
      if (d === 'keyboard') keySlot.append(cap('T'));
      else if (d === 'gamepad') keySlot.append(padButton('↓'));
    },
    hovered() {
      if (!mouse) return null;
      // HUD elements have pointer-events: none, so hit-test their boxes instead of elementsFromPoint.
      for (const key of Object.keys(HUD) as HudKey[]) {
        const el = root.querySelector(HUD[key]);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom) return key;
      }
      return null;
    },
    onAsk(fn) {
      askFn = fn;
    },
    onTapBubble(fn) {
      tapFn = fn;
    },
    dispose() {
      window.removeEventListener('pointermove', onMove);
      bubble.remove();
      ring.remove();
      arrow.remove();
      button.remove();
    },
  };
}
