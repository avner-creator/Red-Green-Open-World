/**
 * The "practice" pictogram: a gem with a fat line through it (this round / launch pays no gems,
 * the wallet could not pay). Shared by the carnival HUD, the rocket pads, the race and the Silly
 * Zone. Both-eye UI: white outline and black bar read in R-only and G-only.
 */
import type { GameContext } from '../types';

export const NO_GEM_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12l4 5-10 12L2 9z" fill="#2a3060" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M2 9h20M9 4l3 17 3-17" fill="none" stroke="#fff" stroke-width="1.1"/><path d="M3 21L21 3" stroke="#000" stroke-width="4.4" stroke-linecap="round"/>' +
  '<path d="M3 21L21 3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';

const CSS = `
.rg-practice-flash{position:absolute;left:50%;top:calc(var(--u,8px)*22);transform:translateX(-50%) scale(.6);opacity:0;pointer-events:none;z-index:7;
  width:calc(var(--u,8px)*11);height:calc(var(--u,8px)*11);padding:calc(var(--u,8px)*1.4);box-sizing:border-box;border-radius:50%;
  background:radial-gradient(circle,#1d2346 60%,#0b0f22);border:calc(var(--u,8px)*.6) solid #fff;box-shadow:0 0 0 calc(var(--u,8px)*.45) #000;
  transition:opacity .2s,transform .3s cubic-bezier(.2,1.6,.4,1)}
.rg-practice-flash.on{opacity:1;transform:translateX(-50%) scale(1)}
.rg-practice-flash svg{width:100%;height:100%;display:block}
@media (prefers-reduced-motion:reduce){.rg-practice-flash{transition:none}}
`;

let styled = false;
let flashEl: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** A practice-pictogram element (inline SVG in a span). */
export function practiceMark(cls = '', testId = 'practice-mark'): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls;
  el.dataset.testid = testId;
  el.innerHTML = NO_GEM_SVG;
  return el;
}

/** Pop the practice pictogram in the middle of the screen for a moment (a launch that pays nothing). */
export function flashPractice(ctx: Pick<GameContext, 'uiRoot'>, seconds = 2.4): void {
  if (typeof document === 'undefined' || !ctx.uiRoot) return;
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
  }
  if (!flashEl || !flashEl.isConnected) {
    flashEl = practiceMark('rg-practice-flash', 'practice-flash');
    ctx.uiRoot.append(flashEl);
  }
  const el = flashEl;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('on'), seconds * 1000);
}
