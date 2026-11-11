/** Grown-up-only "Session summary" screen, opened from the gated settings (Glasses tab). */
import type { GameContext } from '../../types';
import { h } from '../dom';
import { icon } from '../icons';
import type { Screen } from '../screens';
import { injectGlassesCss } from './glassesCss';
import { EMPTY_TEXT, TIER_LABEL, buildSummary } from './summaryModel';
import type { Cell, SummaryModel } from './summaryModel';

export interface GlassesSummaryScreen extends Screen {
  /** Rebuild from the vision system's current tally. */
  fill(): void;
  /** Gamepad stick / d-pad scrolling while shown. */
  update(dt: number): void;
}

const cellEl = (tag: 'td' | 'th', c: Cell, cls = ''): HTMLElement =>
  h(tag, cls, {}, c.counts, h('span', 'pc', {}, c.rateText));

function renderTable(m: SummaryModel): HTMLElement {
  const head = h(
    'tr',
    '',
    {},
    h('th', 'n', {}, ''),
    ...TIER_LABEL.map((t, i) => h('th', '', { 'data-tier': String(i + 1) }, t, h('span', 'dots', {}, '●'.repeat(i + 1)))),
    h('th', '', {}, 'All'),
  );
  const body: HTMLElement[] = [];
  for (const g of m.groups) {
    body.push(h('tr', 'kind', { 'data-kind': g.kind }, h('td', '', { colspan: '5' }, g.label)));
    for (const r of g.rows) {
      body.push(h('tr', 'mech', { 'data-mechanic': r.mechanic }, h('td', 'n', {}, r.name), ...r.tiers.map((c) => cellEl('td', c)), cellEl('td', r.total)));
    }
  }
  body.push(h('tr', 'tot', { 'data-testid': 'summary-total' }, h('td', 'n', {}, 'Total'), ...m.tiers.map((c) => cellEl('td', c)), cellEl('td', m.total)));
  return h('table', '', { 'data-testid': 'summary-table' }, h('thead', '', {}, head), h('tbody', '', {}, ...body));
}

export function createGlassesSummary(ctx: GameContext, o: { back(): void }): GlassesSummaryScreen {
  injectGlassesCss();
  const back = h('button', 'b', { type: 'button', 'aria-label': 'Back', 'data-testid': 'summary-back' }, icon('back'), 'Back');
  back.addEventListener('click', o.back);
  const info = h('div', 'info');
  const scroll = h('div', 'gscroll', { 'data-testid': 'summary-scroll' });
  const panel = h(
    'div',
    'panel glsum',
    { 'data-testid': 'glasses-summary' },
    h('div', 'bar', {}, h('div', 'head t', {}, icon('clock'), 'Session summary'), back),
    info,
    scroll,
  );
  const el = h('div', 'screen dim', { 'data-screen': 'glasses-summary' }, panel);

  const fill = (): void => {
    let m: SummaryModel;
    try {
      m = buildSummary(ctx.vision.sessionSummary?.());
    } catch {
      m = buildSummary(null);
    }
    info.replaceChildren(
      h('div', 'chip', { 'data-testid': 'summary-time' }, icon('clock'), 'Time played ', h('b', '', {}, m.time)),
      h('div', 'chip', { 'data-testid': 'summary-challenge' }, icon('bolt'), 'Auto challenge ', h('b', '', {}, m.challenge)),
    );
    scroll.replaceChildren(m.empty ? h('div', 'empty', { 'data-testid': 'summary-empty' }, icon('glasses'), EMPTY_TEXT) : renderTable(m));
    scroll.scrollTop = 0;
  };
  // Keyboard scrolling when only the Back button is focusable (arrows are not used for focus here).
  el.addEventListener('keydown', (e) => {
    const step = e.code === 'ArrowDown' || e.code === 'PageDown' ? 1 : e.code === 'ArrowUp' || e.code === 'PageUp' ? -1 : 0;
    if (step) scroll.scrollBy({ top: step * scroll.clientHeight * 0.5 });
  });
  fill();
  return {
    el,
    fill,
    update(dt) {
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const pad = [...pads].find((p) => p && p.connected);
      if (!pad) return;
      const dpad = (pad.buttons[13]?.pressed ? 1 : 0) - (pad.buttons[12]?.pressed ? 1 : 0);
      const ay = pad.axes[1] ?? 0;
      const v = dpad || (Math.abs(ay) > 0.3 ? ay : 0);
      if (v) scroll.scrollTop += v * dt * 600;
    },
    onShow() {
      fill();
      return back;
    },
  };
}
