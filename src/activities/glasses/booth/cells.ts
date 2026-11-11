/**
 * Booth atlas layout (pure data, unit-tested). ONE 2048×2048 atlas shared by every booth on the
 * island: 8 × 8 cells of 256 px, row-major from the top-left.
 *
 *   cells  0..35  demo flipbooks: 6 frames per site slot (slot = the site's index 0..5)
 *   cell  36      the "magic glasses" mark (round badge, glasses, sparkle)
 *   cell  37      candy stripes (diagonal; poles and skirts)
 *   cell  38      flat swatches (4 × 4 of 64 px)
 *   cell  39      start pad face, "press" kind (ring with chevrons pointing in)
 *   cells 40..43  the header banner (1024 × 256: scallops, stars, two marks)
 *   cell  44      start pad face, walk-in kind (two footprints in a ring)
 *   cell  45      lamps (2 × 2: off, hit, miss, chase)
 *   cell  46      device buttons (2 × 2: key cap E, gamepad X, touch hand, spare)
 *   cell  47      ground chevron (transparent around it)
 *   cells 48..55  3, 2, 1, GO, ✓, ✗, gem, star burst
 *   cells 56..63  prompts: arch, press, look, back to pad, step on pad, catch, follow, aim
 *
 * Why a second atlas (and not the 1024² board atlas in ../pictos.ts): that one is full (15
 * pictograms + its swatch cell) and the booths need ~28 more cells plus 36 demo frames. The old
 * atlas stays for the boards of the games that have not moved to the kit yet; when all six have,
 * it can go.
 */
export const BOOTH_ATLAS = 2048;
export const BCELL = 256;
const COLS = BOOTH_ATLAS / BCELL;

export const DEMO_SLOTS = 6;
export const DEMO_MAX_FRAMES = 6;

export type UvRect = readonly [number, number, number, number];

export const KIT_CELL = {
  mark: 36,
  stripes: 37,
  swatches: 38,
  padPress: 39,
  banner: 40,
  padWalk: 44,
  lamps: 45,
  device: 46,
  chevron: 47,
  digit3: 48,
  digit2: 49,
  digit1: 50,
  go: 51,
  check: 52,
  cross: 53,
  gem: 54,
  burst: 55,
} as const;

export const PROMPTS = ['arch', 'press', 'look', 'backToPad', 'stepPad', 'catch', 'follow', 'aim'] as const;
export type PromptId = (typeof PROMPTS)[number];
export const PROMPT_CELL0 = 56;

export type LampState = 'off' | 'hit' | 'miss' | 'chase';
export const LAMP_STATES: readonly LampState[] = ['off', 'hit', 'miss', 'chase'];

export type DeviceId = 'keyboard' | 'gamepad' | 'touch';
export const DEVICES: readonly DeviceId[] = ['keyboard', 'gamepad', 'touch'];

/** Swatch names (cell 38, 4 × 4). Every colour pair used side by side differs in BOTH R and G. */
export const SWATCHES = {
  cream: '#fbf4e2',
  berry: '#5c0a24',
  navy: '#1b2466',
  gold: '#ffcf33',
  ink: '#121419',
  wood: '#a87a4c',
  woodDark: '#4e321c',
  white: '#ffffff',
  night: '#141833',
  plum: '#3d1a5c',
  sun: '#fff0a0',
  stone: '#d8d0bc',
} as const;
export type SwatchId = keyof typeof SWATCHES;
export const SWATCH_ORDER = Object.keys(SWATCHES) as SwatchId[];

/** Pixel rectangle (x, y, w, h; y down) of a cell. */
export function cellPx(cell: number): [number, number, number, number] {
  if (!Number.isInteger(cell) || cell < 0 || cell >= COLS * COLS) throw new Error(`booth atlas: bad cell ${cell}`);
  return [(cell % COLS) * BCELL, Math.floor(cell / COLS) * BCELL, BCELL, BCELL];
}

/** UV rect (u0, v0, du, dv; v bottom-up, texture flipY) of a pixel rect, inset by `inset` px. */
export function pxUv(x: number, y: number, w: number, h: number, inset = 3): UvRect {
  return [(x + inset) / BOOTH_ATLAS, 1 - (y + h - inset) / BOOTH_ATLAS, (w - 2 * inset) / BOOTH_ATLAS, (h - 2 * inset) / BOOTH_ATLAS];
}

export const cellUv = (cell: number, inset = 3): UvRect => {
  const [x, y, w, h] = cellPx(cell);
  return pxUv(x, y, w, h, inset);
};

/** Cell of frame `frame` of demo slot `slot`. */
export function demoCell(slot: number, frame: number): number {
  if (slot < 0 || slot >= DEMO_SLOTS) throw new Error(`booth atlas: bad demo slot ${slot}`);
  if (frame < 0 || frame >= DEMO_MAX_FRAMES) throw new Error(`booth atlas: bad demo frame ${frame}`);
  return slot * DEMO_MAX_FRAMES + frame;
}

/** Quarter `q` (0..3: top-left, top-right, bottom-left, bottom-right) of a cell, in px. */
export function quarterPx(cell: number, q: number): [number, number, number, number] {
  const [x, y] = cellPx(cell);
  const h = BCELL / 2;
  return [x + (q % 2) * h, y + Math.floor(q / 2) * h, h, h];
}

export const lampUv = (s: LampState): UvRect => {
  const [x, y, w, h] = quarterPx(KIT_CELL.lamps, LAMP_STATES.indexOf(s));
  return pxUv(x, y, w, h, 4);
};

export const deviceUv = (d: DeviceId): UvRect => {
  const [x, y, w, h] = quarterPx(KIT_CELL.device, DEVICES.indexOf(d));
  return pxUv(x, y, w, h, 4);
};

/** The footprint pictogram (the device cell's spare quarter; ground decals). */
export const footprintsUv = (): UvRect => {
  const [x, y, w, h] = quarterPx(KIT_CELL.device, 3);
  return pxUv(x, y, w, h, 4);
};

export const promptCell = (p: PromptId): number => PROMPT_CELL0 + PROMPTS.indexOf(p);

/** Swatch pixel rect (64 px squares). */
export function swatchPx(s: SwatchId): [number, number, number, number] {
  const i = SWATCH_ORDER.indexOf(s);
  const [x, y] = cellPx(KIT_CELL.swatches);
  return [x + (i % 4) * 64, y + Math.floor(i / 4) * 64, 64, 64];
}

/** UV rect well inside a swatch (no bleeding, even at low mips). */
export function swatchUv(s: SwatchId): UvRect {
  const [x, y] = swatchPx(s);
  return pxUv(x + 20, y + 20, 24, 24, 0);
}

/** The banner strip (cells 40..43) as one UV rect. */
export function bannerUv(): UvRect {
  const [x, y] = cellPx(KIT_CELL.banner);
  return pxUv(x, y, BCELL * 4, BCELL, 3);
}

/** Countdown cell for 3, 2, 1 and 0 (= GO). */
export function countCell(n: number): number {
  return n >= 3 ? KIT_CELL.digit3 : n === 2 ? KIT_CELL.digit2 : n === 1 ? KIT_CELL.digit1 : KIT_CELL.go;
}

/** Which device pictogram a pad shows for an input device (the last one used). */
export function deviceFor(device: string | undefined): DeviceId {
  return device === 'gamepad' || device === 'touch' ? device : 'keyboard';
}
