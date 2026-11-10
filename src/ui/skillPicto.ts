/**
 * Skill pictograms: a white ball-hero doing the move on a ground bar, with a tiny CSS loop
 * (see characterSelectCss.ts). White, yellow and black only, so they read in R-only and G-only.
 * `still` freezes the loop on its most readable frame (HUD chip).
 */
import type { SkillId } from '../types';

const GROUND = '<rect class="gr" x="6" y="39" width="36" height="5" rx="2.5"/>';
const DOT = '<g class="dot"><circle cx="24" cy="33" r="5.5"/><circle class="k" cx="22.2" cy="32" r="1"/><circle class="k" cx="26.2" cy="32" r="1"/></g>';

const BODY: Record<SkillId, string> = {
  // Two stacked jumps: arrows up, a puff ring where the second jump kicks off.
  doubleJump:
    `${GROUND}<ellipse class="puff" cx="24" cy="21" rx="9" ry="3.2"/>` +
    '<path class="arr" d="M40 24l4-5 4 5zM40 14l4-5 4 5z"/>' + DOT,
  // Wings out, slow drift down along a dashed path.
  glide:
    `${GROUND}<path class="trail" d="M8 12q16 2 28 22"/>` +
    '<g class="dot"><g class="wings"><path d="M18 31q-8-6-12-1 6 2 12 4zM30 31q8-6 12-1-6 2-12 4z"/></g>' +
    '<circle cx="24" cy="33" r="5.5"/><circle class="k" cx="22.2" cy="32" r="1"/><circle class="k" cx="26.2" cy="32" r="1"/></g>',
  // Streak lines and a stretched hero zooming right.
  dash:
    `${GROUND}<g class="lines"><path d="M2 28h14M4 34h12M2 40h10"/></g>` +
    '<path class="arr" d="M38 26l7 6-7 6z"/>' + DOT,
  // Spring pad squashes, hero shoots way up.
  superBounce:
    '<path class="spring" d="M14 39h20l-3-4h-14z"/>' + GROUND +
    '<path class="arr" d="M24 3l6 8h-4v5h-4v-5h-4z"/>' + DOT,
  // Falls fast, shock rings spread on the ground.
  groundPound:
    `${GROUND}<ellipse class="ring r1" cx="24" cy="38" rx="6" ry="2"/><ellipse class="ring r2" cx="24" cy="38" rx="6" ry="2"/>` +
    '<path class="arr" d="M20 4h8v8h5l-9 9-9-9h5z"/>' + DOT,
};

export const SKILL_NAMES: Record<SkillId, string> = {
  doubleJump: 'DOUBLE JUMP',
  glide: 'GLIDE',
  dash: 'DASH',
  superBounce: 'SUPER BOUNCE',
  groundPound: 'GROUND POUND',
};

/** A pictogram element; `still` pauses the loop on a good frame. */
export function skillPicto(id: SkillId, still = false): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `sk sk-${id}${still ? ' still' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 48 48" focusable="false">${BODY[id]}</svg>`;
  return el;
}
