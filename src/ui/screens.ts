/** Title, pause, end and credits screens. */
import type { GameContext, StuntKind } from '../types';
import type { EconTracker } from './econState';
import { itemIcon } from './hudEcon';
import { itemPicture } from './itemArt';
import { createWalletChip } from './wallet';
import type { WalletChip } from './wallet';
import { CREDITS } from './credits';
import { h } from './dom';
import { counterText } from './format';
import { outfitIcon, STUNT_ICON } from './glyphs';
import { icon } from './icons';
import type { UiIconName } from './icons';

export interface Screen {
  el: HTMLElement;
  /** Called when shown; return the element to focus first. */
  onShow(): HTMLElement | null;
}

export interface Actions {
  play(): void;
  resume(): void;
  restart(): void;
  toTitle(): void;
  openGate(): void;
  openCredits(): void;
  openWardrobe(): void;
}

function btn(cls: string, label: string, testid: string, ...kids: (HTMLElement | string | null)[]): HTMLButtonElement {
  return h('button', cls, { type: 'button', 'aria-label': label, 'data-testid': testid }, ...kids);
}

export interface TitleScreen extends Screen {
  wallet: WalletChip;
}

export function createTitle(ctx: GameContext, a: Actions): TitleScreen {
  const logo = h(
    'div',
    'logo',
    {},
    h('span', 'l1', {}, 'RED-GREEN'),
    h('span', 'l2', {}, icon('gem', 'y'), 'OPEN WORLD', icon('gem', 'y')),
  );
  const play = btn('b play', 'Play', 'play', h('span', 'glow'), icon('play'), 'PLAY');
  play.addEventListener('click', a.play);
  const grown = btn('b d corner l', 'Grown-ups', 'grownups', icon('gear'), icon('grownup'));
  grown.addEventListener('click', a.openGate);
  const cred = btn('b d corner r', 'Credits', 'credits', icon('credits'));
  cred.addEventListener('click', a.openCredits);
  // A returning child sees their gems right away.
  const wallet = createWalletChip(ctx, 'titlew', 'title-wallet');
  const el = h('div', 'screen title shade', { 'data-screen': 'title' }, logo, h('div', 'center', {}, play), h('div'), grown, cred, wallet.el);
  return {
    el,
    wallet,
    onShow: () => {
      wallet.snap();
      return play;
    },
  };
}

function tile(cls: string, label: string, testid: string, ic: UiIconName, ic2?: UiIconName): HTMLButtonElement {
  return btn(
    `b tile ${cls}`,
    label,
    testid,
    h('span', 'pair', {}, icon(ic), ic2 ? icon(ic2) : null),
    label,
  );
}

export function createPause(a: Actions): Screen {
  const resume = tile('main', 'Resume', 'resume', 'play');
  resume.addEventListener('click', a.resume);
  const restart = tile('d', 'Restart', 'restart', 'restart');
  restart.addEventListener('click', a.restart);
  const grown = tile('d', 'Grown-ups', 'pause-grownups', 'gear', 'grownup');
  grown.addEventListener('click', a.openGate);
  const quit = tile('d', 'Home', 'quit', 'home');
  quit.addEventListener('click', a.toTitle);
  const wardrobe = tile('d wardrobe', 'Wardrobe', 'pause-wardrobe', 'backpack', 'hat');
  wardrobe.addEventListener('click', a.openWardrobe);
  const panel = h(
    'div',
    'panel pausep',
    {},
    h('div', 'head t', {}, icon('pause'), 'PAUSED'),
    h('div', 'grid3', {}, resume, wardrobe, restart, quit, grown),
  );
  return { el: h('div', 'screen dim', { 'data-screen': 'pause' }, panel), onShow: () => resume };
}

const STUNT_ORDER: StuntKind[] = ['bigBounce', 'longGlide', 'bullseye', 'bigAir', 'bungee', 'launch'];
const CONFETTI = ['#ffd93b', '#ffffff', '#ffb02e', '#7fe3ff', '#ff8fc7', '#c8ff7f'];
/** Outfit slots shown on the end screen (an outfit id maps to a slot by hat/cape/glass/paint). */
const OUTFIT_SLOTS: UiIconName[] = ['hat', 'cape', 'glasses', 'paint'];
const OUTFIT_ID = /hat|cape|glass|paint/i;

/** How many of the three header stars are earned for a star total (0 earns none). */
export function starSlots(stars: number): number {
  if (stars <= 0) return 0;
  if (stars < 3) return 1;
  if (stars < 6) return 2;
  return 3;
}

/** Which outfit slots (hat, cape, glasses, paint) a list of outfit ids fills; other ids are ignored. */
export function outfitSlotsFilled(ids: Iterable<string>): Set<UiIconName> {
  const out = new Set<UiIconName>();
  for (const id of ids) if (OUTFIT_ID.test(id)) out.add(outfitIcon(id) as UiIconName);
  return out;
}

export interface EndScreen extends Screen {
  fill(): void;
}

