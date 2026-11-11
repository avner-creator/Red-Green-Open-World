/**
 * Title screen: your hero big in the middle of the live world (close camera, tap = emote), a
 * "change hero" arrows button with the hero's name and trick, Pip waving, one giant PLAY, and
 * three labelled picture tiles: Gear, Help (controls for the current device), Grown-ups.
 * Wallet top-left. Light-on-dark with black outlines: every cue reads by brightness.
 */
import { CHARACTERS } from '../core/characters/catalog';
import type { GameContext } from '../types';
import { buddyPicto } from './buddy/picto';
import { clear, h } from './dom';
import { cap, padButton } from './glyphs';
import { icon } from './icons';
import { createPictureQueue, itemPicture, picturePending, swapInPicture } from './itemArt';
import type { Actions, Screen } from './screens';
import { skillPicto } from './skillPicto';
import { createWalletChip } from './wallet';
import type { WalletChip } from './wallet';

export interface TitleScreen extends Screen {
  wallet: WalletChip;
  /** Per frame while shown: hero name and device glyphs. */
  update(dt: number): void;
}

/** Goofy items the title's dress-up button shows in turn. */
const TEASERS = ['hat-duck', 'hat-viking', 'face-googly', 'back-dragon', 'hat-octopus', 'hat-sombrero', 'face-bigglasses', 'back-balloons'];

const SWAP_L = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 3L6 12l9.5 9z"/></svg>';
const SWAP_R = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 3L18 12l-9.5 9z"/></svg>';

function svgIcon(svg: string, cls = ''): HTMLElement {
  const el = h('span', `ic ${cls}`.trim());
  el.innerHTML = svg;
  return el;
}

function btn(cls: string, label: string, testid: string, ...kids: (HTMLElement | string | null)[]): HTMLButtonElement {
  return h('button', cls, { type: 'button', 'aria-label': label, 'data-testid': testid }, ...kids);
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

  // Change hero: arrows either side of the hero's name and trick (opens the hero select).
  const heroName = h('span', 't hn', { 'data-testid': 'title-hero-name' }, '');
  const heroSkill = h('span', 'hs');
  const hero = btn(
    'b d herobtn',
    'Change hero',
    'title-hero',
    svgIcon(SWAP_L, 'ar'),
    h('span', 'hmid', {}, heroSkill, heroName),
    svgIcon(SWAP_R, 'ar'),
  );
  hero.addEventListener('click', () => (a.choose ?? a.play)());
  // Tap the hero (the empty middle of the screen) for a happy emote.
  const stage = h('div', 'tstage', { 'data-testid': 'title-stage', 'aria-hidden': 'true' });
  stage.addEventListener('click', () => ctx.player.emote());

  // Pip waves from the left, with a "let's go" bubble pointing at PLAY.
  const pip = h(
    'div',
    'tpip',
    { 'data-testid': 'title-pip', 'aria-hidden': 'true' },
    h('span', 'pface', {}, buddyPicto('pip')),
    h('span', 'ppaw', {}, buddyPicto('paw')),
    h('span', 'pbub', {}, icon('gem', 'y'), icon('play')),
  );

  const tile = (label: string, testid: string, ...pics: HTMLElement[]): HTMLButtonElement =>
    btn('b d ttile', label, testid, h('span', 'pics', {}, ...pics), h('span', 'lbl', {}, label.toUpperCase()));
  // Dress up: a big button with a hanger and a goofy item that changes every 1.5 s (a teaser:
  // crazy hats exist, and several are free right away).
  const tease = h('span', 'tease');
  const dress = btn(
    'b dressbtn',
    'Dress up',
    'title-wardrobe',
    h('span', 'drow', {}, icon('hanger'), tease),
    h('span', 'lbl', {}, 'DRESS UP'),
  );
  dress.addEventListener('click', a.openWardrobe);
  const pics = createPictureQueue(() => el.classList.contains('on'));
  let teaseIdx = -1;
  let teaseT = 0;
  const nextTease = (): void => {
    const pool = TEASERS.map((id) => ctx.economy.item(id)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!pool.length) return;
    teaseIdx = (teaseIdx + 1) % pool.length;
    const it = pool[teaseIdx]!;
    tease.replaceChildren(itemPicture(it, it.icon));
    tease.dataset.item = it.id;
    tease.classList.remove('in');
    void tease.offsetWidth;
    tease.classList.add('in');
    if (picturePending(it)) pics.request(it, () => swapInPicture(tease, it, it.icon));
    // Warm the next picture so it is ready when its turn comes.
    const nx = pool[(teaseIdx + 1) % pool.length];
    if (nx && picturePending(nx)) pics.request(nx, () => {});
  };
  const helpKey = h('span', 'hk');
  const help = tile('Help', 'title-help', buddyPicto('question'), helpKey);
  help.addEventListener('click', () => a.openHelp?.());
  const grown = tile('Grown-ups', 'grownups', icon('gear'), icon('grownup'));
  grown.addEventListener('click', a.openGate);

  const wallet = createWalletChip(ctx, 'titlew', 'title-wallet');
  const el = h(
    'div',
    'screen title tscreen shade',
    { 'data-screen': 'title' },
    h('div', 'ttop', {}, logo),
    stage,
    h('div', 'tmid', {}, pip, h('div', 'tgap'), hero),
    h('div', 'tbot', {}, h('div', 'tside l', {}, dress, help), play, h('div', 'tside r', {}, grown)),
    wallet.el,
  );

  let shownId = '';
  let device = '';
  const refresh = (): void => {
    const id = ctx.player.characterId;
    if (id !== shownId) {
      shownId = id;
      const c = CHARACTERS.find((x) => x.id === id);
      heroName.textContent = (c?.name ?? '').toUpperCase();
      clear(heroSkill);
      if (c) heroSkill.append(skillPicto(c.skill));
    }
    const d = ctx.input.state.device;
    if (d !== device) {
      device = d;
      clear(helpKey);
      if (d === 'keyboard') helpKey.append(cap('H'));
      else if (d === 'gamepad') helpKey.append(padButton('BACK'));
    }
  };

  return {
    el,
    wallet,
    update(dt) {
      wallet.update(dt);
      refresh();
      teaseT -= dt;
      if (teaseT <= 0) {
        teaseT = 1.5;
        nextTease();
      }
    },
    onShow: () => {
      wallet.snap();
      refresh();
      return play;
    },
  };
}
