/**
 * The toys booth's demo flipbook (6 frames, generic: always the same little trail and the same
 * ball, never the current trail). Pip's basket with three empty places sits bottom-left; glowing
 * paw prints (each with a small magic-glasses mark: "seen through the glasses") wind away up the
 * picture. The hero follows them → at the last print a ball pops out of the ground → the hero
 * cheers (✓) and the ball arcs back → the ball is home in the basket, a gem.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

/** Paw prints along a path winding away (x, y, size): near and big at the basket, far and small. */
const PRINTS = [
  [45, 84, 1.3],
  [55, 71, 1.18],
  [61, 57, 1.06],
  [72, 47, 0.95],
  [76, 34, 0.85],
] as const;
const HOLE = { x: 88, y: 25 };
const BASKET = { x: 20, y: 84 };

/** A paw print on the ground: pad + four toes; toes point along (dx, dy). */
function paw(c: C2, k: DemoKit, x: number, y: number, s: number, dx: number, dy: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s * 0.78);
  c.rotate(Math.atan2(dx, -dy));
  c.beginPath();
  c.ellipse(0, 2, 3.9, 3.3, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  for (const [px, py] of [[-4.4, -2.6], [-1.6, -5.4], [1.6, -5.4], [4.4, -2.6]] as const) k.disc(c, px, py, 1.7, col);
  c.restore();
}

/** Pip's basket: a wicker tub with three places on top; `filled` = places with a toy. */
function basket(c: C2, k: DemoKit, filled: number, hop = 0): void {
  const { x } = BASKET;
  const y = BASKET.y - hop;
  for (let i = 0; i < 3; i++) {
    const px = x - 9 + i * 9;
    const py = y - 17;
    if (i < filled) {
      k.disc(c, px, py - 1.5, 4.6, k.colors.YEL);
      k.ring(c, px, py - 1.5, 4.6, 1.2, k.colors.INK);
      k.line(c, [px - 4.6, py - 1.5, px + 4.6, py - 1.5], 1.2, k.colors.INK);
    } else {
      k.disc(c, px, py, 4, k.colors.INK);
      k.ring(c, px, py, 4, 1.4, k.colors.WHITE);
    }
  }
  k.poly(c, [x - 16, y - 14, x + 16, y - 14, x + 12, y, x - 12, y], k.colors.WHITE, k.colors.INK, 1.8);
  k.line(c, [x - 17, y - 14, x + 17, y - 14], 3.4, k.colors.YEL);
  for (const dx of [-8, 0, 8]) k.line(c, [x + dx, y - 11.5, x + dx * 0.8, y - 2], 1.6, k.colors.GREY);
}

function ball(c: C2, k: DemoKit, x: number, y: number, r = 5): void {
  k.disc(c, x, y, r, k.colors.YEL);
  k.ring(c, x, y, r, 1.2, k.colors.INK);
  k.line(c, [x - r, y, x + r, y], 1.2, k.colors.INK);
}

export const TOYS_DEMO: BoothDemo = {
  frames: 6,
  fps: 2.0,
  hold: 1.1,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    // The trail: glowing prints (yellow) with a small glasses mark; passed ones go grey.
    const passed = [0, 2, 4, 5, 5, 5][f] ?? 5;
    PRINTS.forEach(([x, y, s], i) => {
      const nx = PRINTS[Math.min(PRINTS.length - 1, i + 1)];
      const dx = i < PRINTS.length - 1 ? nx[0] - x : HOLE.x - x;
      const dy = i < PRINTS.length - 1 ? nx[1] - y : HOLE.y - y;
      const done = i < passed;
      paw(c, k, x, y, s, dx, dy, done ? k.colors.GREY : k.colors.YEL);
      if (!done) k.mark(c, x + 9 * s, y - 5 * s, 3.4 * s);
    });
    // The hidden spot: a little mound at the end of the trail.
    k.poly(c, [HOLE.x - 7, HOLE.y + 3, HOLE.x, HOLE.y - 1.5, HOLE.x + 7, HOLE.y + 3], k.colors.GREY);
    if (f === 0) {
      basket(c, k, 0);
      k.hero(c, 38, 93, 0.5, 'stand');
      k.arrow(c, 30, 56, 44, 44, 3.4, k.colors.WHITE);
    } else if (f === 1) {
      basket(c, k, 0);
      k.hero(c, 55, 76, 0.47, 'runA');
    } else if (f === 2) {
      basket(c, k, 0);
      k.hero(c, 70, 50, 0.43, 'runB');
    } else if (f === 3) {
      // The ball pops out of the ground at the last print.
      basket(c, k, 0);
      k.hero(c, 74, 38, 0.4, 'look');
      k.star(c, HOLE.x, HOLE.y - 2, 10, k.colors.WHITE, 0.5);
      ball(c, k, HOLE.x, HOLE.y - 15, 5.4);
      k.sparkle(c, HOLE.x - 9, HOLE.y - 24, 3.2, k.colors.YEL);
      k.sparkle(c, HOLE.x + 6, HOLE.y - 27, 2.6, k.colors.WHITE);
    } else if (f === 4) {
      // Cheer: ✓, the ball arcs back home to the basket.
      basket(c, k, 0);
      k.hero(c, 74, 38, 0.4, 'cheer');
      k.check(c, 89, 13, 7);
      c.beginPath();
      c.moveTo(84, 18);
      c.quadraticCurveTo(46, -6, 20, 62);
      c.setLineDash([3, 3]);
      c.lineWidth = 2;
      c.strokeStyle = k.colors.WHITE;
      c.stroke();
      c.setLineDash([]);
      ball(c, k, 44, 16, 5);
    } else {
      // Home: the ball sits in its place, sparkles, a gem for the hero.
      basket(c, k, 1, 2);
      k.hero(c, 46, 92, 0.5, 'cheer');
      k.sparkle(c, 9, 56, 3.8, k.colors.YEL);
      k.sparkle(c, 33, 54, 3, k.colors.WHITE);
      k.gem(c, 64, 30, 1.6);
    }
  },
};