export function createEnd(ctx: GameContext, a: Actions, tracker: EconTracker): EndScreen {
  const header = h('div', 'burst t', { 'data-testid': 'end-stars' });
  const stickers = h('div', 'stickers', { 'data-testid': 'stickers' });
  const econRow = h('div', 'stickers econ', { 'data-testid': 'end-econ' });
  const smalls = h('div', 'stickers small', { 'data-testid': 'stickers-extra' });
  const confetti = h('div', 'confetti');
  const again = btn('b play', 'Play again', 'play-again', h('span', 'glow'), icon('restart'), 'PLAY');
  again.addEventListener('click', a.play);
  const home = btn('b d', 'Home', 'home', icon('home'));
  home.addEventListener('click', a.toTitle);
  const panel = h('div', 'panel endp', {}, header, stickers, econRow, smalls, h('div', 'btnrow', {}, again, home));
  const el = h('div', 'screen dim', { 'data-screen': 'end' }, confetti, panel);

  // Chests opened and outfits unlocked this run, from events (the session state may lag behind).
  const chestsOpened = new Set<string>();
  const outfitIds = new Set<string>();
  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous !== 'paused') {
      chestsOpened.clear();
      outfitIds.clear();
    }
  });
  ctx.events.on('chest:opened', (e) => {
    chestsOpened.add(e.chestId);
    outfitIds.add(e.outfitId);
  });
  ctx.events.on('outfit:unlocked', (e) => outfitIds.add(e.outfitId));

  const sticker = (ic: UiIconName | HTMLElement, text: string, i: number, earned: boolean, cls = ''): HTMLElement =>
    h(
      'div',
      `stk ${earned ? 'earned' : 'empty'} ${cls}`.trim(),
      { 'data-earned': String(earned), style: `--r:${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg;--d:${Math.min(i, 7) * 0.05}s` },
      typeof ic === 'string' ? icon(ic) : ic,
      text ? h('span', '', {}, text) : null,
    );

  return {
    el,
    onShow: () => again,
    fill() {
      const s = ctx.session.state;
      stickers.replaceChildren();
      smalls.replaceChildren();
      econRow.replaceChildren();
      header.replaceChildren();
      const filled = starSlots(s.stars);
      header.append(icon('sparkle'));
      for (let n = 0; n < 3; n++) {
        header.append(h('span', `hstar ${n < filled ? 'earned' : 'empty'}`, { style: `--d:${0.15 + n * 0.18}s` }, icon('star')));
      }
      header.append(icon('sparkle'));

      const chests = Math.max(s.chests, chestsOpened.size);
      let i = 0;
      // Gems put in the wallet this run (bonuses included), with the wallet total under it.
      const earned = s.earned ?? 0;
      const gemSt = sticker('gem', `+${earned}`, i++, earned > 0, 'big');
      gemSt.dataset.testid = 'end-earned';
      gemSt.append(h('span', 'sm wal', { 'data-testid': 'end-wallet' }, icon('wallet'), String(ctx.profile.wallet)));
      const best = tracker.bestCombo();
      const comboSt = sticker('combo', `\u00d7${best}`, i++, best > 1, 'big');
      comboSt.dataset.testid = 'end-combo';
      stickers.append(
        gemSt,
        sticker('chest', counterText(chests, Math.max(s.chestsTotal, chests)), i++, chests > 0, 'big'),
        sticker('star', String(s.stars), i++, s.stars > 0, 'big'),
        comboSt,
      );
      // Missions (done = solid sticker with a check; not yet = dotted outline) and the jackpot.
      const ms = tracker.missions;
      if (ms.length) {
        const group = h('div', 'grp', { 'data-testid': 'end-missions' });
        ms.forEach((m) => {
          const st = sticker(m.icon, String(m.target), i++, m.done, 'mis');
          st.dataset.testid = 'end-mission';
          if (m.done) st.append(h('span', 'tick', {}, icon('check')));
          group.append(st);
        });
        const jp = tracker.jackpot > 0;
        const jst = sticker('jackpot', jp ? `+${tracker.jackpot}` : '', i++, jp, 'mis jp');
        jst.dataset.testid = 'end-jackpot';
        group.append(jst);
        econRow.append(group);
      }
      // What was unlocked this run (shop and chests).
      const un = tracker.unlocked;
      if (un.length) {
        const group = h('div', 'grp new', { 'data-testid': 'end-unlocked' }, h('span', 'lbl', {}, icon('sparkle')));
        for (const id of un.slice(0, 5)) group.append(sticker(itemPicture(ctx.economy.item(id), itemIcon(ctx, id)), '', i++, true, 'item'));
        if (un.length > 5) group.append(h('span', 'more t', {}, `+${un.length - 5}`));
        econRow.append(group);
      }
      econRow.classList.toggle('on', econRow.childElementCount > 0);
      for (const k of STUNT_ORDER) {
        const v = s.bestStunts[k];
        smalls.append(sticker(STUNT_ICON[k], v && v > 0 ? String(Math.round(v)) : '', i++, !!v && v > 0));
      }
      const have = outfitSlotsFilled([...s.outfits, ...outfitIds]);
      for (const slot of OUTFIT_SLOTS) smalls.append(sticker(slot, '', i++, have.has(slot), 'outfit'));
      confetti.replaceChildren();
      for (let n = 0; n < 46; n++) {
        const c = h('i', '', { style: `--x:${(n * 37) % 100}%;--c:${CONFETTI[n % CONFETTI.length]};--t:${3.2 + (n % 5) * 0.5}s;--dl:${-((n * 0.37) % 4)}s` });
        confetti.append(c);
      }
    },
  };
}

export function createCredits(a: { back(): void }): Screen {
  const back = btn('b d', 'Back', 'credits-back', icon('back'));
  back.addEventListener('click', a.back);
  const rows = CREDITS.map((c) =>
    h('div', 'crow', {}, h('span', '', {}, c.item), h('span', 'by', {}, c.by), h('span', 'lic', {}, c.license)),
  );
  const panel = h(
    'div',
    'panel credp',
    {},
    h('div', 'head t', {}, icon('credits'), 'CREDITS'),
    h('div', 'scroll', {}, ...rows),
    h('div', '', { style: 'display:flex;justify-content:center' }, back),
  );
  return { el: h('div', 'screen dim', { 'data-screen': 'credits' }, panel), onShow: () => back };
}
