/**
 * The dot signs booth's demo flipbook (5 frames, generic: always a star, drawn once at boot, never
 * the current answer). The hero looks at a board full of dots → a star pops out of the dots → the
 * hero walks to the button with the star (the others show a circle and a triangle) → presses it →
 * ✓ and a cheer.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const BOARD = { x: 22, y: 7, w: 56, h: 40 } as const;
const BASE = 82;
/** Button centres (x) on the counter; the star is on the right-hand one. */
const BTN = [26, 50, 74] as const;
const STAR_BTN = 2;

/** Deterministic dot positions on the board. */
const DOTS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  let s = 12345;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let j = 0; j < 7; j++)
    for (let i = 0; i < 10; i++) out.push([BOARD.x + 4 + i * 5.3 + (rnd() - 0.5) * 2.4, BOARD.y + 4.5 + j * 5.3 + (rnd() - 0.5) * 2.4]);
  return out;
})();

/** Inside a 5-point star (centre cx, cy; outer r) — for which dots light up. */
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

function board(c: C2, k: DemoKit, pop: number): void {
  k.roundRect(c, BOARD.x - 2.5, BOARD.y - 2.5, BOARD.w + 5, BOARD.h + 5, 4);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2.6;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  const cx = BOARD.x + BOARD.w / 2;
  const cy = BOARD.y + BOARD.h / 2 + 1;
  for (const [x, y] of DOTS) {
    const lit = pop > 0 && inStar(x, y, cx, cy, 19);
    k.disc(c, x, y, lit ? 2.1 + 0.4 * pop : 1.7, lit ? k.colors.YEL : k.colors.GREY);
  }
  if (pop > 1) {
    k.sparkle(c, cx + 22, cy - 13, 3.6, k.colors.YEL);
    k.sparkle(c, cx - 23, cy + 12, 2.8, k.colors.WHITE);
  }
}

function counter(c: C2, k: DemoKit, pressed: boolean, lit: boolean): void {
  k.roundRect(c, 12, BASE - 14, 76, 14, 3);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  BTN.forEach((x, i) => {
    const on = lit && i === STAR_BTN;
    k.disc(c, x, BASE - 19, 7.5, on ? k.colors.YEL : k.colors.WHITE);
    k.disc(c, x, BASE - 19, 6, k.colors.INK);
    const y = BASE - 19 + (pressed && i === STAR_BTN ? 1.2 : 0);
    const col = on ? k.colors.YEL : k.colors.WHITE;
    if (i === 0) k.disc(c, x, y, 3.4, col);
    else if (i === 1) k.poly(c, [x, y - 3.8, x + 3.8, y + 2.8, x - 3.8, y + 2.8], col);
    else k.star(c, x, y + 0.3, 4.3, col, 0.45);
  });
}

export const DOT_DEMO: BoothDemo = {
  frames: 5,
  fps: 2.2,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    board(c, k, f === 0 ? 0 : f === 1 ? 1 : 2);
    counter(c, k, f >= 3, f >= 2);
    k.line(c, [8, BASE + 8, 92, BASE + 8], 2.6, k.colors.GREY);
    const S = 0.42;
    if (f <= 1) {
      k.hero(c, 50, BASE + 9, S, 'look');
      k.line(c, [46, 61, 40, 50], 2, k.colors.YEL);
      k.line(c, [55, 61, 61, 50], 2, k.colors.YEL);
    } else if (f === 2) {
      k.hero(c, 60, BASE + 9, S, 'runA');
      k.arrow(c, 66, 92, 80, 92, 3, k.colors.YEL);
    } else if (f === 3) {
      k.hero(c, 66, BASE + 9, S, 'press');
    } else {
      k.hero(c, 64, BASE + 9, S, 'cheer');
      k.check(c, 86, 56, 7);
    }
  },
};
