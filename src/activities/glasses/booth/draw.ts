/**
 * Canvas2D art for the booth atlas, and the `DemoKit` helpers every mini-game's demo flipbook
 * draws with, so the six demos share one style: a chunky little hero (big white head, yellow
 * body, thick white limbs) on a near-black rounded panel. White, yellow and near-black only:
 * everything reads by brightness in the R-only and the G-only picture.
 *
 * All helpers work in 100 × 100 "units" per cell: call `units(c, size)` first (the kit does it
 * for demo frames) and draw in 0..100.
 */
export const INK = '#121419';
export const WHITE = '#fbf8f0';
export const YEL = '#ffd23a';
export const GREY = '#8a909a';
export const DARK = '#3a3f49';
/** Dark accents that are dark in BOTH R and G (stripes, flags). */
export const BERRY = '#7a1430';
export const NAVY = '#1b2466';

type C2 = CanvasRenderingContext2D;

export type HeroPose = 'stand' | 'runA' | 'runB' | 'jump' | 'press' | 'look' | 'cheer';

export function units(c: C2, size: number): void {
  c.scale(size / 100, size / 100);
}

export function line(c: C2, pts: readonly number[], w: number, col = WHITE): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

export function disc(c: C2, x: number, y: number, r: number, col: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
}

export function ring(c: C2, x: number, y: number, r: number, w: number, col: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.stroke();
}

export function roundRect(c: C2, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function poly(c: C2, pts: readonly number[], fill: string, stroke?: string, w = 3): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = w;
    c.strokeStyle = stroke;
    c.lineJoin = 'round';
    c.stroke();
  }
}

export function arrow(c: C2, x0: number, y0: number, x1: number, y1: number, w = 6, col = YEL): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const hl = w * 2.1;
  const bx = x1 - Math.cos(a) * hl;
  const by = y1 - Math.sin(a) * hl;
  line(c, [x0, y0, bx, by], w, col);
  const px = -Math.sin(a) * w * 1.6;
  const py = Math.cos(a) * w * 1.6;
  poly(c, [x1, y1, bx + px, by + py, bx - px, by - py], col);
}

export function star(c: C2, x: number, y: number, r: number, col = YEL, inner = 0.45): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  poly(c, pts, col);
}

/** Four-point sparkle. */
export function sparkle(c: C2, x: number, y: number, r: number, col = WHITE): void {
  const k = r * 0.22;
  poly(c, [x, y - r, x + k, y - k, x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k], col);
}

export function gem(c: C2, x: number, y: number, s: number): void {
  const pts = [x - 7 * s, y - 3 * s, x - 3.5 * s, y - 8 * s, x + 3.5 * s, y - 8 * s, x + 7 * s, y - 3 * s, x, y + 8 * s];
  poly(c, pts, WHITE, INK, 1.5 * s);
  poly(c, [x - 7 * s, y - 3 * s, x + 7 * s, y - 3 * s, x, y + 8 * s], YEL);
  line(c, [x - 3.5 * s, y - 3 * s, x, y - 8 * s, x + 3.5 * s, y - 3 * s], 1.2 * s, INK);
}

/** A bold check mark in a white disc (✓). */
export function check(c: C2, x: number, y: number, r: number): void {
  disc(c, x, y, r, WHITE);
  ring(c, x, y, r, r * 0.12, YEL);
  line(c, [x - r * 0.5, y + r * 0.02, x - r * 0.14, y + r * 0.38, x + r * 0.55, y - r * 0.4], r * 0.3, INK);
}

/** A bold cross on a dark disc with a grey rim (✗): dim, never alarming. */
export function cross(c: C2, x: number, y: number, r: number): void {
  disc(c, x, y, r, DARK);
  ring(c, x, y, r * 0.94, r * 0.12, GREY);
  line(c, [x - r * 0.42, y - r * 0.42, x + r * 0.42, y + r * 0.42], r * 0.26, WHITE);
  line(c, [x + r * 0.42, y - r * 0.42, x - r * 0.42, y + r * 0.42], r * 0.26, WHITE);
}

/** Arch outline (feet at y). */
export function arch(c: C2, x: number, y: number, w: number, h: number, col: string, lw: number): void {
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.lineTo(x - w / 2, y - h + w / 2);
  c.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w / 2, y);
  c.lineWidth = lw;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.stroke();
}

