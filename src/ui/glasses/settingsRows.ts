/** The "Auto challenge" toggle and "Session summary" button for the grown-up settings (Glasses tab). */
import type { GameContext } from '../../types';
import { h } from '../dom';
import { icon } from '../icons';
import type { UiIconName } from '../icons';
import { injectGlassesCss } from './glassesCss';

const row = (ic: UiIconName, label: string, sub: string | null, control: HTMLElement): HTMLElement =>
  h('div', 'srow', {}, h('div', 'lab', {}, icon(ic), h('div', '', {}, label, sub ? h('div', 'sub', {}, sub) : null)), control);

export function createGlassesSettingsRows(ctx: GameContext, o: { openSummary?(): void }): { rows: HTMLElement[]; refresh(): void } {
  injectGlassesCss();
  const isOn = (): boolean => ctx.settings.get().autoChallenge === true;

  const state = h('span', 'onoff', {}, 'Off');
  const toggle = h('button', 'b d sm', { type: 'button', 'aria-label': 'Auto challenge', 'aria-pressed': 'false', 'data-testid': 'auto-challenge' }, state, h('span', 'chk', {}, icon('check')));
  toggle.addEventListener('click', () => ctx.settings.set({ autoChallenge: !isOn() }));

  const open = h('button', 'b d sm', { type: 'button', 'aria-label': 'Session summary', 'data-testid': 'open-summary' }, icon('clock'), 'Open');
  open.addEventListener('click', () => o.openSummary?.());

  return {
    rows: [
      row('bolt', 'Auto challenge', 'Trickier after wins, easier after misses.', h('div', 'choices', {}, toggle)),
      row('clock', 'Session summary', null, h('div', 'choices', {}, open)),
    ],
    refresh() {
      toggle.setAttribute('aria-pressed', String(isOn()));
      state.textContent = isOn() ? 'On' : 'Off';
    },
  };
}
