/**
 * Inline SVG icons (24x24). Shapes inherit fill=currentColor with a dark outline (see CSS `.ic`).
 * Helper classes: k = knockout fill, l = thin detail line, o/w = thick stroke outline/white pair.
 */
import type { IconName } from '../types';

export type UiIconName =
  | IconName
  | 'play' | 'home' | 'gear' | 'grownup' | 'pause' | 'restart' | 'credits' | 'sun' | 'mouse'
  | 'target' | 'speaker' | 'note' | 'bolt' | 'close' | 'back' | 'sparkle' | 'bars1' | 'bars2' | 'bars3'
  | 'stick' | 'heart';

const S: Record<UiIconName, string> = {
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path class="l" d="M2 9h20M9 3l-2 6 5 12M15 3l2 6-5 12"/>',
  key: '<circle cx="8" cy="9" r="5.5"/><circle class="k" cx="8" cy="9" r="2"/><path d="M12 7.5h10.5v3.5H20v3.5h-3.5V11H12z"/>',
  lock: '<path class="o" d="M8 11V8a4 4 0 0 1 8 0v3"/><path class="w" d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="4.5" y="10.5" width="15" height="11" rx="2.5"/><circle class="k" cx="12" cy="15" r="1.8"/><path class="k" d="M11 15h2l.8 4h-3.6z"/>',
  chest: '<path d="M3 10.5a9 6.5 0 0 1 18 0z"/><rect x="3" y="10" width="18" height="11" rx="2"/><path class="l" d="M3 13h18M8 6.5v14M16 6.5v14"/><rect class="k" x="10.5" y="11.5" width="3" height="4" rx="1"/>',
  star: '<path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.8 5.6 21.4 7 14.3 1.7 9.3l7.2-.9z"/>',
  car: '<path d="M1.5 17v-4.5l3.2-5h9.3l4.2 5h2.8V17z"/><path class="k" d="M6 8.5h3.6v3.5H4zM11 8.5h2.6l2.6 3.5H11z"/><circle cx="7" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><circle class="k" cx="7" cy="17.5" r="1.1"/><circle class="k" cx="17.5" cy="17.5" r="1.1"/>',
  horse: '<path d="M5 21l1.8-7.5L3.5 11l1-3.2L9 6l1-4 3.2 3 4 1.6c3 3 3.4 8 2.2 13.4z"/><circle class="k" cx="9.6" cy="8.6" r="1.1"/><path class="l" d="M13 6.5c1 3 1.2 7 .3 12"/>',
  balloon: '<path d="M12 1.5C7 1.5 3.8 5 3.8 9c0 3.6 3 6.6 5.6 8.2h5.2c2.600-1.600 5.600-4.600 5.600-8.200 0-4-3.200-7.500-8.200-7.500z"/><path class="l" d="M9 2.400c-1.800 4-1.600 10 .6 14.800M15 2.400c1.800 4 1.600 10-.6 14.800"/><rect x="8.800" y="19" width="6.400" height="3.600" rx="1"/>',
  parachute: '<path d="M2 11a10 9 0 0 1 20 0 3 3 0 0 0-5-1.500 3 3 0 0 0-5 0 3 3 0 0 0-5 0A3 3 0 0 0 2 11z"/><path class="l" d="M5 11l6.500 8M19 11l-6.500 8M12 10v9"/><circle cx="12" cy="20.500" r="2.300"/>',
  bungee: '<path class="o" d="M12 1.500v3l-4 2 8 2-8 2 8 2-4 2v2"/><path class="w" d="M12 1.500v3l-4 2 8 2-8 2 8 2-4 2v2"/><circle cx="12" cy="19.500" r="3"/><path class="l" d="M10.500 19h3"/>',
  trampoline: '<path class="o" d="M6.500 13.500L5.500 21M17.500 13.500l1 7.500"/><path class="w" d="M6.500 13.500L5.500 21M17.500 13.500l1 7.500"/><ellipse cx="12" cy="13" rx="10" ry="3"/><path d="M12 1.500l4.500 5.500h-3v3h-3V7h-3z"/>',
  rocket: '<path d="M12 1.500c4.200 3 5.500 8 4.200 13.500H7.800C6.500 9.500 7.800 4.500 12 1.500z"/><path d="M7.800 11.500L4 17l4.200-1.200zM16.200 11.500L20 17l-4.200-1.200z"/><circle class="k" cx="12" cy="8.500" r="1.900"/><path d="M9.800 16.500h4.400L12 22.500z"/>',
  hat: '<path d="M12 1.500l7 16.500H5z"/><rect x="2.800" y="17" width="18.400" height="4.200" rx="2"/><circle cx="12" cy="2.400" r="1.800"/><path class="l" d="M8.800 11h6.400"/>',
  cape: '<path d="M7 3h10l4.500 18.500h-19z"/><path class="k" d="M9.300 3a2.700 2 0 0 0 5.400 0z"/><path class="l" d="M12 8v13"/>',
  glasses: '<circle cx="6.500" cy="13.500" r="5.200"/><circle cx="17.500" cy="13.500" r="5.200"/><circle class="k" cx="6.500" cy="13.500" r="2.800"/><circle class="k" cx="17.500" cy="13.500" r="2.800"/><path class="o" d="M11.500 12.500q.5-1 1 0M1.500 11L1 6M22.500 11L23 6"/><path class="w" d="M11.500 12.500q.5-1 1 0M1.500 11L1 6M22.500 11L23 6"/>',
  paint: '<path d="M12 2.500C6.500 2.500 2 6.500 2 12s4.500 9.500 9.500 9.500c2.400 0 2.800-1.700 1.700-3.200s0-3 2-3h3.300c2.800 0 5.500-1.800 5.500-4.800C24 5.500 18.500 2.500 12 2.500z"/><circle class="k" cx="7.500" cy="11" r="1.600"/><circle class="k" cx="11" cy="7" r="1.600"/><circle class="k" cx="16" cy="8" r="1.600"/>',
  exit: '<rect x="3" y="2.500" width="11" height="19" rx="1.800"/><circle class="k" cx="11" cy="12" r="1"/><path class="o" d="M13 12h8.500M18.500 8.500L22 12l-3.500 3.500"/><path class="w" d="M13 12h8.500M18.500 8.500L22 12l-3.500 3.500"/>',
  hand: '<path d="M7.500 12V5.200a1.700 1.700 0 0 1 3.400 0V10V3.700a1.700 1.700 0 0 1 3.400 0V10V5a1.700 1.700 0 0 1 3.400 0v9.500c0 4.500-2.500 7.500-6.500 7.500-3 0-4.800-1.800-6-4l-2.200-4a1.700 1.700 0 0 1 2.800-1.800z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path class="o" d="M12 6v6.500l4 2.500"/><path class="w" d="M12 6v6.500l4 2.500" style="stroke:#000"/>',
  flop: '<path class="o" d="M20 12a8 8 0 1 1-2.500-5.800"/><path class="w" d="M20 12a8 8 0 1 1-2.500-5.800"/><path d="M14.500 2.500l5.500.5-.5 5.500z"/>',
  eye: '<path d="M1 12C4 6.500 8 4.500 12 4.500s8 2 11 7.500c-3 5.500-7 7.500-11 7.500S4 17.500 1 12z"/><circle class="k" cx="12" cy="12" r="4.200"/><circle cx="13.400" cy="10.600" r="1.300" style="stroke:none"/>',
  check: '<path class="o" d="M4.500 12.500l5 5L20 6.500"/><path class="w" d="M4.500 12.500l5 5L20 6.500" style="stroke:currentColor"/>',
  // Placeholder glyphs for the economy icons (stream C); the ui-designer redraws them.
  megaGem: '<path d="M5 2h14l4.500 7L12 22.500.5 9z"/><path class="l" d="M.5 9h23M9 2l-2.500 7L12 22.500M15 2l2.500 7L12 22.500"/>',
  combo: '<path d="M13.500 1.500L4 13.500h6l-1.500 9L20 9.500h-6.500z"/><circle class="k" cx="18.500" cy="18.500" r="3"/>',
  shop: '<path d="M2 9l2-6h16l2 6z"/><rect x="3.500" y="9" width="17" height="12" rx="1.500"/><rect class="k" x="9.500" y="13" width="5" height="8" rx="1"/>',
  ticket: '<path d="M2 6h20v4a2 2 0 0 0 0 4v4H2v-4a2 2 0 0 0 0-4z"/><path class="l" d="M15 6v12"/>',
  mission: '<rect x="4" y="2.500" width="16" height="19.500" rx="2"/><rect class="k" x="8.500" y="1" width="7" height="3.500" rx="1.200"/><path class="l" d="M8 10h8M8 14h8M8 18h5"/>',
  trail: '<circle cx="18.500" cy="5.500" r="3.500"/><circle cx="12" cy="11" r="2.600"/><circle cx="7" cy="15.500" r="1.900"/><circle cx="3.500" cy="19.500" r="1.300"/>',
  emote: '<circle cx="12" cy="12" r="10.500"/><circle class="k" cx="8.500" cy="9.500" r="1.400"/><circle class="k" cx="15.500" cy="9.500" r="1.400"/><path class="k" d="M7 14h10a5 5 0 0 1-10 0z"/>',
  backpack: '<path class="o" d="M9 5V3.500h6V5"/><path class="w" d="M9 5V3.500h6V5"/><rect x="4.500" y="5" width="15" height="17" rx="4"/><rect class="k" x="8" y="13" width="8" height="5" rx="1.200"/>',
  character: '<circle cx="12" cy="6.500" r="4.500"/><path d="M3.500 22.500c0-6 3.500-10 8.500-10s8.500 4 8.500 10z"/>',
  jackpot: '<path d="M3 9h18v12.500H3z"/><path d="M2 5.500h20V9H2z"/><path class="l" d="M12 5.500v16"/><path d="M12 5.500C9 1 5.500 2 7.500 5.500M12 5.500C15 1 18.500 2 16.500 5.500"/>',
  wallet: '<path d="M3 6.500h16.500a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H4.500A2.500 2.500 0 0 1 2 19.500V5A2.500 2.500 0 0 1 4.500 2.500H17v4"/><rect class="k" x="15" y="12" width="6.500" height="4.500" rx="1.200"/>',
  play: '<path d="M6 3.500l15 8.500-15 8.500z"/>',
  home: '<path d="M12 2.500L1.800 11.500h3V21h5.400v-6h3.600v6h5.400v-9.500h3z"/>',
  gear: '<path d="M10 1.500h4l.7 3 2 .9 2.700-1.600 2.800 2.800-1.600 2.700.9 2 3 .7v4l-3 .7-.9 2 1.600 2.700-2.800 2.800-2.700-1.600-2 .9-.7 3h-4l-.7-3-2-.9-2.700 1.600-2.800-2.800 1.600-2.700-.9-2-3-.7v-4l3-.7.9-2L3.800 7.600l2.800-2.800 2.700 1.600 2-.9z"/><circle class="k" cx="12" cy="12" r="3.400"/>',
  grownup: '<circle cx="12" cy="6" r="4"/><path d="M4 22c0-6 3-10 8-10s8 4 8 10z"/><path class="k" d="M11 12.500h2l1 4-2 2.200-2-2.200z"/>',
  pause: '<rect x="5" y="3.500" width="5" height="17" rx="1.500"/><rect x="14" y="3.500" width="5" height="17" rx="1.500"/>',
  restart: '<path class="o" d="M20 12a8 8 0 1 1-2.400-5.700"/><path class="w" d="M20 12a8 8 0 1 1-2.400-5.700"/><path d="M13 1.800l7 .8-1 7z"/>',
  credits: '<circle cx="12" cy="12" r="10"/><circle class="k" cx="12" cy="7.200" r="1.600"/><rect class="k" x="10.500" y="10" width="3" height="8" rx="1"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path class="o" d="M12 1.500v3M12 19.500v3M1.500 12h3M19.500 12h3M4.500 4.500l2.100 2.100M17.400 17.400l2.100 2.100M4.500 19.500l2.100-2.100M17.400 6.600l2.100-2.100"/><path class="w" d="M12 1.500v3M12 19.500v3M1.500 12h3M19.500 12h3M4.500 4.500l2.100 2.100M17.400 17.400l2.100 2.100M4.500 19.500l2.100-2.100M17.400 6.600l2.100-2.100"/>',
  mouse: '<rect x="5.500" y="1.500" width="13" height="21" rx="6.500"/><path class="l" d="M12 1.800v8M5.800 10h12.400"/><rect class="k" x="10.800" y="3.500" width="2.400" height="4" rx="1.200"/>',
  target: '<circle cx="12" cy="12" r="10.500"/><circle class="k" cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="4.600"/><circle class="k" cx="12" cy="12" r="2"/>',
  speaker: '<path d="M2 9h4l6-5v16l-6-5H2z"/><path class="o" d="M16 8.500a5 5 0 0 1 0 7M19 5.500a9 9 0 0 1 0 13"/><path class="w" d="M16 8.500a5 5 0 0 1 0 7M19 5.500a9 9 0 0 1 0 13"/>',
  note: '<path d="M9 3.500l12-2v14.500a3.500 3 0 1 1-2.500-2.800V6.600L11.500 8v10a3.500 3 0 1 1-2.500-2.800z"/>',
  bolt: '<path d="M13.500 1.500L4 13.500h6l-1.500 9L20 9.500h-6.500z"/>',
  close: '<path class="o" d="M5 5l14 14M19 5L5 19"/><path class="w" d="M5 5l14 14M19 5L5 19"/>',
  back: '<path class="o" d="M20 12H5M11 5l-7 7 7 7"/><path class="w" d="M20 12H5M11 5l-7 7 7 7"/>',
  sparkle: '<path d="M12 1.500l2.600 8 8.400 2.500-8.400 2.500L12 22.500l-2.600-8L1 12l8.400-2.500z"/>',
  bars1: '<rect x="3" y="15" width="4.500" height="6" rx="1"/><rect class="d" x="9.800" y="9" width="4.500" height="12" rx="1" style="opacity:.3"/><rect class="d" x="16.500" y="3" width="4.500" height="18" rx="1" style="opacity:.3"/>',
  bars2: '<rect x="3" y="15" width="4.500" height="6" rx="1"/><rect x="9.800" y="9" width="4.500" height="12" rx="1"/><rect x="16.500" y="3" width="4.500" height="18" rx="1" style="opacity:.3"/>',
  bars3: '<rect x="3" y="15" width="4.500" height="6" rx="1"/><rect x="9.800" y="9" width="4.500" height="12" rx="1"/><rect x="16.500" y="3" width="4.500" height="18" rx="1"/>',
  stick: '<circle cx="12" cy="12" r="10.500"/><circle class="k" cx="12" cy="12" r="6.800"/><circle cx="12" cy="12" r="4.800"/>',
  heart: '<path d="M12 21.500C4 15.500 1.500 11.500 1.500 8a5.200 5.200 0 0 1 10.500-1.500A5.200 5.200 0 0 1 22.500 8c0 3.500-2.500 7.500-10.500 13.500z"/>',
};

export function iconSvg(name: UiIconName): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${S[name]}</svg>`;
}

/** An inline icon element sized 1em. */
export function icon(name: UiIconName, cls = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `ic ${cls}`.trim();
  el.innerHTML = iconSvg(name);
  return el;
}

const KNOWN = Object.keys(S) as UiIconName[];
export const ALL_ICON_NAMES: readonly UiIconName[] = KNOWN;
