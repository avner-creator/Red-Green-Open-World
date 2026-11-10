/** Mode-aware hint strips: driving and skydive/balloon (the on-foot strip is tutorial.ts). */
import type { GameContext, PlayerMode } from '../types';
import { controlIcon, controlKeys } from './controlGlyphs';
import type { ControlId } from './controlGlyphs';
import { clear, h } from './dom';
import { pictogram } from './wayIcons';

export const MODE_HINT_SECONDS = 6;

/** Which hint strip a player mode gets (null: none; the on-foot tutorial owns walking). */
export function hintKind(mode: PlayerMode): 'driving' | 'skydive' | null {
  if (mode === 'driving') return 'driving';
  if (mode === 'external') return 'skydive';
  return null;
}

const ROWS: Record<'driving' | 'skydive', ControlId[]> = {
  driving: ['steer', 'drive', 'hop', 'slide', 'horn', 'exit'],
  skydive: ['move', 'chute'],
};

export interface ModeHints {
  el: HTMLElement;
  update(dt: number): void;
}

export function createModeHints(ctx: GameContext): ModeHints {
  const el = h('div', 'wf-strip', { 'data-testid': 'mode-strip' });
  let kind: 'driving' | 'skydive' | null = null;
  let t = 0;
  let device = ctx.input.state.device;

  const build = (): void => {
    clear(el);
    if (!kind) return;
    for (const id of ROWS[kind]) {
      el.append(h('div', 'tgroup', {}, controlKeys(id, device, true), pictogram(controlIcon(id))));
    }
  };
  const set = (k: 'driving' | 'skydive' | null): void => {
    kind = k;
    t = 0;
    device = ctx.input.state.device;
    el.dataset.kind = k ?? '';
    // The on-foot tutorial is hidden by CSS in these modes.
    ctx.uiRoot.dataset.mode = k === 'driving' ? 'driving' : k === 'skydive' ? 'external' : 'walk';
    build();
    el.classList.toggle('on', k !== null);
  };

  ctx.events.on('player:mode', (e) => set(hintKind(e.mode)));
  ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'playing') set(null);
  });

  return {
    el,
    update(dt: number): void {
      if (!kind) return;
      if (ctx.session.state.phase !== 'playing') return;
      t += dt;
      if (ctx.input.state.device !== device) {
        device = ctx.input.state.device;
        build();
      }
      if (t > MODE_HINT_SECONDS) el.classList.remove('on');
    },
  };
}
