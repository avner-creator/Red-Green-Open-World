/** Wordless tutorial shown for the first ~10 s of play: animated key caps or gamepad glyphs. */
import type { GameContext } from '../types';
import { clear, h } from './dom';
import { cap, GAMEPAD_GLYPH, padButton } from './glyphs';
import { icon } from './icons';

export const TUTORIAL_SECONDS = 10;

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
      const pad = ctx.input.state.device === 'gamepad';
      if (pad !== gamepad) {
        gamepad = pad;
        build();
      }
      if (t > TUTORIAL_SECONDS - 0.8) el.classList.remove('on');
      if (t > TUTORIAL_SECONDS) t = -1;
    },
  };
}
