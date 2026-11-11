/**
 * The odd one out booth's demo flipbook (5 frames, generic: always the same three pictures, drawn
 * once at boot, never the current answer). Three pictures on posts, each with the little
 * magic-glasses mark ("seen through the magic glasses"): two circles and a triangle. The hero looks
 * → the different one shines → the hero runs to its button → presses it → ✓ and a cheer.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

/** Post centres (x) and the panel centre height. */
const POSTS = [20, 50, 80] as const;
const PANEL_Y = 28;
const BASE = 80;
/** The different one in the demo (always the right-hand post). */
const ODD_POST = 2;

function picture(c: C2, k: DemoKit, i: number, lit: boolean): void {
  const x = POSTS[i];
  // Post and pedestal with its button.
  k.line(c, [x, PANEL_Y + 11, x, BASE - 12], 2.6, k.colors.GREY);
  k.roundRect(c, x - 7, BASE - 12, 14, 12, 2.5);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  // The round dark panel with a bright rim (yellow when it shines).
  k.disc(c, x, PANEL_Y, 11.5, lit ? k.colors.YEL : k.colors.WHITE);
  k.disc(c, x, PANEL_Y, 9.6, k.colors.INK);
  const col = lit ? k.colors.YEL : k.colors.WHITE;
  if (i === ODD_POST) k.poly(c, [x, PANEL_Y - 6.5, x + 6.5, PANEL_Y + 4.5, x - 6.5, PANEL_Y + 4.5], col);
  else k.disc(c, x, PANEL_Y, 5.6, col);
  // The magic-glasses mark on each picture.
  k.mark(c, x + 9.5, PANEL_Y - 9.5, 4.6);
}

function button(c: C2, k: DemoKit, i: number, pressed: boolean): void {
  k.button(c, POSTS[i], BASE - 12, 0.32, pressed);
}

export const ODD_DEMO: BoothDemo = {
  frames: 5,
  fps: 2.2,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    k.line(c, [8, BASE, 92, BASE], 3, k.colors.GREY);
    const lit = f >= 1;
    for (let i = 0; i < 3; i++) {
      picture(c, k, i, lit && i === ODD_POST);
      button(c, k, i, f >= 3 && i === ODD_POST);
    }
    if (lit) {
      k.sparkle(c, POSTS[ODD_POST] - 13, PANEL_Y - 9, 3.6, k.colors.YEL);
      k.sparkle(c, POSTS[ODD_POST] + 13, PANEL_Y + 10, 2.8, k.colors.WHITE);
    }
    const S = 0.5;
    if (f === 0) {
      k.hero(c, 50, BASE + 1, S, 'look');
      // "Looking" rays from the hero up to the pictures.
      k.line(c, [45, 50, 28, 42], 2, k.colors.YEL);
      k.line(c, [56, 50, 72, 42], 2, k.colors.YEL);
    } else if (f === 1) {
      k.hero(c, 50, BASE + 1, S, 'look');
      k.arrow(c, 52, 91, 72, 91, 3.4, k.colors.YEL);
    } else if (f === 2) {
      k.hero(c, 61, BASE + 1, S, 'runA');
    } else if (f === 3) {
      k.hero(c, 70, BASE + 1, S, 'press');
    } else {
      k.hero(c, 68, BASE + 1, S, 'cheer');
      k.check(c, 88, 52, 7);
      k.sparkle(c, 54, 46, 3.4, k.colors.YEL);
    }
  },
};
