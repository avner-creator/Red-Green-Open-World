/**
 * The gates booth's demo flipbook (6 frames, generic: always the same star, never the current
 * answer). The hero looks at a sign showing half a star on each side → the halves slide together
 * into a whole star → the arch with the star lights up → the hero runs through it → cheers.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const ARCHES = [22, 50, 78] as const;
const BASE = 74;

/** A plaque shape on top of an arch (0: disc, 1: triangle, 2: star). */
function plaque(c: C2, k: DemoKit, i: number, lit: boolean): void {
  const x = ARCHES[i];
  const y = 37;
  k.disc(c, x, y, 8.5, lit ? k.colors.YEL : k.colors.DARK);
  k.ring(c, x, y, 8.5, 2, k.colors.WHITE);
  const col = lit ? k.colors.INK : k.colors.WHITE;
  if (i === 0) k.disc(c, x, y, 4.2, col);
  else if (i === 1) k.poly(c, [x, y - 5, x + 5, y + 4, x - 5, y + 4], col);
  else k.star(c, x, y + 0.5, 6, col, 0.45);
}

/** Half (or whole) star on the little sign: `gap` = distance each half is pushed out. */
function signStar(c: C2, k: DemoKit, gap: number, whole: boolean): void {
  k.roundRect(c, 28, 4, 44, 26, 4);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2.6;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  const cx = 50;
  const cy = 17.5;
  for (const side of [-1, 1]) {
    c.save();
    c.beginPath();
    if (side < 0) c.rect(0, 0, cx, 40);
    else c.rect(cx, 0, 50, 40);
    c.clip();
    c.translate(side * gap, 0);
    k.star(c, cx, cy, 10.5, whole ? k.colors.YEL : k.colors.WHITE, 0.45);
    c.restore();
  }
  if (whole) {
    k.sparkle(c, 66, 9, 4.2, k.colors.YEL);
    k.sparkle(c, 33, 25, 3, k.colors.WHITE);
  }
}

export const GATES_DEMO: BoothDemo = {
  frames: 6,
  fps: 2.2,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    k.line(c, [8, BASE, 92, BASE], 3, k.colors.GREY);
    const lit = f >= 2;
    ARCHES.forEach((x, i) => {
      k.arch(c, x, BASE, 17, 30, lit && i === 2 ? k.colors.YEL : k.colors.WHITE, 4.2);
      plaque(c, k, i, lit && i === 2);
    });
    signStar(c, k, f === 0 ? 7 : f === 1 ? 3 : 0, f >= 2);
    if (f <= 1) {
      k.hero(c, 50, 95, 0.46, 'look');
      // Little "looking" rays from the hero up to the sign.
      k.line(c, [55, 64, 58, 36], 2.2, k.colors.YEL);
      k.line(c, [45, 64, 42, 36], 2.2, k.colors.YEL);
    } else if (f === 2) {
      k.hero(c, 50, 95, 0.46, 'stand');
      k.arrow(c, 58, 86, 72, 80, 3.6, k.colors.YEL);
    } else if (f === 3) {
      k.hero(c, 66, 92, 0.46, 'runA');
    } else if (f === 4) {
      k.hero(c, 78, BASE + 2, 0.42, 'runB');
    } else {
      k.hero(c, 78, BASE + 2, 0.42, 'cheer');
      k.check(c, 90, 52, 7);
      k.sparkle(c, 64, 50, 4, k.colors.YEL);
      k.sparkle(c, 92, 30, 3.4, k.colors.WHITE);
    }
  },
};
