/**
 * Gear Shack (shop) and wardrobe: one screen, two modes.
 * - shop: icon tabs per category, a grid of item cards; select = buy (if affordable) or wear/take off.
 * - wardrobe: owned items only, one row per slot; select = wear / take off.
 * Every card state differs by shape and brightness, not by hue: price tag (bright = can buy,
 * dark + progress bar = not yet), check badge (owned), thick glowing frame + ribbon (worn),
 * chest badge (chest-only).
 */
import type { GameContext, ShopCategory, ShopItem } from '../types';
import { h, retrigger } from './dom';
import { CATEGORY_ICON, cardState, missingGems, shopCategories, SLOT_ICON, wardrobeGroups } from './econ';
import type { CardState } from './econ';
import { icon } from './icons';
import { itemPicture } from './itemArt';
import type { Screen } from './screens';
import { createWalletChip } from './wallet';

export type ShopMode = 'shop' | 'wardrobe';

export interface ShopScreen extends Screen {
  update(dt: number): void;
  /** Gamepad bumpers / Q,E: previous or next tab. */
  tab(dir: 1 | -1): void;
}

const CONFETTI = ['#ffd93b', '#ffffff', '#ffb02e', '#7fe3ff', '#ff8fc7', '#c8ff7f'];
const CELEBRATE_MS = 1900;

