/**
 * Pictograms for Pip's bubble: every icon of the game (icons.ts + wayIcons.ts) plus a few of his
 * own. Same 24x24 conventions (k knockout, l thin line, o/w outline+white pair), bold shapes that
 * read by brightness in the red-only and green-only views.
 */
import type { BuddyExtraIcon, BuddyPicto } from '../../buddy/types';
import { pictogram } from '../wayIcons';
import type { PictoName } from '../wayIcons';

const EXTRA: Record<BuddyExtraIcon, string> = {
  paw:
    '<ellipse cx="12" cy="16" rx="6.2" ry="5.2"/><ellipse cx="4.6" cy="9.6" rx="2.4" ry="3"/><ellipse cx="9.2" cy="5.2" rx="2.4" ry="3.1"/><ellipse cx="14.8" cy="5.2" rx="2.4" ry="3.1"/><ellipse cx="19.4" cy="9.6" rx="2.4" ry="3"/>',
  wave:
    '<path d="M7.5 12V5.2a1.7 1.7 0 0 1 3.4 0V10V3.7a1.7 1.7 0 0 1 3.4 0V10V5a1.7 1.7 0 0 1 3.4 0v9.5c0 4.5-2.5 7.5-6.5 7.5-3 0-4.8-1.8-6-4l-2.2-4a1.7 1.7 0 0 1 2.8-1.8z"/><path class="o" d="M20.5 3.5q2 2 1.5 5M2.5 4.5q-1.2 2.5 0 5"/><path class="w" d="M20.5 3.5q2 2 1.5 5M2.5 4.5q-1.2 2.5 0 5"/>',
  question:
    '<circle cx="12" cy="12" r="10.5"/><path class="o" d="M8.6 9.2a3.5 3.4 0 1 1 4.6 3.2c-1 .4-1.2 1-1.2 2.2"/><path class="w" d="M8.6 9.2a3.5 3.4 0 1 1 4.6 3.2c-1 .4-1.2 1-1.2 2.2" style="stroke:#000"/><circle class="k" cx="12" cy="18.2" r="1.5"/>',
  pip:
    '<path class="k" d="M3.8 5.5C1.6 6.8.8 11 1.6 15c.5 2 2.8 2.1 3.6.2L7.3 9z"/><path class="k" d="M20.2 5.5c2.2 1.3 3 5.5 2.2 9.5-.5 2-2.8 2.1-3.6.2L16.7 9z"/><ellipse cx="12" cy="12.6" rx="8.2" ry="7.8"/><ellipse class="k" cx="15.2" cy="11.4" rx="2.9" ry="3" style="opacity:.55"/><ellipse class="k" cx="8.6" cy="11.4" rx="1.7" ry="2"/><ellipse class="k" cx="15.4" cy="11.4" rx="1.7" ry="2"/><circle cx="9.1" cy="10.7" r=".6" style="stroke:none"/><circle cx="15.9" cy="10.7" r=".6" style="stroke:none"/><ellipse class="k" cx="12" cy="15.3" rx="1.9" ry="1.3"/><path class="l" d="M10 17.6q2 1.4 4 0"/>',
  nose:
    '<path d="M6 13c0-4 2.8-6.5 6-6.5s6 2.5 6 6.5c0 2.8-2.6 4.2-6 4.2S6 15.8 6 13z"/><ellipse class="k" cx="9.6" cy="13" rx="1.2" ry="1.6"/><ellipse class="k" cx="14.4" cy="13" rx="1.2" ry="1.6"/><path class="o" d="M2 6.5q2 1 2 3M22 6.5q-2 1-2 3M3 19q2-.8 3.5 0M21 19q-2-.8-3.5 0"/><path class="w" d="M2 6.5q2 1 2 3M22 6.5q-2 1-2 3M3 19q2-.8 3.5 0M21 19q-2-.8-3.5 0"/>',
  party:
    '<path d="M2.5 21.5l5.5-14 8.5 8.5z"/><path class="l" d="M5 15l4 4M6.6 11l6.4 6.4"/><circle cx="17" cy="4" r="1.8"/><circle cx="21" cy="10" r="1.5"/><circle cx="12.5" cy="2.8" r="1.2"/><path d="M19.5 14.5l1 2 2 .5-1.6 1.4.4 2.1-1.8-1-1.8 1 .4-2.1-1.6-1.4 2-.5z"/><path class="o" d="M13 7.5q2-3.5 5.5-2.2"/><path class="w" d="M13 7.5q2-3.5 5.5-2.2"/>',
};

export function buddyPicto(name: BuddyPicto, cls = ''): HTMLSpanElement {
  if (name in EXTRA) {
    const el = document.createElement('span');
    el.className = `ic ${cls}`.trim();
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${EXTRA[name as BuddyExtraIcon]}</svg>`;
    return el;
  }
  return pictogram(name as PictoName, cls);
}

export const BUDDY_EXTRA_ICONS = Object.keys(EXTRA) as BuddyExtraIcon[];
