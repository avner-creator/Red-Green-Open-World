/**
 * HUD meaning, without reading: hover (free mouse) or tap a top-bar counter and a picture
 * "equation" pops under it (gem → hat: gems buy things; flip → star: tricks earn stars …).
 * The first time each counter matters (per profile) it pulses and shows its picture once.
 * Pictures only use both-eye icons; nothing here knows where any gem is.
 */
import type { GameContext } from '../types';
import { h } from './dom';
import { passIcon } from './funPass';
import type { UiIconName } from './icons';
import { pictogram } from './wayIcons';
import type { PictoName } from './wayIcons';

export type HudChip = 'wallet' | 'stars' | 'combo' | 'timer' | 'pass';

const SEL: Record<HudChip, string> = {
  wallet: '.hud [data-testid="wallet"]',
  stars: '.hud [data-testid="stars"]',
  combo: '.hud [data-testid="combo"]',
  timer: '.hud [data-testid="timer"]',
  pass: '.hud [data-testid="missions"]',
};

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 9h11V3.5L22 12l-9 8.5V15H2z"/></svg>';
const STORE_KEY = 'rgow.hudtips.v1';

type Part = PictoName | 'arrow' | 'pass' | `t:${string}`;

/** Each chip's picture rows. */
export const EXPLAIN_ROWS: Record<HudChip, Part[][]> = {
  wallet: [
    ['gem', 'arrow', 'hat', 'cape'],
    ['megaGem', 'arrow', 'gem', 't:×5'],
    ['ticket', 'arrow', 'gem'],
  ],
  stars: [['wAir', 'arrow', 'star']],
  combo: [['gem', 'gem', 'gem', 'bolt', 'arrow', 't:×2']],
  timer: [['sun', 'arrow', 'flag']],
  pass: [['wTrampoline', 'arrow', 'check'], ['check', 'check', 'check', 'arrow', 'chest']],
};

function part(p: Part): HTMLElement {
  if (p === 'arrow') {
    const el = h('span', 'ic xar');
    el.innerHTML = ARROW;
    return el;
  }
  if (p === 'pass') return passIcon();
  if (p.startsWith('t:')) return h('span', 't xt', {}, p.slice(2));
  return pictogram(p as PictoName);
}

export interface HudExplain {
  update(dt: number): void;
  /** Show a chip's picture now (also used for the first-time callouts). */
  show(chip: HudChip, seconds?: number): void;
}

export function createHudExplain(ctx: GameContext, hud: HTMLElement): HudExplain {
  const bubble = h('div', 'xbub', { 'data-testid': 'hud-explain', role: 'tooltip' });
  hud.append(bubble);
  let shown: HudChip | null = null;
  let left = 0;
  let hoverChip: HudChip | null = null;

  let seen: Record<string, boolean> = {};
  try {
    seen = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    seen = {};
  }
  const markSeen = (c: HudChip): void => {
    seen[c] = true;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(seen));
    } catch {
      /* storage blocked: the callout may repeat next time */
    }
  };

  const passOpen = (): boolean => !!ctx.uiRoot.querySelector('.pass-over.on, .wf-card.on');
  const el = (c: HudChip): HTMLElement | null => ctx.uiRoot.querySelector<HTMLElement>(SEL[c]);

  const place = (): void => {
    if (!shown) return;
    const t = el(shown);
    const r = t?.getBoundingClientRect();
    const host = ctx.uiRoot.getBoundingClientRect();
    if (!t || !r || r.width < 2) {
      hide();
      return;
    }
    const w = bubble.offsetWidth;
    const x = Math.max(6, Math.min(host.width - w - 6, r.left - host.left + r.width / 2 - w / 2));
    bubble.style.left = `${x}px`;
    bubble.style.top = `${r.bottom - host.top + 10}px`;
    bubble.style.setProperty('--tx', `${r.left - host.left + r.width / 2 - x}px`);
  };
  const hide = (): void => {
    shown = null;
    bubble.classList.remove('on');
    ctx.uiRoot.querySelectorAll('.hud .xpulse').forEach((e) => e.classList.remove('xpulse'));
  };

  const api: HudExplain = {
    show(c, seconds = 2.6) {
      if (ctx.session.state.phase !== 'playing' || passOpen()) return;
      if (shown !== c) {
        bubble.replaceChildren(...EXPLAIN_ROWS[c].map((row) => h('div', 'xrow', {}, ...row.map(part))));
        bubble.dataset.chip = c;
      }
      shown = c;
      left = seconds;
      bubble.classList.add('on');
      place();
    },
    update(dt) {
      if (ctx.session.state.phase !== 'playing') {
        if (shown) hide();
        return;
      }
      if (shown && passOpen()) hide();
      if (shown) {
        left -= dt;
        if (left <= 0 && hoverChip !== shown) hide();
        else place();
      }
    },
  };

  /** First time a chip matters: pulse it and show its picture once (saved per profile). */
  const first = (c: HudChip): void => {
    if (seen[c] || ctx.session.state.phase !== 'playing') return;
    markSeen(c);
    const t = el(c);
    if (t) {
      t.classList.remove('xpulse');
      void t.offsetWidth;
      t.classList.add('xpulse');
      window.setTimeout(() => t.classList.remove('xpulse'), 4200);
    }
    api.show(c, 4);
  };
  ctx.events.on('wallet:changed', (e) => {
    if (e.reason === 'gem' && e.delta > 0) first('wallet');
  });
  ctx.events.on('stunt', (e) => {
    if (e.stars > 0) first('stars');
  });
  ctx.events.on('combo:changed', (e) => {
    if (e.multiplier > 1) first('combo');
  });
  ctx.events.on('session:tick', (e) => {
    if (e.remaining <= 60 && e.remaining > 0) first('timer');
  });
  ctx.events.on('ticket:paid', () => window.setTimeout(() => first('pass'), 2000));

  // Hover (mouse, not captured) and tap: hit-test the chips' boxes (most are pointer-events: none).
  const hit = (x: number, y: number): HudChip | null => {
    for (const c of Object.keys(SEL) as HudChip[]) {
      const r = el(c)?.getBoundingClientRect();
      if (r && r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c;
    }
    return null;
  };
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || document.pointerLockElement || ctx.session.state.phase !== 'playing') return;
      const c = hit(e.clientX, e.clientY);
      hoverChip = c;
      if (c) api.show(c, 0.4);
    },
    { passive: true },
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (ctx.session.state.phase !== 'playing' || (e.pointerType === 'mouse' && document.pointerLockElement)) return;
      const c = hit(e.clientX, e.clientY);
      if (c && c !== 'pass') api.show(c, 3);
    },
    { passive: true },
  );

  return api;
}

/** Icons used above (exported for the unit test that checks every picture part exists). */
export const EXPLAIN_ICONS: readonly (UiIconName | PictoName)[] = Object.values(EXPLAIN_ROWS)
  .flat(2)
  .filter((p): p is PictoName => p !== 'arrow' && p !== 'pass' && !p.startsWith('t:'));
