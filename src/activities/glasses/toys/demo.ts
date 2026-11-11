/**
 * The toys booth's demo flipbook (6 frames, generic: always the same little trail and the same
 * ball, never the current trail). The hero stands at the basket with three empty places → follows
 * glowing paw prints (each with a small magic-glasses mark: "seen through the glasses") → at the
 * last print a ball pops out of the ground → the hero cheers (✓) and the ball flies back → the ball
 * is in the basket.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const GROUND = 80;
/** Paw prints along the ground, left to right (x, y, tilt). */
const PRINTS = [
  [36, 84, -0.25],
  [48, 79, 0.2],
  [60, 84, -0.2],
  [72, 79, 0.25],
] as const;
const HOLE = { x: 86, y: 82 };

/** A paw print: pad + four toes (top = the way it walks: to the right). */
function paw(c: C2, k: DemoKit, x: number, y: number, tilt: number, col: string, s = 1): void {
  c.save();
  c.translate(x, y);
  c.rotate(Math.PI / 2 + tilt);
  c.scale(s, s * 0.55);
  c.beginPath();
  c.ellipse(0, 2.2, 3.6, 3.1, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  for (const [px, py] of [[-4, -2.2], [-1.5, -4.6], [1.5, -4.6], [4, -2.2]] as const) k.disc(c, px, py, 1.5, col);
  c.restore();
}

/** Pip's basket (left): a wicker bowl with three places; `filled` = places with a toy in them. */
function basket(c: C2, k: DemoKit, filled: number, hop = 0): void {
  const x = 15;
  const y = GROUND - hop;
  // Three places: rings above the rim (dark hollow, white ring), the first one maybe filled.
  for (let i = 0; i < 3; i++) {
    const px = x - 7 + i * 7;
    const py = y - 13;
    if (i < filled) {
      k.disc(c, px, py - 1, 3.6, k.colors.YEL);
      k.ring(c, px, py - 1, 3.6, 1, k.colors.INK);
    } else {
      k.disc(c, px, py, 3.1, k.colors.INK);
      k.ring(c, px, py, 3.1, 1.1, k.colors.WHITE);
    }
  }
  // Bowl: wide trapezoid with a rim and weave lines.
  k.poly(c, [x - 13, y - 11, x + 13, y - 11, x + 10, y, x - 10, y], k.colors.WHITE, k.colors.INK, 1.6);
  k.line(c, [x - 14, y - 11, x + 14, y - 11], 3, k.colors.YEL);
  for (const dx of [-6, 0, 6]) k.line(c, [x + dx, y - 9, x + dx * 0.85, y - 1.5], 1.4, k.colors.GREY);
}

/** A small magic-glasses mark over a glowing print. */
function seen(c: C2, k: DemoKit, x: number, y: number, r = 3.4): void {
  k.mark(c, x, y - 10, r);
}

export const TOYS_DEMO: BoothDemo = {
  frames: 6,
  fps: 2.0,
  hold: 1.1,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    k.ground(c, GROUND + 6, 6, 94);
    // The trail: glowing prints (yellow), each with a small glasses mark; passed ones go grey.
    const passedCount = [0, 1, 3, 4, 4, 4][f] ?? 4;
    PRINTS.forEach(([x, y, t], i) => {
      const passed = i < passedCount;
      paw(c, k, x, y, t, passed ? k.colors.GREY : k.colors.YEL, 1.05);
      if (!passed) seen(c, k, x, y);
    });
    const ball = (x: number, y: number, r = 4.2): void => {
      k.disc(c, x, y, r, k.colors.YEL);
      k.ring(c, x, y, r, 1.1, k.colors.INK);
      k.line(c, [x - r, y, x + r, y], 1, k.colors.INK);
    };
    if (f === 0) {
      basket(c, k, 0);
      k.hero(c, 30, GROUND + 4, 0.42, 'stand');
      k.arrow(c, 40, 66, 58, 66, 3.2, k.colors.YEL);
    } else if (f === 1) {
      basket(c, k, 0);
      k.hero(c, 50, GROUND + 3, 0.42, 'runA');
    } else if (f === 2) {
      basket(c, k, 0);
      k.hero(c, 70, GROUND + 3, 0.42, 'runB');
    } else if (f === 3) {
      // The ball pops out of the ground at the last print.
      basket(c, k, 0);
      k.hero(c, 74, GROUND + 4, 0.42, 'look');
      k.star(c, HOLE.x, HOLE.y - 2, 9, k.colors.WHITE, 0.5);
      ball(HOLE.x, HOLE.y - 16, 5);
      k.sparkle(c, HOLE.x - 9, HOLE.y - 26, 3, k.colors.YEL);
      k.sparkle(c, HOLE.x + 7, HOLE.y - 30, 2.6, k.colors.WHITE);
    } else if (f === 4) {
      // Cheer: ✓, the ball arcs back to the basket.
      basket(c, k, 0);
      k.hero(c, 76, GROUND + 4, 0.42, 'cheer');
      k.check(c, 88, 46, 6.5);
      c.beginPath();
      c.moveTo(80, 50);
      c.quadraticCurveTo(50, 8, 22, 52);
      c.setLineDash([3, 3]);
      c.lineWidth = 1.8;
      c.strokeStyle = k.colors.WHITE;
      c.stroke();
      c.setLineDash([]);
      ball(50, 29, 4.5);
    } else {
      // Home: the ball is in the basket, sparkles, a gem.
      basket(c, k, 1, 2);
      k.hero(c, 40, GROUND + 4, 0.42, 'cheer');
      k.sparkle(c, 8, 52, 3.6, k.colors.YEL);
      k.sparkle(c, 26, 50, 2.8, k.colors.WHITE);
      k.gem(c, 58, 40, 1.2);
    }
  },
};
