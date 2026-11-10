/** Wordless tutorial strip shown for the first ~6 s of play: animated key caps or gamepad glyphs. */
import type { GameContext } from '../types';
import { clear, h } from './dom';
import { controlIcon, controlKeys } from './controlGlyphs';
import type { ControlId } from './controlGlyphs';
import { cap } from './glyphs';
import { icon } from './icons';
import { pictogram } from './wayIcons';
import { skillPicto } from './skillPicto';

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
    // The skill shows the hero's own skill pictogram (sprint already has the lightning bolt).
    const group = (id: ControlId, device: 'keyboard' | 'gamepad'): HTMLElement =>
      h('div', 'tgroup', {}, controlKeys(id, device, true), id === 'skill' ? skillPicto(ctx.player.skill.id, true) : pictogram(controlIcon(id)));
    if (gamepad) {
      el.append(...(['move', 'look', 'jump', 'use', 'sprint', 'skill', 'emote'] as const).map((id) => group(id, 'gamepad')));
      return;
    }
    const row = (...c: HTMLElement[]): HTMLElement => h('div', 'row', {}, ...c);
    el.append(
      h('div', 'tgroup', {}, h('div', 'tkeys', {}, row(cap('W', 'press')), row(cap('A', 'press d1'), cap('S', 'press d2'), cap('D', 'press d3'))), icon('stick')),
      h('div', 'tgroup', {}, icon('mouse', 'mouse'), icon('eye')),
      group('jump', 'keyboard'),
      group('use', 'keyboard'),
      group('sprint', 'keyboard'),
      group('skill', 'keyboard'),
      group('emote', 'keyboard'),
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
