/**
 * Wayfinding pictograms (24x24): the compass attractions plus the "air trick" and "power-slide"
 * move icons. Same helper classes as icons.ts (k knockout, l thin line, o/w outline/white pair),
 * bold solid shapes so they stay unambiguous at about 20 px in the red-only and green-only views.
 */
import type { UiIconName } from './icons';
import { icon } from './icons';

export type WayIconName = 'wTrampoline' | 'wPads' | 'wCar' | 'wBalloon' | 'wTarget' | 'wRocket' | 'wAir' | 'wSlide';

const S: Record<WayIconName, string> = {
  // Jumper ball above a legged round mat.
  wTrampoline:
    '<path class="o" d="M6 15.500L4.500 22M18 15.500L19.500 22"/><path class="w" d="M6 15.500L4.500 22M18 15.500L19.500 22"/><ellipse cx="12" cy="15" rx="10.500" ry="3.400"/><circle cx="12" cy="6" r="4"/>',
  // Flat pad on the ground with two stacked up-chevrons.
  wPads:
    '<ellipse cx="12" cy="20" rx="10.500" ry="3.200"/><path class="o" d="M5.500 10.500L12 4.500l6.500 6M5.500 16L12 10l6.500 6"/><path class="w" d="M5.500 10.500L12 4.500l6.500 6M5.500 16L12 10l6.500 6"/>',
  // Chunky side-view buggy.
  wCar:
    '<path d="M1.500 18v-5l3.500-5h9l4.500 5h4V18z"/><path class="k" d="M6.300 9.500h3.700V13H4zM11.500 9.500h2.500l2.600 3.500h-5.100z"/><circle cx="7" cy="18" r="3.400"/><circle cx="17.500" cy="18" r="3.400"/><circle class="k" cx="7" cy="18" r="1.200"/><circle class="k" cx="17.500" cy="18" r="1.200"/>',
  // Envelope with panel seams, basket below.
  wBalloon:
    '<path d="M12 1.500C6.800 1.500 3.500 5.200 3.500 9.300c0 4 3.400 7 6 8.500h5c2.600-1.500 6-4.500 6-8.500 0-4.100-3.300-7.800-8.500-7.800z"/><path class="l" d="M9.200 2.500c-1.800 4.500-1.500 9.500.4 14.500M14.800 2.500c1.800 4.500 1.500 9.500-.4 14.500"/><rect x="8.500" y="19" width="7" height="4" rx="1.200"/>',
  // Bold bullseye: three rings.
  wTarget:
    '<circle cx="12" cy="12" r="10.800"/><circle class="k" cx="12" cy="12" r="7.600"/><circle cx="12" cy="12" r="5.200"/><circle class="k" cx="12" cy="12" r="2.200"/>',
  // Upright rocket with big fins and flame.
  wRocket:
    '<path d="M12 1c4.600 3.200 6 8.500 4.500 14h-9C6 9.500 7.400 4.200 12 1z"/><path d="M7.500 11L3 18l5-1.500zM16.500 11L21 18l-5-1.500z"/><circle class="k" cx="12" cy="8.500" r="2.200"/><path d="M9.500 16.500h5L12 23z"/>',
  // Person-dot with a big flip arrow around it.
  wAir:
    '<path class="o" d="M20 12a8 8 0 1 1-2.800-6.100"/><path class="w" d="M20 12a8 8 0 1 1-2.800-6.100"/><path d="M14 1.800l7.500 1-1.500 7.200z"/><circle cx="12" cy="12" r="3.200"/>',
  // Car skidding with slide lines.
  wSlide:
    '<path d="M6 16v-3.500l2.600-3.500h6.300l3.100 3.500H21V16z"/><circle cx="9.500" cy="16.500" r="2.600"/><circle cx="17" cy="16.500" r="2.600"/><path class="o" d="M1.500 21q4-2.500 8-1M2 7.500h4M1.500 12h3.500"/><path class="w" d="M1.500 21q4-2.500 8-1M2 7.500h4M1.500 12h3.500"/>',
};

export type PictoName = UiIconName | WayIconName;

/** An icon element for either icon set. */
export function pictogram(name: PictoName, cls = ''): HTMLSpanElement {
  if (!(name in S)) return icon(name as UiIconName, cls);
  const el = document.createElement('span');
  el.className = `ic ${cls}`.trim();
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${S[name as WayIconName]}</svg>`;
  return el;
}

export const WAY_ICON_NAMES = Object.keys(S) as WayIconName[];
