/**
 * Inline SVG icons (24x24). Shapes inherit fill=currentColor with a dark outline (see CSS `.ic`).
 * Helper classes: k = knockout fill, l = thin detail line, o/w = thick stroke outline/white pair.
 */
import type { IconName } from '../types';

export type UiIconName =
  | IconName
  | 'play' | 'home' | 'gear' | 'grownup' | 'pause' | 'restart' | 'credits' | 'sun' | 'mouse'
  | 'target' | 'speaker' | 'note' | 'bolt' | 'close' | 'back' | 'sparkle' | 'bars1' | 'bars2' | 'bars3'
  | 'stick' | 'heart' | 'pupVoice' | 'hanger' | 'turnL' | 'turnR';

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
  // Economy icons (stream C).
  megaGem:
    '<path d="M12 1.2l9.5 5.400v10.800L12 22.800 2.500 17.400V6.600z"/><path class="l" d="M12 6.300l4.800 2.700v6L12 17.700 7.200 15V9zM12 1.200v5.100M21.500 6.600L16.800 9M21.500 17.400L16.800 15M12 22.800v-5.100M2.500 17.400L7.200 15M2.500 6.600L7.200 9"/><path class="k" d="M9.200 9.600l2-1.100v3z" style="opacity:.35"/><path d="M20.500-.6l1.100 2.500 2.500 1.100-2.500 1.100-1.100 2.500-1.100-2.500-2.500-1.100 2.500-1.100z"/>',
  combo:
    '<path d="M12.200 1C13 5 19.500 7.500 19.500 14.200a7.500 7.500 0 0 1-15 0c0-3.400 1.700-5.600 3.400-6.900-.2 2.300.9 4 2.500 4.300C9.300 7.600 10.200 3.700 12.200 1z"/><path class="l" style="stroke-width:1.600" d="M12 12.300c1.700 1.800 3.400 3 3.400 5.300a3.400 3.400 0 0 1-6.800 0c0-1.700 1.300-3 2.200-3.700.1 1 .6 1.700 1.200 1.900-.4-1.400-.3-2.400 0-3.500z"/>',
  shop:
    '<rect x="3.500" y="10.500" width="17" height="11.300" rx="1.300"/><rect class="k" x="6.300" y="14" width="4.600" height="7.800" rx=".8"/><rect class="l" x="13.300" y="14" width="4.700" height="4" rx=".7"/><path d="M4.200 2.500h15.600L22.500 9a2.600 2.600 0 0 1-5.100.6 2.700 2.700 0 0 1-5.400 0 2.700 2.700 0 0 1-5.400 0A2.600 2.600 0 0 1 1.500 9z"/><path class="l" d="M8.300 2.700L6.800 9.400M12 2.700v6.800M15.700 2.700l1.500 6.700"/>',
  ticket:
    '<g transform="rotate(-14 12 12)"><path d="M1.500 6h21v4a2 2 0 0 0 0 4v4h-21v-4a2 2 0 0 0 0-4z"/><path class="l" style="stroke-dasharray:1.500 1.500" d="M16.500 6.800v10.400"/><path class="k" d="M8.800 7.800l1.100 2.300 2.500.3-1.800 1.700.5 2.500-2.300-1.200-2.200 1.200.4-2.500-1.800-1.700 2.500-.3z"/></g>',
  mission:
    '<rect x="3.800" y="3.200" width="16.400" height="19.300" rx="2.400"/><rect x="8" y="1" width="8" height="4.400" rx="1.400"/><circle class="k" cx="12" cy="3.200" r=".9"/><path class="l" style="stroke-width:2.800" d="M7.500 13.400l3 3 6-6.600"/>',
  trail:
    '<path class="o" d="M13.200 10.200C8.300 11.500 4.600 15.300 2 21.500M15.300 13.500c-3.200 1.300-5.600 3.800-7 7.500"/><path class="w" d="M13.200 10.200C8.300 11.500 4.600 15.300 2 21.500M15.300 13.500c-3.200 1.300-5.600 3.800-7 7.500"/><path d="M17.500 1.200l1.700 3.500 3.800.5-2.800 2.700.7 3.800-3.400-1.800-3.400 1.800.7-3.800-2.800-2.700 3.800-.5z"/><circle cx="4.800" cy="9.500" r="1.400"/><circle cx="20.500" cy="16.500" r="1.200"/>',
  emote:
    '<circle cx="11" cy="13" r="9.700"/><path class="l" style="stroke-width:1.800" d="M6.300 11.300q1.600-2.100 3.200 0M12.500 11.300q1.600-2.100 3.200 0"/><path class="k" d="M5.800 14.200h10.400a5.200 5.200 0 0 1-10.400 0z"/><path d="M20.800.6l1 2.300 2.300 1-2.300 1-1 2.300-1-2.300-2.300-1 2.300-1z"/>',
  backpack:
    '<path class="o" d="M9 5.800V4.300a3 3 0 0 1 6 0v1.500"/><path class="w" d="M9 5.800V4.300a3 3 0 0 1 6 0v1.500"/><path d="M4 11.500a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6V20a2.200 2.200 0 0 1-2.200 2.200H6.200A2.200 2.200 0 0 1 4 20z"/><path class="l" d="M4.400 11h15.200"/><rect x="7" y="13.800" width="10" height="6.200" rx="1.600"/><path class="l" d="M7 16.300h10"/><rect class="k" x="11" y="15.500" width="2" height="1.700" rx=".5"/>',
  character:
    '<path d="M2.800 23c0-5.600 4-9.300 9.200-9.300s9.200 3.700 9.200 9.300z"/><circle cx="12" cy="8" r="5.300"/><path d="M6.900 6.900C6.500 2.800 10 .9 13.200 1.600l-.4 1.600 2.200-.9c1.800.9 2.700 2.600 2.200 4.600-2.700.5-6.200.2-10.300 0z"/><circle class="k" cx="9.900" cy="8.800" r="1"/><circle class="k" cx="14.100" cy="8.800" r="1"/><path class="k" d="M12 15.600l1 2.100 2.300.3-1.700 1.600.4 2.300-2-1.100-2 1.100.4-2.300-1.700-1.600 2.300-.3z"/>',
  jackpot:
    '<path class="o" d="M6 5H3.300a3.300 3.300 0 0 0 3.600 5.300M18 5h2.700a3.300 3.300 0 0 1-3.600 5.300"/><path class="w" d="M6 5H3.300a3.300 3.300 0 0 0 3.600 5.300M18 5h2.700a3.300 3.300 0 0 1-3.600 5.300"/><path d="M5.500 2h13v6.500a6.500 6.500 0 0 1-13 0z"/><path d="M10.300 14.300h3.400l.7 3.700h-4.800z"/><rect x="6" y="17.700" width="12" height="4.600" rx="1.300"/><path class="k" d="M12 4.300l1.200 2.400 2.600.4-1.900 1.800.5 2.600-2.400-1.300-2.300 1.300.4-2.600-1.900-1.800 2.600-.4z"/>',
  wallet:
    '<path d="M4 7.500L15.800 2.300l2.200 5.200z"/><path d="M2 9.200A2.200 2.200 0 0 1 4.200 7h15.600A2.200 2.200 0 0 1 22 9.200v10.600a2.200 2.200 0 0 1-2.200 2.200H4.200A2.200 2.200 0 0 1 2 19.800z"/><path class="l" d="M2.500 11h7"/><rect x="14" y="11.500" width="9.200" height="6" rx="2"/><path class="k" d="M18.200 12.700l1.700 1.900-1.700 1.900-1.700-1.900z"/>',
  tent:
    '<path d="M12 2.500L1.500 21.500h21z"/><path class="k" d="M12 9.500l-4.200 12h8.400z"/><path class="l" d="M12 2.500v19M6.500 12.500h11"/><path d="M12 .5l3.500 1.200L12 3z"/>',
  plane:
    '<path d="M2 11.200h14.500c3 0 5.500.6 5.500 1.800s-2.500 1.800-5.500 1.800H2z"/><path d="M8.500 11.400L11 3h3l-1.500 8.400zM8.500 14.600L11 23h3l-1.500-8.400z"/><path d="M2 9l1.500 4.200L2 17z"/><circle class="k" cx="17.300" cy="13" r="1.200"/>',
  dragon:
    '<path d="M3 20c1-4.500 3.500-7.500 7-8.500L8 6.500l4.500 3.200L14.800 3l1.700 6.300 4.700-.8-2.800 3.800c2 2 2.600 5 1.600 7.700z"/><circle class="k" cx="15.800" cy="12.300" r="1.100"/><path class="l" d="M7 19c2-1.500 5-2 8-1.400"/>',
  cone:
    '<path d="M6.200 10.500h11.600L12 23z"/><path class="l" d="M8 13.800l6.400 5M16 13.800l-6.400 5M7.400 12.500l9.200 0"/><circle cx="12" cy="7.200" r="5"/><circle class="k" cx="10.400" cy="5.800" r="1"/>',
  flag:
    '<rect x="3" y="1.500" width="2.600" height="21" rx="1"/><path d="M5.400 2.500h15.600v11H5.400z"/><path class="k" d="M5.400 2.500h3.900v3.700H5.400zM13.200 2.500h3.900v3.700h-3.900zM9.300 6.200h3.900v3.700H9.300zM17.100 6.200H21v3.700h-3.900zM5.400 9.900h3.900v3.600H5.400zM13.200 9.900h3.900v3.600h-3.900z"/>',
  bubble:
    '<circle cx="10" cy="13" r="8.500"/><circle class="k" cx="7" cy="10" r="2.200"/><circle cx="19.500" cy="4.500" r="3.200"/><circle cx="20.500" cy="12" r="1.600"/>',
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
  // Puppy head (floppy ears, eyes, nose) with two sound waves: Pip's voice.
  pupVoice: '<path d="M3.500 6.500L1 13.500l3.200 1.200L5.600 9z"/><path d="M14.500 6.500L17 13.500l-3.200 1.200L12.400 9z"/><ellipse cx="9" cy="12" rx="5.600" ry="6.200"/><circle class="k" cx="6.900" cy="10.800" r="1"/><circle class="k" cx="11.100" cy="10.800" r="1"/><ellipse class="k" cx="9" cy="14.600" rx="1.600" ry="1.100"/><path class="o" d="M18.500 9a4 4 0 0 1 0 6M21 6.500a7.500 7.500 0 0 1 0 11"/><path class="w" d="M18.500 9a4 4 0 0 1 0 6M21 6.500a7.500 7.500 0 0 1 0 11"/>',
  // Coat hanger with a little hat on the hook: the wardrobe / dress-up.
  hanger:
    '<path class="o" d="M12 9.200V7.600a2.300 2.300 0 1 0-2.300-2.300"/><path class="w" d="M12 9.200V7.600a2.300 2.300 0 1 0-2.300-2.300"/><path d="M12 8.600l10.100 9c.9.8.300 2.200-.9 2.200H2.800c-1.200 0-1.800-1.400-.9-2.200z"/><path class="k" d="M12 11.900l-6.300 5.600h12.600z"/>',
  // Turn the hero on the stage (curved arrows).
  turnL: '<path class="o" d="M19 15a7.500 5 0 0 1-14.500-1"/><path class="w" d="M19 15a7.500 5 0 0 1-14.500-1"/><path d="M1 15.500l3.300-6.200 4 5.400z"/><ellipse class="l" cx="12" cy="10" rx="3" ry="5"/>',
  turnR: '<path class="o" d="M5 15a7.500 5 0 0 0 14.500-1"/><path class="w" d="M5 15a7.500 5 0 0 0 14.500-1"/><path d="M23 15.500l-3.300-6.200-4 5.400z"/><ellipse class="l" cx="12" cy="10" rx="3" ry="5"/>',
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