/** Push button on a base; (x, y) = top of the base. */
export function button(c: C2, x: number, y: number, s: number, pressed: boolean): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  roundRect(c, -16, 0, 32, 10, 3);
  c.fillStyle = GREY;
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = WHITE;
  c.stroke();
  c.beginPath();
  c.ellipse(0, 0, 11, pressed ? 5 : 11, 0, Math.PI, 0);
  c.closePath();
  c.fillStyle = YEL;
  c.fill();
  c.stroke();
  c.restore();
}

/** Pointing hand, fingertip at (x, y), finger down. */
export function hand(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  roundRect(c, -4, -22, 8, 22, 4);
  c.fillStyle = WHITE;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.stroke();
  roundRect(c, -8, -40, 24, 22, 7);
  c.fillStyle = WHITE;
  c.fill();
  c.stroke();
  line(c, [3, -33, 14, -33], 1.8, INK);
  line(c, [3, -26, 14, -26], 1.8, INK);
  roundRect(c, -6, -52, 20, 12, 3);
  c.fillStyle = YEL;
  c.fill();
  c.restore();
}

/** Glasses (two round lenses, the right one shining). */
export function specs(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const r = 13;
  line(c, [-37, -5, -27, -2], 5.5, WHITE);
  line(c, [37, -5, 27, -2], 5.5, WHITE);
  c.beginPath();
  c.arc(0, 2, 6, Math.PI * 1.1, Math.PI * 1.9);
  c.lineWidth = 5.5;
  c.strokeStyle = WHITE;
  c.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    line(c, [16 + Math.cos(a) * (r + 5), 2 + Math.sin(a) * (r + 5), 16 + Math.cos(a) * (r + 11), 2 + Math.sin(a) * (r + 11)], 3.4, YEL);
  }
  disc(c, -16, 2, r, DARK);
  disc(c, 16, 2, r, YEL);
  disc(c, 11.5, -2.5, 4.2, WHITE);
  ring(c, -16, 2, r, 5.5, WHITE);
  ring(c, 16, 2, r, 5.5, WHITE);
  c.restore();
}

/**
 * The shared "magic glasses" mark: a round badge (bright rim, dark face), bold glasses with one
 * shining lens, a big sparkle. Every glasses game carries it. (x, y) = centre, r = radius.
 */
export function mark(c: C2, x: number, y: number, r: number): void {
  disc(c, x, y, r, YEL);
  disc(c, x, y, r * 0.9, WHITE);
  disc(c, x, y, r * 0.8, INK);
  specs(c, x, y + r * 0.08, (r * 0.8) / 46);
  sparkle(c, x - r * 0.48, y - r * 0.44, r * 0.2, YEL);
  sparkle(c, x + r * 0.5, y + r * 0.48, r * 0.13, WHITE);
  star(c, x + r * 0.46, y - r * 0.5, r * 0.12, WHITE);
}

/** Dark rounded panel with a white border (demo frames, prompts). */
export function panel(c: C2): void {
  roundRect(c, 2, 2, 96, 96, 12);
  c.fillStyle = INK;
  c.fill();
  roundRect(c, 4.5, 4.5, 91, 91, 10);
  c.lineWidth = 3.4;
  c.strokeStyle = WHITE;
  c.stroke();
}

/** A ground line across a panel at height y. */
export function ground(c: C2, y: number, x0 = 10, x1 = 90): void {
  line(c, [x0, y, x1, y], 3.2, GREY);
}

/**
 * The chunky little hero; (x, y) = between the feet, height ≈ 46·s units. `dir` −1 mirrors
 * (faces left). Poses: stand, runA/runB (two run frames), jump, press (arm down to a button in
 * front), look (hand over the eyes, leaning in), cheer (both arms up).
 */
