/**
 * The dressing room: the hero big on a little turning stage in the middle, picture tabs on the
 * left (hats, faces, backs, trails, buggy paint, dances), big item tiles on the right.
 * - Owned item: press = wear / take off (the hero cheers).
 * - Locked item: press = try it on (on the stage only) + a big BUY button with the gem price;
 *   pressing the same tile again (or BUY) buys it: confetti, fanfare, worn at once.
 * Every state differs by shape and brightness, never by hue alone (see the shop card CSS).
 * Opened from the HUD hanger button / I key / D-pad left, the title, the pause and end screens,
 * the hero select and the Gear Shack kiosk.
 */
import { emoteKind } from '../../activities/gear/catalog';
import type { EquipSlot, GameContext, ShopItem } from '../../types';
import { h, retrigger } from '../dom';
import { missingGems } from '../econ';
import { icon } from '../icons';
import { createPictureQueue, itemPicture, picturePending, swapInPicture } from '../itemArt';
import type { Screen } from '../screens';
import { createWalletChip } from '../wallet';
import { TAB_ICON, badgeIds, dressTabs, tabItems, tabOf } from './logic';
import type { DressTab } from './logic';
import type { SeenStore } from './seen';
import { createStage } from './stage';
import type { Stage, StageLook } from './stage';

export interface DressingRoom extends Screen {
  update(dt: number): void;
  /** Gamepad bumpers / Q,E (PageUp/Down): previous or next tab. */
  tab(dir: 1 | -1): void;
  /** Called when hidden (closing drops the try-on). */
  leave(): void;
  readonly stage: Stage;
}

/** Test hook (`window.__rgWardrobe`, `?test=1` only). */
export interface WardrobeTestApi {
  /** Items worn by the stage hero (try-on included). */
  stage(): StageLook;
  stageReady(): boolean;
  trying(): string | null;
  badge(): string[];
}
declare global {
  interface Window {
    __rgWardrobe?: WardrobeTestApi;
  }
}

const CONFETTI = ['#ffd93b', '#ffffff', '#ffb02e', '#7fe3ff', '#ff8fc7', '#c8ff7f'];
const CELEBRATE_MS = 1900;
const WORN: readonly EquipSlot[] = ['head', 'face', 'back'];

type TileState = 'equipped' | 'owned' | 'buy' | 'poor' | 'chest';

