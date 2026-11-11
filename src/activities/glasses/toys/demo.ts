/**
 * The toys booth's demo flipbook (6 close-up frames, one idea each; generic: always the same
 * prints and the same ball, never the current trail). A big hero beside big glowing paw prints
 * under the magic-glasses mark ("seen through the glasses") → runs along them → at the last one
 * the ground bulges → a ball pops out with a star burst → the hero cheers (✓) → the ball is home in
 * Pip's basket and the hero gets a gem. Passes `auditDemo` (hero ≥ 33 units, ≤ 9 pictures).
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const GROUND = 90;
/** Three big paw prints on the ground, left to right (x, y). */
const PRINTS = [
  [44, 88],
  [63, 84],
  [82, 88],
] as const;

/** A big paw print: pad + four toes, toes pointing right (the way to go). */
function paw(c: C2, k: DemoKit, x: number, y: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.scale(1, 0.62);
  c.beginPath();
  c.ellipse(-1.5, 0, 6, 6.6, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  for (const [px, py] of [[5, -8], [8.5, -2.8], [8.5, 2.8], [5, 8]] as const) k.disc(c, px, py, 2.7, col);
  c.restore();
}

function ball(c: C2, k: DemoKit, x: number, y: number, r: number): void {
  k.disc(c, x, y, r, k.colors.YEL);
  k.ring(c, x, y, r, 2, k.colors.INK);
  k.line(c, [x - r, y, x + r, y], 2, k.colors.INK);
  k.line(c, [x, y - r, x, y + r], 2, k.colors.INK);
}

/** Pip's basket (a wicker tub) with `n` balls in it. */
function basket(c: C2, k: DemoKit, x: number, filled: boolean): void {
  const y = GROUND;
  if (filled) ball(c, k, x, y - 24, 8);
  k.poly(c, [x - 20, y - 20, x + 20, y - 20, x + 15, y, x - 15, y], k.colors.WHITE, k.colors.INK, 2.4);
  k.line(c, [x - 21, y - 20, x + 21, y - 20], 4.5, k.colors.YEL);
  for (const dx of [-9, 0, 9]) k.line(c, [x + dx, y - 16, x + dx * 0.8, y - 3], 2.2, k.colors.GREY);
}

export const TOYS_DEMO: BoothDemo = {
  frames: 6,
  fps: 1.8,
  hold: 1.1,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    k.ground(c, GROUND + 3, 8, 92);
    if (f <= 2) {
      // Glowing prints (passed ones grey) under the magic-glasses mark.
      const passed = f;
      PRINTS.forEach(([x, y], i) => paw(c, k, x, y, i < passed ? k.colors.GREY : k.colors.YEL));
      k.mark(c, 66, 20, 12);
      if (f === 0) {
        k.hero(c, 22, GROUND + 2, 0.8, 'stand');
        k.arrow(c, 36, 66, 58, 66, 4.5, k.colors.YEL);
      } else if (f === 1) {
        k.hero(c, 46, GROUND + 2, 0.76, 'runA');
      } else {
        k.hero(c, 66, GROUND + 2, 0.76, 'runB');
      }
      return;
    }
    if (f === 3) {
      // At the last print the toy bursts out of the ground.
      k.hero(c, 26, GROUND + 2, 0.78, 'look');
      k.star(c, 70, 66, 22, k.colors.WHITE, 0.5);
      ball(c, k, 70, 50, 11);
      k.poly(c, [56, GROUND, 70, GROUND - 8, 84, GROUND], k.colors.GREY);
      k.sparkle(c, 88, 30, 6, k.colors.YEL);
      return;
    }
    if (f === 4) {
      // Found it: cheer, ✓.
      k.hero(c, 34, GROUND + 2, 0.8, 'cheer');
      ball(c, k, 70, 44, 11);
      k.check(c, 72, 16, 11);
      k.sparkle(c, 88, 54, 5, k.colors.YEL);
      k.sparkle(c, 54, 26, 4, k.colors.WHITE);
      return;
    }
    // Home: the ball is in Pip's basket, a gem for the hero.
    basket(c, k, 28, true);
    k.hero(c, 68, GROUND + 2, 0.8, 'cheer');
    k.gem(c, 44, 30, 1.7);
    k.sparkle(c, 12, 52, 5, k.colors.YEL);
  },
};
