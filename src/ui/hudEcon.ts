/**
 * Economy parts of the HUD: wallet counter (with +N pops), combo badge with a shrinking ring,
 * the three mission cards, ticket feedback and the compact unlock / jackpot moments.
 * Everything pops at the HUD itself, never at a place in the world (gems are weak-eye-only).
 */
import { ECONOMY } from '../config';
import type { GameContext, IconName, MissionState } from '../types';
import { h, retrigger } from './dom';
import { comboFraction, deltaText, missionFraction, missionText, popKindFor } from './econ';
import type { EconTracker } from './econState';
import { outfitIcon } from './glyphs';
import { icon } from './icons';
import { itemPicture } from './itemArt';
import type { UiIconName } from './icons';
import { createWalletChip } from './wallet';

const NS = 'http://www.w3.org/2000/svg';
const CR = 20;
const CC = 2 * Math.PI * CR;

export interface HudEcon {
  /** The top-left cluster: wallet, then a row (stars pill goes first, then the combo badge). */
  top: HTMLElement;
  row2: HTMLElement;
  missions: HTMLElement;
  moments: HTMLElement;
  update(dt: number): void;
  /** HUD shown again: jump the wallet to its value. */
  reset(): void;
}

type Toast = (kids: (HTMLElement | null)[], cls?: string) => void;

/** Icon for an item id: the catalog's icon, else a guess from the id. */
export function itemIcon(ctx: GameContext, id: string): IconName {
  return ctx.economy.item(id)?.icon ?? outfitIcon(id);
}

function ring(): { svg: SVGSVGElement; arc: SVGCircleElement } {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  const mk = (stroke: string, w: number): SVGCircleElement => {
    const c = document.createElementNS(NS, 'circle');
    for (const [k, v] of Object.entries({ cx: '24', cy: '24', r: String(CR), fill: 'none', stroke, 'stroke-width': String(w), 'stroke-linecap': 'round' })) c.setAttribute(k, v);
    return c;
  };
  const arc = mk('#ffd93b', 5);
  arc.setAttribute('stroke-dasharray', String(CC));
  svg.append(mk('#000', 9), mk('#262c55', 5), arc);
  return { svg, arc };
}

