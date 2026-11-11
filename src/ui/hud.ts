/** In-game HUD: wallet + combo, missions, stars, timer ring, prompt, toasts, "gem nearby" glow. */
import type { GameContext, IconName } from '../types';
import { clear, h, retrigger } from './dom';
import type { EconTracker } from './econState';
import { formatTime, timeFraction } from './format';
import { createHudEcon } from './hudEcon';
import { outfitIcon, stuntIcon, useKey } from './glyphs';
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

export function createHud(ctx: GameContext, tracker: EconTracker): Hud {
  const el = h('div', 'hud');

  // counters: the wallet (gems are money) is the main one; see hudEcon.ts
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
  const toastNodes = (kids: (HTMLElement | null)[], cls = ''): void => {
    const t = h('div', `toast ${cls}`.trim(), { 'data-testid': 'toast' }, ...kids);
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstElementChild?.remove();
    t.addEventListener('animationend', () => t.remove());
    setTimeout(() => t.remove(), 3200);
  };
  const econ = createHudEcon(ctx, tracker, toastNodes);
  const gems = econ.top;
  econ.row2.prepend(stars);
  el.append(glow, econ.top, econ.missions, timer, prompt, toasts, econ.moments);
  ctx.uiRoot.append(el);

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

  const toast = (ic: IconName, text?: string, extra?: UiIconName): void =>
    toastNodes([icon(ic), extra ? icon(extra) : null, text ? h('span', 't', {}, text) : null]);
  // Items the shop catalog knows get the bigger unlock moment (item:unlocked) instead of a toast.
  const known = (id: string): boolean => !!ctx.economy.item(id);

  const offs = [
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
      toast(stuntIcon(e.kind), e.stars > 0 ? `+${e.stars}` : undefined, e.stars > 0 ? 'star' : undefined);
      if (e.stars > 0) retrigger(stars, 'pop');
    }),
    ctx.events.on('chest:opened', (e) => {
      if (!known(e.outfitId)) toast('chest', undefined, outfitIcon(e.outfitId));
    }),
    ctx.events.on('outfit:unlocked', (e) => {
      if (!known(e.outfitId)) toast(outfitIcon(e.outfitId), undefined, 'sparkle');
    }),
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
        econ.reset();
      }
    },
    update(dt) {
      const s = ctx.session.state;
      econ.update(dt);
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
