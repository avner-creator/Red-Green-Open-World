/**
 * The gates booth's demo flipbook (6 frames, generic: always the same star, never the current
 * answer). Close-ups, one idea per frame, big enough to read from 8 m:
 *   0  half a star on the left + half a star on the right, far apart
 *   1  the halves slide together
 *   2  one whole, glowing star
 *   3  the arch with that same star lights up; the hero stands in front of it
 *   4  the hero runs through the arch
 *   5  the hero cheers: ✓
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

/** Half (`side` −1 left, +1 right) of a star at (cx, cy), pushed out by `gap`. */
function half(c: C2, k: DemoKit, cx: number, cy: number, r: number, side: -1 | 1, gap: number, col: string): void {
  c.save();
  c.beginPath();
  if (side < 0) c.rect(0, 0, cx, 100);
  else c.rect(cx, 0, 100 - cx, 100);
  c.clip();
  c.translate(side * gap, 0);
  k.star(c, cx, cy, r, col, 0.46);
  c.restore();
}

/** The arch with the star plaque on top (lit = yellow). */
function starArch(c: C2, k: DemoKit, lit: boolean): void {
  k.arch(c, 50, 92, 46, 62, lit ? k.colors.YEL : k.colors.WHITE, 7);
  k.disc(c, 50, 22, 13, lit ? k.colors.YEL : k.colors.DARK);
  k.ring(c, 50, 22, 13, 2.6, k.colors.WHITE);
  k.star(c, 50, 23, 10, lit ? k.colors.INK : k.colors.WHITE, 0.46);
}

export const GATES_DEMO: BoothDemo = {
  frames: 6,
  fps: 1.8,
  hold: 1.2,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    if (f <= 2) {
      // Close-up: half + half → one whole star.
      const gap = f === 0 ? 14 : f === 1 ? 5 : 0;
      const col = f === 2 ? k.colors.YEL : k.colors.WHITE;
      half(c, k, 50, 52, 33, -1, gap, col);
      half(c, k, 50, 52, 33, 1, gap, col);
      if (f === 0) {
        k.arrow(c, 14, 88, 30, 88, 4.5, k.colors.YEL);
        k.arrow(c, 86, 88, 70, 88, 4.5, k.colors.YEL);
      }
      if (f === 2) {
        k.sparkle(c, 20, 20, 8, k.colors.WHITE);
        k.sparkle(c, 82, 82, 6, k.colors.YEL);
      }
      return;
    }
    k.line(c, [8, 92, 92, 92], 3, k.colors.GREY);
    starArch(c, k, true);
    if (f === 3) k.hero(c, 50, 92, 0.78, 'stand');
    else if (f === 4) k.hero(c, 50, 90, 0.76, 'runA');
    else {
      k.hero(c, 50, 92, 0.78, 'cheer');
      k.check(c, 82, 52, 12);
    }
  },
};