export function createHudEcon(ctx: GameContext, tracker: EconTracker, toast: Toast): HudEcon {
  const wallet = createWalletChip(ctx, 'hudw', 'wallet');

  // ── combo badge ──
  const { svg, arc } = ring();
  const comboText = h('span', 't x', {}, '×2');
  const combo = h('div', 'combo', { 'data-testid': 'combo', 'data-mult': '1' }, svg, h('span', 'fl', {}, icon('combo')), comboText);
  let mult = 1;
  let localLeft = 0;
  let lastFrac = -1;
  const setCombo = (m: number): void => {
    const prev = mult;
    mult = Math.max(1, Math.min(ECONOMY.comboMax, Math.round(m)));
    combo.dataset.mult = String(mult);
    combo.classList.toggle('on', mult > 1);
    if (mult > 1) {
      comboText.textContent = `×${mult}`;
      localLeft = ECONOMY.comboWindow;
      if (mult !== prev) retrigger(combo, 'step');
    }
  };

  const row2 = h('div', 'row2', {}, combo);
  const top = h('div', 'econtop', {}, wallet.el, row2);

  // ── mission cards ──
  const missions = h('div', 'missions', { 'data-testid': 'missions' });
  let cards: HTMLElement[] = [];
  const cardFor = (m: MissionState, i: number): HTMLElement => {
    const bar = h('i', '', { style: `--p:${missionFraction(m.progress, m.target) * 100}%` });
    return h(
      'div',
      `mcard ${m.done ? 'done' : ''}`.trim(),
      { 'data-testid': 'mission-card', 'data-done': String(m.done), 'data-i': String(i) },
      h('span', 'mi', {}, icon(m.icon)),
      h('span', 't mt', {}, missionText(m.kind, m.progress, m.target)),
      h('span', 'rw', {}, icon('gem'), h('span', '', {}, String(m.reward))),
      h('span', 'bar', {}, bar),
      h('span', 'stamp', {}, icon('check')),
    );
  };
  const renderMissions = (): void => {
    cards = tracker.missions.map(cardFor);
    missions.replaceChildren(...cards);
    missions.classList.toggle('on', cards.length > 0);
  };
  const updateCard = (i: number, m: MissionState, completed: boolean): void => {
    if (cards.length !== tracker.missions.length || !cards[i]) {
      renderMissions();
    } else {
      const fresh = cardFor(m, i);
      cards[i]?.replaceWith(fresh);
      cards[i] = fresh;
    }
    const c = cards[i];
    if (!c) return;
    retrigger(c, completed ? 'complete' : 'tick');
  };

  // ── moments (compact, never block play) ──
  const moments = h('div', 'moments', { 'data-testid': 'moments' });
  const moment = (kind: string, main: UiIconName | HTMLElement, extra: (HTMLElement | null)[] = []): void => {
    const sparks = Array.from({ length: 8 }, (_, n) => h('i', 'spk', { style: `--a:${n * 45 + 22}deg;--dl:${(n % 3) * 0.05}s` }, icon('sparkle')));
    const m = h(
      'div',
      `moment ${kind}`,
      { 'data-testid': `moment-${kind}` },
      h('span', 'rays'),
      h('span', 'badge', {}, typeof main === 'string' ? icon(main) : main),
      ...sparks,
      ...extra,
    );
    moments.replaceChildren(m);
    window.setTimeout(() => m.remove(), 2600);
  };

  const fly = (from: Element, n: number): void => {
    const a = from.getBoundingClientRect();
    const b = wallet.el.getBoundingClientRect();
    const root = ctx.uiRoot.getBoundingClientRect();
    for (let k = 0; k < n; k++) {
      const g = h('span', 'flygem', {}, icon('gem'));
      g.style.left = `${a.left - root.left + a.width / 2}px`;
      g.style.top = `${a.top - root.top + a.height / 2}px`;
      g.style.setProperty('--dx', `${b.left - a.left - a.width / 2 + 18}px`);
      g.style.setProperty('--dy', `${b.top - a.top - a.height / 2 + 14}px`);
      g.style.animationDelay = `${k * 0.08}s`;
      moments.append(g);
      window.setTimeout(() => g.remove(), 1400);
    }
  };

  // A mega gem and its wallet change arrive as two events (either order): pair them up.
  let megaAt = -1e9;
  let megaPop: { at: number } | null = null;

  const offs = [
    ctx.events.on('wallet:changed', (e) => {
      if (e.delta === 0) return;
      const now = performance.now();
      const kind = popKindFor(e.reason, e.delta, e.reason === 'gem' && now - megaAt < 120);
      if (e.reason === 'gem' && kind === 'gem') megaPop = { at: now };
      wallet.pop(e.delta, kind);
    }),
    ctx.events.on('gem:collected', (e) => {
      if (!e.mega) return;
      const now = performance.now();
      megaAt = now;
      // The wallet change came first: show the mega flourish on top of it.
      if (megaPop && now - megaPop.at < 120) {
        megaPop = null;
        wallet.promoteMega();
      }
    }),
    ctx.events.on('combo:changed', (e) => setCombo(e.multiplier)),
    ctx.events.on('ticket:paid', (e) => {
      if (e.free) wallet.pop(0, 'free');
    }),
    ctx.events.on('ticket:denied', (e) => {
      wallet.shake();
      ctx.audio.play('bump');
      toast([icon('ticket'), h('span', 'need', {}, icon('gem'), h('span', 't', {}, String(e.price)))], 'deny');
    }),
    ctx.events.on('mission:progress', (e) => updateCard(e.index, tracker.missions[e.index] ?? e.mission, false)),
    ctx.events.on('mission:completed', (e) => {
      updateCard(e.index, tracker.missions[e.index] ?? { ...e.mission, done: true }, true);
      ctx.audio.play('star');
      const c = cards[e.index];
      if (c) window.setTimeout(() => c.isConnected && fly(c, 4), 350);
    }),
    ctx.events.on('mission:jackpot', (e) => {
      ctx.audio.play('fanfare');
      for (const c of cards) retrigger(c, 'complete');
      moment('jackpot', 'jackpot', [h('span', 'amt', {}, icon('gem'), h('span', 't', {}, deltaText(e.reward)))]);
    }),
    ctx.events.on('item:unlocked', (e) => {
      if (e.source !== 'chest') return;
      moment('unlock', itemPicture(ctx.economy.item(e.itemId), itemIcon(ctx, e.itemId)), [h('span', 'src', {}, icon('chest'))]);
    }),
    ctx.events.on('session:phase', (e) => {
      if (e.phase === 'playing' && e.previous !== 'paused') {
        setCombo(1);
        renderMissions();
        moments.replaceChildren();
      }
    }),
    ctx.events.on('profile:reset', () => wallet.snap()),
  ];
  void offs;
  renderMissions();

  return {
    top,
    row2,
    missions,
    moments,
    reset() {
      wallet.snap();
      if (tracker.sync() || cards.length !== tracker.missions.length) renderMissions();
    },
    update(dt) {
      wallet.update(dt);
      if (tracker.sync()) renderMissions();
      if (mult > 1) {
        localLeft -= dt;
        const eco = ctx.economy.combo;
        const left = eco.multiplier > 1 ? eco.timeLeft : localLeft;
        const frac = comboFraction(left, ECONOMY.comboWindow);
        if (Math.abs(frac - lastFrac) > 0.002) {
          lastFrac = frac;
          arc.setAttribute('stroke-dashoffset', String(CC * (1 - frac)));
          combo.classList.toggle('late', frac < 0.3);
        }
        // Safety net if the drop back to ×1 is never announced.
        if (eco.multiplier <= 1 && localLeft < -0.6) setCombo(1);
      }
    },
  };
}
