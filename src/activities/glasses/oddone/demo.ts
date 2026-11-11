/**
 * The odd one out booth's demo flipbook (5 frames, generic: always the same three pictures, drawn
 * once at boot, never the current answer). Close-ups, one idea per frame, big enough to read from
 * 8 m (`auditDemo`: hero ≥ 33 units, ≤ 9 pictures a frame):
 *   0  three round pictures, each with the little magic-glasses mark: circle, circle, triangle
 *   1  the different one (the triangle) shines
 *   2  the hero runs to the button under the triangle
 *   3  the hero presses it
 *   4  the hero cheers: ✓
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

/** One round picture (dark panel, bright rim) with a circle or a triangle and the glasses mark. */
function picture(c: C2, k: DemoKit, x: number, y: number, r: number, tri: boolean, lit: boolean): void {
  k.disc(c, x, y, r, lit ? k.colors.YEL : k.colors.WHITE);
  k.disc(c, x, y, r * 0.84, k.colors.INK);
  const col = lit ? k.colors.YEL : k.colors.WHITE;
  if (tri) k.poly(c, [x, y - r * 0.56, x + r * 0.56, y + r * 0.4, x - r * 0.56, y + r * 0.4], col);
  else k.disc(c, x, y, r * 0.48, col);
  k.mark(c, x + r * 0.78, y - r * 0.78, r * 0.36);
}

const GROUND = 95;

/** The triangle's pedestal and its button (close-up, right side). */
function pedestal(c: C2, k: DemoKit, pressed: boolean): void {
  k.line(c, [76, 40, 76, 72], 3.5, k.colors.GREY);
  k.roundRect(c, 64, 76, 24, GROUND - 76, 3);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  k.button(c, 76, 76, 0.62, pressed);
}

export const ODD_DEMO: BoothDemo = {
  frames: 5,
  fps: 1.8,
  hold: 1.2,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    if (f <= 1) {
      // Close-up: two alike, one different (it shines in frame 1).
      picture(c, k, 21, 50, 15, false, false);
      picture(c, k, 50, 50, 15, false, false);
      picture(c, k, 79, 50, 15, true, f === 1);
      if (f === 1) {
        k.sparkle(c, 79, 25, 6, k.colors.YEL);
        k.arrow(c, 79, 90, 79, 72, 4.5, k.colors.YEL);
      }
      return;
    }
    k.line(c, [8, GROUND, 92, GROUND], 3, k.colors.GREY);
    picture(c, k, 76, 24, 15, true, true);
    pedestal(c, k, f >= 3);
    if (f === 2) k.hero(c, 34, GROUND, 0.76, 'runA');
    else if (f === 3) k.hero(c, 54, GROUND, 0.76, 'press');
    else {
      k.hero(c, 42, GROUND, 0.78, 'cheer');
      k.check(c, 22, 30, 12);
    }
  },
};