export function hero(c: C2, x: number, y: number, s: number, pose: HeroPose, dir: 1 | -1 = 1): void {
  c.save();
  c.translate(x, y);
  c.scale(s * dir, s);
  const lw = 6.2;
  const W = WHITE;
  // Legs.
  if (pose === 'runA') {
    line(c, [-2, -16, -9, -8, -15, -4], lw, W);
    line(c, [2, -16, 8, -9, 6, 0], lw, W);
  } else if (pose === 'runB') {
    line(c, [-2, -16, 2, -8, -4, 0], lw, W);
    line(c, [2, -16, 11, -11, 16, -14], lw, W);
  } else if (pose === 'jump') {
    line(c, [-3, -20, -9, -14, -6, -8], lw, W);
    line(c, [3, -20, 9, -14, 6, -8], lw, W);
  } else {
    line(c, [-3, -16, -5, 0], lw, W);
    line(c, [3, -16, 5, 0], lw, W);
  }
  const lift = pose === 'jump' ? -8 : 0;
  const lean = pose === 'runA' || pose === 'runB' ? 0.22 : pose === 'look' ? 0.12 : 0;
  c.translate(0, lift - 16);
  c.rotate(lean);
  // Arms (behind the body first).
  if (pose === 'runA') {
    line(c, [-4, -16, -12, -10, -14, -3], lw, W);
    line(c, [4, -16, 12, -20, 18, -26], lw, W);
  } else if (pose === 'runB') {
    line(c, [-4, -16, -10, -22, -15, -28], lw, W);
    line(c, [4, -16, 11, -10, 16, -6], lw, W);
  } else if (pose === 'jump' || pose === 'cheer') {
    line(c, [-5, -17, -12, -27, -13, -36], lw, W);
    line(c, [5, -17, 12, -27, 13, -36], lw, W);
  } else if (pose === 'press') {
    line(c, [-5, -16, -9, -8, -8, -2], lw, W);
    line(c, [5, -16, 14, -9, 20, -2], lw, W);
  } else if (pose === 'look') {
    line(c, [-5, -16, -9, -8, -8, -2], lw, W);
    line(c, [5, -16, 13, -22, 6, -33], lw, W);
  } else {
    line(c, [-5, -16, -10, -8, -9, -1], lw, W);
    line(c, [5, -16, 10, -8, 9, -1], lw, W);
  }
  // Body.
  roundRect(c, -7.5, -21, 15, 21, 6);
  c.fillStyle = YEL;
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = INK;
  c.stroke();
  // Head: big, round, two dark eyes looking ahead.
  disc(c, 1, -31, 10.5, W);
  ring(c, 1, -31, 10.5, 2, INK);
  disc(c, 4, -32, 1.9, INK);
  disc(c, 9, -32, 1.9, INK);
  if (pose === 'cheer' || pose === 'jump') line(c, [3, -26.5, 6.5, -24.8, 10, -26.5], 1.8, INK);
  c.restore();
}

/** Footprint pair (top = forward). (x, y) centre, s = scale (≈ 26 units wide at s = 1). */
export function footprints(c: C2, x: number, y: number, s: number, col = WHITE): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(sx * 7, 6, 5, 9, sx * 0.08, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
    c.beginPath();
    c.ellipse(sx * 7.5, -7.5, 3.9, 3.4, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** A keyboard key cap with a letter (pictogram of the key, like the HUD's caps). */
export function keyCap(c: C2, x: number, y: number, s: number, label: string): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  roundRect(c, -22, -20, 44, 44, 9);
  c.fillStyle = GREY;
  c.fill();
  roundRect(c, -22, -24, 44, 40, 9);
  c.fillStyle = WHITE;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = INK;
  c.font = 'bold 30px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, 0, -3);
  c.restore();
}

/** A round gamepad face button with its letter. */
export function padButton(c: C2, x: number, y: number, s: number, label: string): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  disc(c, 0, 3, 23, GREY);
  disc(c, 0, 0, 23, WHITE);
  ring(c, 0, 0, 23, 3, INK);
  ring(c, 0, 0, 17, 2, GREY);
  c.fillStyle = INK;
  c.font = 'bold 28px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, 0, 1);
  c.restore();
}

/** A hand tapping (touch): finger down onto a ripple. */
export function tapHand(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.ellipse(0, 20, 20, 7, 0, 0, Math.PI * 2);
  c.lineWidth = 3.5;
  c.strokeStyle = YEL;
  c.stroke();
  c.beginPath();
  c.ellipse(0, 20, 11, 3.5, 0, 0, Math.PI * 2);
  c.stroke();
  hand(c, 0, 18, 0.95);
  c.restore();
}

export interface DemoKit {
  units: typeof units;
  panel: typeof panel;
  ground: typeof ground;
  hero: typeof hero;
  arrow: typeof arrow;
  gem: typeof gem;
  mark: typeof mark;
  sparkle: typeof sparkle;
  star: typeof star;
  check: typeof check;
  cross: typeof cross;
  arch: typeof arch;
  button: typeof button;
  hand: typeof hand;
  footprints: typeof footprints;
  line: typeof line;
  disc: typeof disc;
  ring: typeof ring;
  poly: typeof poly;
  roundRect: typeof roundRect;
  colors: { INK: string; WHITE: string; YEL: string; GREY: string; DARK: string };
}

export const DEMO_KIT: DemoKit = {
  units, panel, ground, hero, arrow, gem, mark, sparkle, star, check, cross, arch, button, hand, footprints, line, disc, ring, poly, roundRect,
  colors: { INK, WHITE, YEL, GREY, DARK },
};
