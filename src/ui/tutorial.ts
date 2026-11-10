/** Wordless tutorial strip shown for the first ~6 s of play: animated key caps or gamepad glyphs. */
import type { GameContext } from '../types';
import { clear, h } from './dom';
import { cap, GAMEPAD_GLYPH, padButton } from './glyphs';
import { icon } from './icons';

export const TUTORIAL_SECONDS = 6;

/** Fade out as soon as the player has moved AND (looked around or jumped). */
export function tutorialDone(seen: { moved: boolean; looked: boolean; jumped: boolean }, t: number): boolean {
  return t > TUTORIAL_SECONDS || (seen.moved && (seen.looked || seen.jumped));
}

export interface Tutorial {
  start(): void;
  stop(): void;
  update(dt: number, playing: boolean): void;
}

export function createTutorial(ctx: GameContext): Tutorial {
  const el = h('div', 'tut', { 'data-testid': 'tutorial' });
  ctx.uiRoot.append(el);
  let t = -1;
  let gamepad = false;
  const seen = { moved: false, looked: false, jumped: false };

  const build = (): void => {
    clear(el);
    if (gamepad) {
      el.append(
        h('div', 'tgroup', {}, padButton('L', 'press'), icon('stick')),
        h('div', 'tgroup', {}, padButton('R', 'press d1'), icon('eye')),
        h('div', 'tgroup', {}, padButton(GAMEPAD_GLYPH.jump, 'press d2'), icon('trampoline')),
        h('div', 'tgroup', {}, padButton(GAMEPAD_GLYPH.use, 'press d3'), icon('hand')),
        h('div', 'tgroup', {}, padButton(GAMEPAD_GLYPH.sprint, 'press'), icon('bolt')),
      );
      return;
    }
    const row = (...c: HTMLElement[]): HTMLElement => h('div', 'row', {}, ...c);
    el.append(
      h('div', 'tgroup', {}, h('div', 'tkeys', {}, row(cap('W', 'press')), row(cap('A', 'press d1'), cap('S', 'press d2'), cap('D', 'press d3'))), icon('flop')),
      h('div', 'tgroup', {}, icon('mouse', 'mouse'), icon('eye')),
      h('div', 'tgroup', {}, cap('␣', 'wide press'), icon('trampoline')),
      h('div', 'tgroup', {}, cap('E', 'press'), icon('hand')),
      h('div', 'tgroup', {}, cap('⇧', 'wide press d1'), icon('bolt')),
    );
  };

  return {
    start() {
      t = 0;
      seen.moved = seen.looked = seen.jumped = false;
      gamepad = ctx.input.state.device === 'gamepad';
      build();
      el.classList.add('on');
    },
    stop() {
      t = -1;
      el.classList.remove('on');
    },
    update(dt, playing) {
      if (t < 0 || !playing) return;
      t += dt;
      const st = ctx.input.state;
      if (Math.abs(st.moveX) + Math.abs(st.moveY) > 0.2) seen.moved = true;
      if (Math.abs(st.lookX) + Math.abs(st.lookY) > 0.002) seen.looked = true;
      if (st.jumpPressed || st.jump) seen.jumped = true;
      const pad = ctx.input.state.device === 'gamepad';
      if (pad !== gamepad) {
        gamepad = pad;
        build();
      }
      if (tutorialDone(seen, t)) {
        el.classList.remove('on');
        t = -1;
      }
    },
  };
}
