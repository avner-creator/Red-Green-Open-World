/** In-game HUD: gems, stars, timer ring, prompt, toasts, "gem nearby" glow. */
import type { GameContext, IconName } from '../types';
import { clear, h, retrigger } from './dom';
import { counterText, formatTime, timeFraction } from './format';
import { outfitIcon, STUNT_ICON, useKey } from './glyphs';
import { icon } from './icons';
import type { UiIconName } from './icons';

const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;
const NS = 'http://www.w3.org/2000/svg';

export interface Hud {
  el: HTMLElement;
  setVisible(on: boolean): void;
  update(dt: number): void;
}

export function createHud(ctx: GameContext): Hud {
  const el = h('div', 'hud');

  // counters
  const gemText = h('span', 't', {}, '0');
  const gems = h('div', 'pill gems', { 'data-testid': 'gems' }, icon('gem'), gemText);
  const starText = h('span', 't', {}, '0');
  const stars = h('div', 'pill stars', { 'data-testid': 'stars' }, icon('star'), starText);

  // timer ring
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  const mk = (stroke: string, w: number): SVGCircleElement => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '18');
    c.setAttribute('cy', '18');
    c.setAttribute('r', String(RING_R));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', stroke);
    c.setAttribute('stroke-width', String(w));
    c.setAttribute('stroke-linecap', 'round');
    return c;
  };
  const back = mk('#000', 6.4);
  const track = mk('#2a3160', 4);
  const arc = mk('#ffd93b', 4);
  arc.setAttribute('stroke-dasharray', `${RING_C}`);
  svg.append(back, track, arc);
  const timeText = h('span', 't txt', {}, '5:00');
  const timer = h('div', 'timer', { 'data-testid': 'timer' }, h('div', 'ring', {}, svg, icon('sun')), timeText);

  // prompt
  const prompt = h('div', 'prompt', { 'data-testid': 'prompt' });
  // toasts
  const toasts = h('div', 'toasts', { 'data-testid': 'toasts' });
  const glow = h('div', 'glow');
  el.append(glow, gems, stars, timer, prompt, toasts);
  ctx.uiRoot.append(el);

  let lastGems = -1;
  let lastTotal = -1;
  let lastStars = -1;
  let lastSecond = -1;
  let lastFrac = -1;
  let focusIcon: IconName | null = null;
  let gamepad = false;

  const renderPrompt = (): void => {
    clear(prompt);
    if (!focusIcon) {
      prompt.classList.remove('on');
      return;
    }
    prompt.append(icon(focusIcon), useKey(gamepad));
    prompt.classList.add('on');
  };

  const toast = (ic: IconName, text?: string, extra?: UiIconName): void => {
    const t = h('div', 'toast', {}, icon(ic), extra ? icon(extra) : null, text ? h('span', 't', {}, text) : null);
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    t.addEventListener('animationend', () => t.remove());
    setTimeout(() => t.remove(), 3200);
  };

  const offs = [
    ctx.events.on('gem:collected', () => retrigger(gems, 'pop')),
    ctx.events.on('gem:near', () => {
      // Deliberately directionless: a uniform soft glow, no id/distance/position is shown.
      retrigger(glow, 'on');
      retrigger(gems, 'near');
    }),
    ctx.events.on('interact:focus', (e) => {
      focusIcon = e.target ? e.target.icon : null;
      renderPrompt();
    }),
    ctx.events.on('ui:toast', (e) => toast(e.icon, e.text)),
    ctx.events.on('stunt', (e) => {
      toast(STUNT_ICON[e.kind], e.stars > 0 ? `+${e.stars}` : undefined, e.stars > 0 ? 'star' : undefined);
      if (e.stars > 0) retrigger(stars, 'pop');
    }),
    ctx.events.on('chest:opened', (e) => toast('chest', undefined, outfitIcon(e.outfitId))),
    ctx.events.on('outfit:unlocked', (e) => toast(outfitIcon(e.outfitId), undefined, 'sparkle')),
    ctx.events.on('session:tick', (e) => {
      const sec = Math.ceil(e.remaining);
      const frac = timeFraction(e.remaining, e.total);
      if (sec !== lastSecond) {
        lastSecond = sec;
        timeText.textContent = formatTime(e.remaining);
        timer.classList.toggle('low', e.remaining <= 30 && e.remaining > 0);
      }
      if (Math.abs(frac - lastFrac) > 0.0005) {
        lastFrac = frac;
        arc.setAttribute('stroke-dashoffset', String(RING_C * (1 - frac)));
      }
    }),
  ];
  void offs;

  return {
    el,
    setVisible(on) {
      el.classList.toggle('on', on);
      if (!on) {
        focusIcon = null;
        renderPrompt();
        toasts.replaceChildren();
      } else {
        lastGems = -1;
      }
    },
    update() {
      const s = ctx.session.state;
      if (s.gems !== lastGems || s.gemsTotal !== lastTotal) {
        lastGems = s.gems;
        lastTotal = s.gemsTotal;
        gemText.textContent = counterText(s.gems, s.gemsTotal);
      }
      if (s.stars !== lastStars) {
        lastStars = s.stars;
        starText.textContent = String(s.stars);
      }
      const pad = ctx.input.state.device === 'gamepad';
      if (pad !== gamepad) {
        gamepad = pad;
        if (focusIcon) renderPrompt();
      }
    },
  };
}
