/** Title, pause, end and credits screens. */
import type { GameContext, StuntKind } from '../types';
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
}

function btn(cls: string, label: string, testid: string, ...kids: (HTMLElement | string | null)[]): HTMLButtonElement {
  return h('button', cls, { type: 'button', 'aria-label': label, 'data-testid': testid }, ...kids);
}

export function createTitle(a: Actions): Screen {
  const logo = h(
    'div',
    'logo',
    {},
    h('span', 'l1', {}, 'RED-GREEN'),
    h('span', 'l2', {}, icon('gem', 'y'), 'OPEN WORLD', icon('gem', 'y')),
  );
  const play = btn('b play', 'Play', 'play', icon('play'), 'PLAY');
  play.addEventListener('click', a.play);
  const grown = btn('b d corner l', 'Grown-ups', 'grownups', icon('gear'), icon('grownup'));
  grown.addEventListener('click', a.openGate);
  const cred = btn('b d corner r', 'Credits', 'credits', icon('credits'));
  cred.addEventListener('click', a.openCredits);
  const el = h('div', 'screen title shade', { 'data-screen': 'title' }, logo, h('div', 'center', {}, play), h('div'), grown, cred);
  return { el, onShow: () => play };
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
  const panel = h(
    'div',
    'panel pausep',
    {},
    h('div', 'head t', {}, icon('pause'), 'PAUSED'),
    h('div', 'grid2', {}, resume, restart, quit, grown),
  );
  return { el: h('div', 'screen dim', { 'data-screen': 'pause' }, panel), onShow: () => resume };
}

const STUNT_ORDER: StuntKind[] = ['bigBounce', 'longGlide', 'bullseye', 'bigAir', 'bungee', 'launch'];
const CONFETTI = ['#ffd93b', '#ffffff', '#ffb02e', '#7fe3ff', '#ff8fc7', '#c8ff7f'];

export interface EndScreen extends Screen {
  fill(): void;
}

export function createEnd(ctx: GameContext, a: Actions): EndScreen {
  const stickers = h('div', 'stickers', { 'data-testid': 'stickers' });
  const confetti = h('div', 'confetti');
  const again = btn('b play', 'Play again', 'play-again', icon('restart'), 'PLAY');
  again.addEventListener('click', a.play);
  const home = btn('b d', 'Home', 'home', icon('home'));
  home.addEventListener('click', a.toTitle);
  const panel = h(
    'div',
    'panel endp',
    {},
    h('div', 'burst t', {}, icon('sparkle'), icon('star'), icon('sparkle')),
    stickers,
    h('div', 'btnrow', {}, again, home),
  );
  const el = h('div', 'screen dim', { 'data-screen': 'end' }, confetti, panel);

  const sticker = (ic: UiIconName, text: string, i: number, cls = ''): HTMLElement =>
    h('div', `stk ${cls}`, { style: `--r:${(i % 2 ? 1 : -1) * (1 + (i % 3))}deg;--d:${i * 0.07}s` }, icon(ic), h('span', '', {}, text));

  return {
    el,
    onShow: () => again,
    fill() {
      const s = ctx.session.state;
      stickers.replaceChildren();
      let i = 0;
      stickers.append(
        sticker('gem', counterText(s.gems, s.gemsTotal), i++, 'big'),
        sticker('chest', counterText(s.chests, s.chestsTotal), i++, 'big'),
        sticker('star', String(s.stars), i++, 'big'),
      );
      for (const k of STUNT_ORDER) {
        const v = s.bestStunts[k];
        if (v && v > 0) stickers.append(sticker(STUNT_ICON[k], String(Math.round(v)), i++));
        else stickers.append(sticker(STUNT_ICON[k], '·', i++, 'empty'));
      }
      for (const id of s.outfits) stickers.append(sticker(outfitIcon(id), '', i++));
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
