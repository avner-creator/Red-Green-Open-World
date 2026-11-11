/**
 * The dot signs booth's demo flipbook (5 frames, generic: always a star, drawn once at boot, never
 * the current answer). Close-ups, one idea per frame, big enough to read from 8 m (`auditDemo`:
 * hero ≥ 33 units, ≤ 9 pictures a frame):
 *   0  a board full of dots
 *   1  a star pops out of the dots
 *   2  three big buttons: triangle, square, star — the star one shines
 *   3  the hero presses the star button
 *   4  the hero cheers: ✓
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const BOARD = { x: 10, y: 10, w: 80, h: 80 } as const;
const GROUND = 95;

/** Deterministic dot positions on the board (9 × 9, jittered). */
const DOTS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  let s = 12345;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 9; i++) out.push([BOARD.x + 6 + i * 8.5 + (rnd() - 0.5) * 3, BOARD.y + 6 + j * 8.5 + (rnd() - 0.5) * 3]);
  return out;
})();

/** Inside a 5-point star (centre cx, cy; outer r) — which dots light up. */
function inStar(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function board(c: C2, k: DemoKit, pop: boolean): void {
  k.roundRect(c, BOARD.x - 3, BOARD.y - 3, BOARD.w + 6, BOARD.h + 6, 5);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  for (const [x, y] of DOTS) {
    const lit = pop && inStar(x, y, 50, 53, 40);
    k.disc(c, x, y, lit ? 3.6 : 2.7, lit ? k.colors.YEL : k.colors.GREY);
  }
  if (pop) {
    k.sparkle(c, 84, 18, 7, k.colors.WHITE);
    k.sparkle(c, 16, 84, 5, k.colors.YEL);
  }
}

/** A big round button with a shape (0 triangle, 1 square, 2 star). */
function shapeButton(c: C2, k: DemoKit, x: number, y: number, r: number, shape: 0 | 1 | 2, lit: boolean, pressed = false): void {
  const yy = y + (pressed ? r * 0.12 : 0);
  k.disc(c, x, y + r * 0.22, r, k.colors.GREY);
  k.disc(c, x, yy, r, lit ? k.colors.YEL : k.colors.WHITE);
  k.disc(c, x, yy, r * 0.84, k.colors.INK);
  const col = lit ? k.colors.YEL : k.colors.WHITE;
  const s = r * 0.5;
  if (shape === 0) k.poly(c, [x, yy - s, x + s, yy + s * 0.75, x - s, yy + s * 0.75], col);
  else if (shape === 1) k.poly(c, [x - s * 0.8, yy - s * 0.8, x + s * 0.8, yy - s * 0.8, x + s * 0.8, yy + s * 0.8, x - s * 0.8, yy + s * 0.8], col);
  else k.star(c, x, yy + s * 0.05, s * 1.15, col, 0.45);
}

export const DOT_DEMO: BoothDemo = {
  frames: 5,
  fps: 1.8,
  hold: 1.2,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    if (f <= 1) {
      board(c, k, f === 1);
      return;
    }
    if (f === 2) {
      shapeButton(c, k, 21, 52, 14, 0, false);
      shapeButton(c, k, 50, 52, 14, 1, false);
      shapeButton(c, k, 79, 52, 14, 2, true);
      k.arrow(c, 79, 90, 79, 72, 4.5, k.colors.YEL);
      k.sparkle(c, 79, 26, 6, k.colors.YEL);
      return;
    }
    k.line(c, [8, GROUND, 92, GROUND], 3, k.colors.GREY);
    // Close-up: the star button on its console, right; the hero beside it.
    k.roundRect(c, 64, 72, 26, GROUND - 72, 3);
    c.fillStyle = k.colors.DARK;
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = k.colors.WHITE;
    c.stroke();
    shapeButton(c, k, 77, 64, 11, 2, true, f === 3);
    if (f === 3) k.hero(c, 55, GROUND, 0.76, 'press');
    else {
      k.hero(c, 42, GROUND, 0.78, 'cheer');
      k.check(c, 22, 30, 12);
      k.sparkle(c, 77, 40, 6, k.colors.YEL);
    }
  },
};
