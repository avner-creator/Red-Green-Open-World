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
import type { Actions, Screen } from './screens';
import { skillPicto } from './skillPicto';
import { createWalletChip } from './wallet';
import type { WalletChip } from './wallet';

export interface TitleScreen extends Screen {
  wallet: WalletChip;
  /** Per frame while shown: hero name and device glyphs. */
  update(dt: number): void;
}

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
  const gear = tile('Gear', 'title-wardrobe', icon('backpack'), icon('hat'));
  gear.addEventListener('click', a.openWardrobe);
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
    h('div', 'tbot', {}, h('div', 'tside l', {}, gear, help), play, h('div', 'tside r', {}, grown)),
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
    },
    onShow: () => {
      wallet.snap();
      refresh();
      return play;
    },
  };
}
