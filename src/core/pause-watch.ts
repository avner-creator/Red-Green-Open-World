/**
 * Pause diagnostics + the "click to look" hint.
 *
 * - Every switch to the paused phase is logged with its cause (key / pad / touch / Esc that broke
 *   pointer lock / hidden tab / shop / other). In test mode the log is `window.__rg.pauseLog`
 *   (also `window.__rgPauseLog`), so e2e can assert that only explicit pauses happen.
 * - When the pointer lock is gone without an Esc (window lost focus, the browser refused a re-lock)
 *   the game keeps playing and a small wordless pill (mouse + click ring) asks for a click on the
 *   world. Drawn in white on dark, so it reads in the R and G channels alike.
 */
import type { GameContext } from '../types';
import { lookHintWanted, pauseSource } from './input';

export interface PauseLogEntry {
  /** performance.now() in ms. */
  t: number;
  reason: 'key' | 'pad' | 'touch' | 'lock-esc' | 'hidden' | 'shop' | 'other';
  detail: string;
}

/** Seconds the hint condition must hold before the pill shows (no flash during a resume re-lock). */
const HINT_DELAY = 0.6;

const MOUSE_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6" fill="none" stroke="#fff" stroke-width="2"/><path d="M12 3v7M6 10h12" stroke="#fff" stroke-width="2"/><path d="M6.6 9.6V9a5.4 5.4 0 0 1 5.4-5.4V9.6z" fill="#fff"/></svg>';

export function createPauseWatch(ctx: GameContext): { update(dt: number): void } {
  const log: PauseLogEntry[] = [];
  let shopAt = -Infinity;
  ctx.events.on('shop:open', () => (shopAt = performance.now()));
  let held = 0;
  let on = false;
  const setOn = (v: boolean): void => {
    if (v === on) return;
    on = v;
    pill.style.opacity = on ? '1' : '0';
    pill.dataset.on = on ? '1' : '0';
    if (ctx.testMode) (window as unknown as { __rgLookHint?: boolean }).__rgLookHint = on;
  };
  ctx.events.on('session:phase', (e) => {
    if (e.phase !== 'playing') {
      held = 0;
      setOn(false);
    }
    if (e.phase !== 'paused' || e.previous !== 'playing') return;
    const src = pauseSource(ctx.input);
    const now = performance.now();
    let reason: PauseLogEntry['reason'] = 'other';
    if (src.source) reason = src.source;
    else if (now - shopAt < 500) reason = 'shop';
    else if (document.hidden) reason = 'hidden';
    log.push({ t: Math.round(now), reason, detail: src.detail });
    if (log.length > 50) log.shift();
  });
  if (ctx.testMode) {
    const w = window as unknown as { __rgPauseLog?: PauseLogEntry[]; __rg?: Record<string, unknown> };
    w.__rgPauseLog = log;
  }

  // The pill: a hand-styled element (core owns the cause; the UI folder is someone else's).
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const showPill = !ctx.testMode || params.get('lookhint') === '1';
  const pill = document.createElement('div');
  pill.dataset.testid = 'look-hint';
  pill.setAttribute('aria-hidden', 'true');
  pill.innerHTML = `${MOUSE_SVG}<span style="font:600 15px/1 system-ui,sans-serif;color:#fff;letter-spacing:.02em">Click</span>`;
  Object.assign(pill.style, {
    position: 'absolute', left: '50%', bottom: '18%', transform: 'translateX(-50%)', display: 'flex',
    alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '999px', background: 'rgba(10,12,20,.62)',
    border: '2px solid rgba(255,255,255,.85)', pointerEvents: 'none', opacity: '0', transition: 'opacity .25s',
    zIndex: '5',
  } satisfies Partial<CSSStyleDeclaration>);
  if (showPill) ctx.uiRoot.append(pill);

  return {
    update(dt) {
      if (ctx.testMode) {
        const rg = (window as unknown as { __rg?: Record<string, unknown> }).__rg;
        if (rg && rg.pauseLog !== log) rg.pauseLog = log;
      }
      const want = ctx.session.state.phase === 'playing' && lookHintWanted(ctx.input);
      held = want ? held + dt : 0;
      setOn(held >= HINT_DELAY);
    },
  };
}