export function createShop(ctx: GameContext, mode: ShopMode, onClose: () => void): ShopScreen {
  const wallet = createWalletChip(ctx, 'shopw', mode === 'shop' ? 'shop-wallet' : 'wardrobe-wallet');
  const close = h('button', 'b d sm close', { type: 'button', 'aria-label': 'Close', 'data-testid': `${mode}-close` }, icon('close'));
  close.addEventListener('click', onClose);
  const tabs = h('div', 'tabs stabs', { role: 'tablist' });
  const head = h('div', 'head t', {}, icon(mode === 'shop' ? 'shop' : 'backpack'));
  const grid = h('div', `sgrid ${mode}`, { 'data-testid': `${mode}-grid` });
  const fx = h('div', 'celebrate', { 'data-testid': mode === 'shop' ? 'unlock-moment' : 'wardrobe-moment', 'aria-hidden': 'true' });
  const panel = h(
    'div',
    `panel shop m-${mode}`,
    { 'data-testid': mode },
    h('div', 'bar', {}, head, tabs, wallet.el, close),
    grid,
    fx,
  );
  const el = h('div', 'screen dim shopscr', { 'data-screen': mode }, panel);

  let cat: ShopCategory | null = null;
  let cats: ShopCategory[] = [];
  let celebrating = 0;
  let fxTimer = 0;

  const hideFx = (): void => {
    celebrating = 0;
    window.clearTimeout(fxTimer);
    fx.classList.remove('on');
    fx.replaceChildren();
  };
  fx.addEventListener('click', hideFx);

  const celebrate = (it: ShopItem): void => {
    const conf = Array.from({ length: 36 }, (_, n) =>
      h('i', 'cf', { style: `--a:${(n * 137) % 360}deg;--r:${38 + ((n * 53) % 40)}vmin;--c:${CONFETTI[n % CONFETTI.length]};--dl:${(n % 6) * 0.03}s;--s:${0.7 + (n % 3) * 0.3}` }),
    );
    const sparks = Array.from({ length: 10 }, (_, n) => h('i', 'spk', { style: `--a:${n * 36}deg;--dl:${0.1 + (n % 4) * 0.06}s` }, icon('sparkle')));
    fx.replaceChildren(
      h('span', 'rays'),
      h('span', 'rays r2'),
      ...conf,
      art(it, 'badge'),
      ...sparks,
      h('span', 'worn', {}, icon('check')),
    );
    fx.classList.remove('on');
    void fx.offsetWidth;
    fx.classList.add('on');
    celebrating = performance.now();
    window.clearTimeout(fxTimer);
    fxTimer = window.setTimeout(hideFx, CELEBRATE_MS);
    ctx.audio.play('fanfare');
  };

  /** The item's picture (preview image, else swatch + icon), built only when shown. */
  const art = (it: ShopItem, cls: string): HTMLElement => {
    const pic = itemPicture(it, it.icon);
    const isImg = pic.tagName === 'IMG';
    return h(
      'span',
      `${cls} ${isImg ? 'has-pic' : ''}`.trim(),
      { style: it.swatch && !isImg ? `--sw:${it.swatch}` : '' },
      it.swatch && !isImg ? h('span', 'sw') : null,
      pic,
    );
  };

  const card = (it: ShopItem): HTMLButtonElement => {
    const owned = ctx.profile.owns(it.id);
    const st: CardState = cardState(it, owned, ctx.profile.equipped(it.slot), ctx.profile.wallet);
    const miss = missingGems(it.price, ctx.profile.wallet);
    let foot: HTMLElement | null = null;
    if (mode === 'shop') {
      if (st === 'buy') foot = h('span', 'price', {}, icon('gem'), h('span', '', {}, String(it.price)));
      else if (st === 'poor')
        foot = h(
          'span',
          'price poor',
          {},
          icon('gem'),
          h('span', '', {}, String(it.price)),
          h('span', 'prog', { style: `--p:${Math.round((1 - miss / Math.max(1, it.price)) * 100)}%` }),
        );
      else if (st === 'chest') foot = h('span', 'price chest', {}, icon('chest'));
    }
    const b = h(
      'button',
      `b card s-${st}`,
      { type: 'button', 'aria-label': it.name, 'data-testid': 'shop-card', 'data-item': it.id, 'data-state': st, 'aria-pressed': String(st === 'equipped') },
      art(it, 'pv'),
      foot,
      st === 'owned' ? h('span', 'own', {}, icon('check')) : null,
      st === 'equipped' ? h('span', 'ribbon', {}, icon('check')) : null,
      st === 'poor' ? h('span', 'miss', {}, h('span', 't', {}, `+${miss}`), icon('gem')) : null,
    );
    b.addEventListener('click', () => pick(it, b));
    return b;
  };

  const pick = (it: ShopItem, b: HTMLElement): void => {
    if (celebrating) {
      hideFx();
      return;
    }
    const owned = ctx.profile.owns(it.id);
    if (owned) {
      const on = ctx.profile.equipped(it.slot) === it.id;
      ctx.economy.equip(it.slot, on ? null : it.id);
      ctx.audio.play('click');
      render(it.id, on ? 'off' : 'wear');
      return;
    }
    if (mode !== 'shop') return;
    const r = ctx.economy.buy(it.id);
    if (r === 'ok') {
      render(it.id, 'bought');
      celebrate(it);
      return;
    }
    // Not enough gems (or chest-only): a friendly wiggle, never a dead end.
    ctx.audio.play('bump');
    retrigger(b, 'shake');
    if (r === 'tooPoor') wallet.shake();
  };

  const tabBtn = (c: ShopCategory): HTMLButtonElement => {
    const t = h('button', 'b d sm tab', { type: 'button', role: 'tab', 'aria-label': c, 'data-testid': `shop-tab-${c}`, 'data-cat': c }, icon(CATEGORY_ICON[c]));
    t.addEventListener('click', () => {
      cat = c;
      render(null);
      t.focus({ preventScroll: true });
    });
    return t;
  };

  /** Redraw the grid; keep focus on `focusId`'s card (or the same index) and play `anim` on it. */
  function render(focusId: string | null, anim?: string): void {
    const activeIdx = [...grid.querySelectorAll('.card')].indexOf(document.activeElement as Element);
    const catalog = ctx.economy.catalog;
    grid.replaceChildren();
    if (mode === 'shop') {
      cats = shopCategories(catalog);
      if (!cat || !cats.includes(cat)) cat = cats[0] ?? null;
      tabs.replaceChildren(...cats.map(tabBtn));
      tabs.classList.toggle('one', cats.length <= 1);
      for (const t of tabs.querySelectorAll<HTMLElement>('.tab')) {
        const sel = t.dataset.cat === cat;
        t.setAttribute('aria-selected', String(sel));
        t.setAttribute('aria-pressed', String(sel));
      }
      const items = catalog.filter((i) => i.category === cat);
      grid.append(...items.map(card));
      if (!items.length) grid.append(h('div', 'empty', {}, icon('shop'), icon('clock')));
    } else {
      const groups = wardrobeGroups(catalog, (id) => ctx.profile.owns(id));
      for (const g of groups) grid.append(h('div', 'wrow', { 'data-slot': g.slot }, h('span', 'slot', {}, icon(SLOT_ICON[g.slot])), h('div', 'wcards', {}, ...g.items.map(card))));
      if (!groups.length) grid.append(h('div', 'empty', {}, icon('backpack'), icon('shop')));
    }
    const cards = [...grid.querySelectorAll<HTMLElement>('.card')];
    const target = (focusId ? cards.find((c) => c.dataset.item === focusId) : null) ?? (activeIdx >= 0 ? cards[Math.min(activeIdx, cards.length - 1)] : null);
    if (target && (focusId || activeIdx >= 0)) target.focus({ preventScroll: false });
    if (target && anim) retrigger(target, anim);
  }

  const refresh = (): void => {
    if (el.classList.contains('on') && !celebrating) render(null);
  };
  ctx.events.on('item:equipped', refresh);
  ctx.events.on('profile:reset', refresh);

  return {
    el,
    onShow() {
      hideFx();
      wallet.snap();
      cat = null;
      render(null);
      // Focus the worn item of the first tab, else the first card.
      return grid.querySelector<HTMLElement>('.card.s-equipped') ?? grid.querySelector<HTMLElement>('.card') ?? close;
    },
    update(dt) {
      wallet.update(dt);
    },
    tab(dir) {
      if (mode !== 'shop' || cats.length < 2 || !cat) return;
      cat = cats[(cats.indexOf(cat) + dir + cats.length) % cats.length] ?? cat;
      render(null);
      (grid.querySelector<HTMLElement>('.card') ?? close).focus();
      ctx.audio.play('click');
    },
  };
}
