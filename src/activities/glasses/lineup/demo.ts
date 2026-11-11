/**
 * The line-up booth's demo flipbook (6 frames, generic: always the same bubble and hoop, never the
 * current one). The hero stands on the pad looking up → a sparkly hoop slides over a soap bubble
 * → the hero presses → the bubble pops into sparkles → cheer and ✓.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const BUBBLE = { x: 64, y: 30, r: 10 } as const;
const HOOP_R = 15;
/** The hoop's path: start (left, lower), half way, on the bubble. */
const HOOP = [
  [32, 44],
  [48, 37],
  [BUBBLE.x, BUBBLE.y],
] as const;

/** A soap bubble: thin rim, a faint film, a highlight arc and a glint. */
function bubble(c: C2, k: DemoKit, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(251,248,240,0.16)';
  c.fill();
  k.ring(c, x, y, r, 2.4, k.colors.WHITE);
  c.beginPath();
  c.arc(x, y, r * 0.7, Math.PI * 1.05, Math.PI * 1.45);
  c.lineWidth = 2.2;
  c.strokeStyle = k.colors.WHITE;
  c.lineCap = 'round';
  c.stroke();
  k.disc(c, x + r * 0.42, y - r * 0.42, 1.6, k.colors.WHITE);
}

/** The magic hoop: a thick bright ring with sparkles on it (never a cross-hair). */
function hoop(c: C2, k: DemoKit, x: number, y: number): void {
  k.ring(c, x, y, HOOP_R, 4.2, k.colors.YEL);
  k.sparkle(c, x - HOOP_R * 0.72, y - HOOP_R * 0.72, 4.4, k.colors.YEL);
  k.sparkle(c, x + HOOP_R * 0.95, y + HOOP_R * 0.3, 3.2, k.colors.WHITE);
  k.sparkle(c, x + HOOP_R * 0.2, y + HOOP_R * 1.05, 2.6, k.colors.YEL);
}

/** The pad under the hero: a dark ellipse with a bright rim. */
function pad(c: C2, k: DemoKit): void {
  c.beginPath();
  c.ellipse(30, 88, 17, 5.5, 0, 0, Math.PI * 2);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2.6;
  c.strokeStyle = k.colors.YEL;
  c.stroke();
}

export const LINEUP_DEMO: BoothDemo = {
  frames: 6,
  fps: 2.2,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    pad(c, k);
    // The bubble (gone once popped).
    if (f <= 3) bubble(c, k, BUBBLE.x, BUBBLE.y, BUBBLE.r);
    else if (f === 4) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        k.sparkle(c, BUBBLE.x + Math.cos(a) * 15, BUBBLE.y + Math.sin(a) * 15, i % 2 ? 3.4 : 4.6, i % 2 ? k.colors.WHITE : k.colors.YEL);
      }
      k.star(c, BUBBLE.x, BUBBLE.y, 7, k.colors.WHITE, 0.45);
    }
    // The hoop slides onto the bubble (frames 0–2), then stays there.
    const h = HOOP[Math.min(2, f)];
    if (f <= 4) hoop(c, k, h[0], h[1]);
    if (f === 1) k.arrow(c, 30, 26, 46, 19, 3.4, k.colors.WHITE);
    // The hero on the pad.
    if (f <= 2) k.hero(c, 30, 88, 0.62, 'look');
    else if (f <= 4) {
      k.hero(c, 30, 88, 0.62, 'press');
      // The press: a button with a little burst under the hero's hand.
      k.button(c, 46, 86, 0.55, f === 3);
      if (f === 3) for (const [x0, y0, x1, y1] of [[38, 76, 34, 72], [54, 76, 58, 72]]) k.line(c, [x0, y0, x1, y1], 2.4, k.colors.YEL);
    } else {
      k.hero(c, 30, 88, 0.62, 'cheer');
      k.check(c, 66, 30, 11);
      k.gem(c, 84, 62, 0.9);
      k.sparkle(c, 50, 18, 4, k.colors.YEL);
    }
  },
};