export function createDressingRoom(ctx: GameContext, seen: SeenStore, onClose: () => void): DressingRoom {
  const stage = createStage(ctx.testMode);
  const wallet = createWalletChip(ctx, 'drw', 'wardrobe-wallet');
  const close = h('button', 'b d sm close dr-close', { type: 'button', 'aria-label': 'Close', 'data-testid': 'wardrobe-close' }, icon('close'));
  const tabs = h('div', 'dr-tabs', { role: 'tablist' });
  const grid = h('div', 'dr-grid', { 'data-testid': 'wardrobe-grid' });
  const fx = h('div', 'celebrate', { 'data-testid': 'unlock-moment', 'aria-hidden': 'true' });
  const turnL = h('button', 'b d sm dr-turn l', { type: 'button', 'aria-label': 'Turn left', 'data-testid': 'wardrobe-turn-left' }, icon('turnL'));
  const turnR = h('button', 'b d sm dr-turn r', { type: 'button', 'aria-label': 'Turn right', 'data-testid': 'wardrobe-turn-right' }, icon('turnR'));
  turnL.addEventListener('click', () => stage.turn(-1.6));
  turnR.addEventListener('click', () => stage.turn(1.6));
  /** Under the hero: what you are trying on and the BUY button. */
  const tryBar = h('div', 'dr-try', { 'data-testid': 'wardrobe-try' });
  /** Paints/trails can't be worn by the stage hero: their picture floats beside it. */
  const floatPic = h('div', 'dr-float');
  const stageBox = h(
    'div',
    'dr-stage',
    {},
    h('div', 'dr-spot'),
    stage.el,
    floatPic,
    h('div', 'dr-turns', {}, turnL, turnR),
    tryBar,
  );
  const panel = h(
    'div',
    'dr-room',
    { 'data-testid': 'wardrobe' },
    h('div', 'dr-top', {}, h('span', 'dr-head', {}, icon('hanger')), wallet.el, close),
    tabs,
    stageBox,
    grid,
    fx,
  );
  const el = h('div', 'screen dress', { 'data-screen': 'wardrobe' }, h('div', 'dr-bg'), panel);

  let tab: DressTab | null = null;
  let tabList: DressTab[] = [];
  let trying: ShopItem | null = null;
  let celebrating = false;
  let fxTimer = 0;

  const doClose = (): void => {
    pics.clear();
    onClose();
  };
  close.addEventListener('click', doClose);

  const hideFx = (): void => {
    celebrating = false;
    window.clearTimeout(fxTimer);
    fx.classList.remove('on');
    fx.replaceChildren();
  };
  fx.addEventListener('click', hideFx);

  const pics = createPictureQueue(() => el.classList.contains('on'));
  const art = (it: ShopItem, cls: string): HTMLElement => {
    const pic = itemPicture(it, it.icon);
    const isImg = pic.tagName === 'IMG';
    const span = h('span', `${cls} ${isImg ? 'has-pic' : ''}`.trim(), { style: it.swatch && !isImg ? `--sw:${it.swatch}` : '' }, it.swatch && !isImg ? h('span', 'sw') : null, pic);
    if (picturePending(it)) pics.request(it, () => swapInPicture(span, it, it.icon));
    return span;
  };

  const stateOf = (it: ShopItem): TileState => {
    if (ctx.profile.owns(it.id)) return ctx.profile.equipped(it.slot) === it.id ? 'equipped' : 'owned';
    if (it.chestOnly) return 'chest';
    return it.price <= ctx.profile.wallet ? 'buy' : 'poor';
  };

  /** What the stage hero wears: the profile, with the try-on on top. */
  const stageLook = (): StageLook => {
    const look: StageLook = { head: ctx.profile.equipped('head'), face: ctx.profile.equipped('face'), back: ctx.profile.equipped('back') };
    if (trying && (WORN as readonly string[]).includes(trying.slot)) look[trying.slot as keyof StageLook] = trying.id;
    return look;
  };
  const syncStage = (cheer: boolean): void => {
    stage.setHero(trying?.slot === 'character' ? trying.id : ctx.player.characterId);
    stage.setLook(stageLook(), cheer);
    floatPic.replaceChildren();
    floatPic.classList.remove('on');
    if (trying && !(WORN as readonly string[]).includes(trying.slot) && trying.slot !== 'emote' && trying.slot !== 'character') {
      floatPic.append(art(trying, 'fp'));
      floatPic.classList.add('on');
      retrigger(floatPic, 'pop');
    }
  };

  const renderTry = (): void => {
    tryBar.replaceChildren();
    tryBar.classList.toggle('on', !!trying);
    if (!trying) return;
    const it = trying;
    const st = stateOf(it);
    if (st === 'buy') {
      const buy = h(
        'button',
        'b dr-buy',
        { type: 'button', 'aria-label': 'Buy', 'data-testid': 'wardrobe-buy', 'data-item': it.id },
        h('span', 'gemc', {}, icon('gem')),
        h('span', 't', {}, String(it.price)),
        icon('check', 'ok'),
      );
      buy.addEventListener('click', () => purchase(it));
      tryBar.append(buy);
    } else if (st === 'poor') {
      const miss = missingGems(it.price, ctx.profile.wallet);
      tryBar.append(
        h(
          'div',
          'dr-need',
          { 'data-testid': 'wardrobe-need' },
          h('span', 'lk', {}, icon('lock')),
          icon('gem'),
          h('span', 't', {}, String(it.price)),
          h('span', 'bar', {}, h('span', 'fill', { style: `--p:${Math.round((1 - miss / Math.max(1, it.price)) * 100)}%` })),
          h('span', 't m', {}, `+${miss}`),
        ),
      );
    } else if (st === 'chest') tryBar.append(h('div', 'dr-need chest', {}, icon('chest'), icon('key')));
  };

  /** Newly affordable / newly unlocked items (sparkle dot), worked out once per render. */
  let fresh = new Set<string>();
  const tile = (it: ShopItem): HTMLButtonElement => {
    const st = stateOf(it);
    const miss = missingGems(it.price, ctx.profile.wallet);
    let foot: HTMLElement | null = null;
    if (st === 'buy') foot = h('span', 'price', {}, icon('gem'), h('span', '', {}, String(it.price)));
    else if (st === 'poor')
      foot = h(
        'span',
        'price poor',
        {},
        h('span', 'lk', {}, icon('lock')),
        icon('gem'),
        h('span', '', {}, String(it.price)),
        h('span', 'prog', { style: `--p:${Math.round((1 - miss / Math.max(1, it.price)) * 100)}%` }),
      );
    else if (st === 'chest') foot = h('span', 'price chest', {}, icon('chest'));
    const isTry = trying?.id === it.id;
    const b = h(
      'button',
      `b card dr-tile s-${st}${isTry ? ' trying' : ''}${fresh.has(it.id) ? ' fresh' : ''}`,
      {
        type: 'button',
        'aria-label': it.name,
        'data-testid': 'shop-card',
        'data-item': it.id,
        'data-state': st,
        'aria-pressed': String(st === 'equipped'),
      },
      art(it, 'pv'),
      foot,
      st === 'owned' ? h('span', 'own', {}, icon('check')) : null,
      st === 'equipped' ? h('span', 'ribbon', {}, icon('check')) : null,
      isTry ? h('span', 'tryon', {}, icon('eye')) : null,
    );
    b.addEventListener('click', () => pick(it, b));
    return b;
  };

  const celebrate = (it: ShopItem): void => {
    const conf = Array.from({ length: 36 }, (_, n) =>
      h('i', 'cf', { style: `--a:${(n * 137) % 360}deg;--r:${38 + ((n * 53) % 40)}vmin;--c:${CONFETTI[n % CONFETTI.length]};--dl:${(n % 6) * 0.03}s;--s:${0.7 + (n % 3) * 0.3}` }),
    );
    const sparks = Array.from({ length: 10 }, (_, n) => h('i', 'spk', { style: `--a:${n * 36}deg;--dl:${0.1 + (n % 4) * 0.06}s` }, icon('sparkle')));
    fx.replaceChildren(h('span', 'rays'), h('span', 'rays r2'), ...conf, art(it, 'badge'), ...sparks, h('span', 'worn', {}, icon('check')));
    fx.classList.remove('on');
    void fx.offsetWidth;
    fx.classList.add('on');
    celebrating = true;
    window.clearTimeout(fxTimer);
    fxTimer = window.setTimeout(hideFx, CELEBRATE_MS);
    ctx.audio.play('fanfare');
  };

  const purchase = (it: ShopItem): void => {
    const r = ctx.economy.buy(it.id);
    if (r === 'ok') {
      trying = null;
      seen.add([it.id]);
      render(it.id, 'bought');
      syncStage(true);
      celebrate(it);
      return;
    }
    ctx.audio.play('bump');
    wallet.shake();
    const need = tryBar.querySelector<HTMLElement>('.dr-need');
    if (need) retrigger(need, 'shake');
  };

  const pick = (it: ShopItem, b: HTMLElement): void => {
    if (celebrating) {
      hideFx();
      return;
    }
    const st = stateOf(it);
    if (st === 'equipped' || st === 'owned') {
      trying = null;
      const on = st === 'equipped';
      if (on && it.slot === 'character') return; // always wear a hero
      ctx.economy.equip(it.slot, on ? null : it.id);
      ctx.audio.play(on ? 'click' : 'boing', { pitch: 1.3 });
      if (!on && it.slot === 'emote') stage.pose(emoteKind(it.id) ?? 'cheer');
      render(it.id, on ? 'off' : 'wear');
      syncStage(!on);
      return;
    }
    // Locked: first press tries it on; pressing it again while affordable buys it.
    if (trying?.id === it.id && st === 'buy') {
      purchase(it);
      return;
    }
    trying = it;
    ctx.audio.play('squeak');
    if (it.slot === 'emote') stage.pose(emoteKind(it.id) ?? 'cheer');
    render(it.id, 'wear');
    syncStage(true);
    if (st === 'poor') {
      const tag = b.querySelector<HTMLElement>('.price');
      if (tag) retrigger(tag, 'shake');
    }
  };

  const tabBtn = (t: DressTab): HTMLButtonElement => {
    const b = h('button', 'b d sm tab dr-tab', { type: 'button', role: 'tab', 'aria-label': t, 'data-testid': `shop-tab-${t}`, 'data-cat': t }, icon(TAB_ICON[t]));
    b.addEventListener('click', () => {
      if (tab !== t) trying = null;
      tab = t;
      render(null);
      syncStage(false);
      b.focus({ preventScroll: true });
    });
    return b;
  };

  /** Redraw tabs and tiles; keep focus on `focusId`'s tile (or the same index); play `anim` on it. */
  function render(focusId: string | null, anim?: string): void {
    pics.clear();
    const activeIdx = [...grid.querySelectorAll('.card')].indexOf(document.activeElement as Element);
    const catalog = ctx.economy.catalog;
    tabList = dressTabs(catalog);
    fresh = new Set(badgeIds(catalog, (id) => ctx.profile.owns(id), ctx.profile.wallet, seen.ids));
    if (!tab || !tabList.includes(tab)) tab = tabList[0] ?? null;
    tabs.replaceChildren(...tabList.map(tabBtn));
    for (const b of tabs.querySelectorAll<HTMLElement>('.tab')) {
      const sel = b.dataset.cat === tab;
      b.setAttribute('aria-selected', String(sel));
      b.setAttribute('aria-pressed', String(sel));
      const t = b.dataset.cat as DressTab;
      b.classList.toggle('fresh', catalog.some((i) => tabOf(i) === t && fresh.has(i.id)));
    }
    const items = tab ? tabItems(catalog, tab, (id) => ctx.profile.owns(id), (s) => ctx.profile.equipped(s)) : [];
    grid.replaceChildren(...items.map(tile));
    if (!items.length) grid.append(h('div', 'empty', {}, icon('hanger'), icon('clock')));
    renderTry();
    const cards = [...grid.querySelectorAll<HTMLElement>('.card')];
    const target = (focusId ? cards.find((c) => c.dataset.item === focusId) : null) ?? (activeIdx >= 0 ? cards[Math.min(activeIdx, cards.length - 1)] : null);
    if (target && (focusId || activeIdx >= 0)) target.focus({ preventScroll: false });
    if (target && anim) retrigger(target, anim);
  }

  const refresh = (): void => {
    if (el.classList.contains('on') && !celebrating) {
      render(null);
      syncStage(false);
    }
  };
  ctx.events.on('item:equipped', refresh);
  ctx.events.on('profile:reset', refresh);
  ctx.events.on('player:character', refresh);
  window.addEventListener('resize', () => {
    if (el.classList.contains('on')) stage.resize();
  });

  if (ctx.testMode) {
    window.__rgWardrobe = {
      stage: () => stage.worn(),
      stageReady: () => stage.ready,
      trying: () => trying?.id ?? null,
      badge: () => badgeIds(ctx.economy.catalog, (id) => ctx.profile.owns(id), ctx.profile.wallet, seen.ids),
    };
  }

  return {
    el,
    stage,
    onShow() {
      hideFx();
      wallet.snap();
      trying = null;
      tab = null;
      render(null);
      // Mark what is new as seen only after this render (the tiles still sparkle once).
      seen.add(badgeIds(ctx.economy.catalog, (id) => ctx.profile.owns(id), ctx.profile.wallet, seen.ids));
      requestAnimationFrame(() => {
        if (!el.classList.contains('on')) return;
        stage.run(true);
        syncStage(false);
      });
      stage.setHero(ctx.player.characterId);
      stage.setLook(stageLook(), false);
      return grid.querySelector<HTMLElement>('.card.s-equipped') ?? grid.querySelector<HTMLElement>('.card') ?? close;
    },
    leave() {
      trying = null;
      hideFx();
      pics.clear();
      stage.run(false);
    },
    update(dt) {
      wallet.update(dt);
    },
    tab(dir) {
      if (tabList.length < 2 || !tab) return;
      tab = tabList[(tabList.indexOf(tab) + dir + tabList.length) % tabList.length] ?? tab;
      trying = null;
      render(null);
      syncStage(false);
      (grid.querySelector<HTMLElement>('.card') ?? close).focus();
      ctx.audio.play('click');
    },
  };
}
