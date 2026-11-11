/**
 * The line-up booth's demo flipbook (5 frames, generic: always the same bubble and hoop, never the
 * current one). Big and simple, one idea per frame (the kit's `DEMO_RULE`): the hero on the pad
 * looks up at a soap bubble → a sparkly hoop slides over it → the hero presses the button → the
 * bubble pops into sparkles → cheer, ✓ and a gem.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const BUBBLE = { x: 68, y: 30, r: 13 } as const;
const HOOP_R = 18;
/** The hoop's path: start (left), half way, on the bubble. */
const HOOP = [
  [36, 24],
  [52, 27],
  [BUBBLE.x, BUBBLE.y],
] as const;
const HERO = { x: 27, feet: 95, s: 0.8 } as const;

/** A soap bubble: a bright rim, a faint film, a highlight arc and a glint. */
function bubble(c: C2, k: DemoKit): void {
  const { x, y, r } = BUBBLE;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(251,248,240,0.18)';
  c.fill();
  k.ring(c, x, y, r, 3, k.colors.WHITE);
  c.beginPath();
  c.arc(x, y, r * 0.68, Math.PI * 1.05, Math.PI * 1.45);
  c.lineWidth = 3;
  c.strokeStyle = k.colors.WHITE;
  c.lineCap = 'round';
  c.stroke();
  k.disc(c, x + r * 0.42, y - r * 0.42, 2.2, k.colors.WHITE);
}

/** The magic hoop: a thick bright ring with two sparkles on it (never a cross-hair). */
function hoop(c: C2, k: DemoKit, x: number, y: number): void {
  k.ring(c, x, y, HOOP_R, 5, k.colors.YEL);
  k.sparkle(c, x - HOOP_R * 0.72, y - HOOP_R * 0.72, 5.5, k.colors.YEL);
  k.sparkle(c, x + HOOP_R * 0.9, y + HOOP_R * 0.45, 4.2, k.colors.WHITE);
}

/** The pad under the hero: a dark ellipse with a bright rim. */
function pad(c: C2, k: DemoKit): void {
  c.beginPath();
  c.ellipse(HERO.x, HERO.feet - 1, 20, 5, 0, 0, Math.PI * 2);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = k.colors.YEL;
  c.stroke();
}

export const LINEUP_DEMO: BoothDemo = {
  frames: 5,
  fps: 2.0,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    pad(c, k);
    if (f <= 2) bubble(c, k);
    if (f <= 2) hoop(c, k, HOOP[f][0], HOOP[f][1]);
    if (f === 1) k.arrow(c, 40, 50, 56, 46, 4, k.colors.WHITE);
    if (f === 0 || f === 1) k.hero(c, HERO.x, HERO.feet, HERO.s, 'look');
    else if (f === 2) {
      k.hero(c, HERO.x, HERO.feet, HERO.s, 'press');
      k.button(c, 52, 90, 0.8, true);
    } else if (f === 3) {
      // Pop! Sparkles where the bubble was.
      k.hero(c, HERO.x, HERO.feet, HERO.s, 'press');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        k.sparkle(c, BUBBLE.x + Math.cos(a) * 16, BUBBLE.y + Math.sin(a) * 16, i % 2 ? 4.5 : 6, i % 2 ? k.colors.WHITE : k.colors.YEL);
      }
    } else {
      k.hero(c, HERO.x, HERO.feet, HERO.s, 'cheer');
      k.check(c, 70, 34, 15);
      k.gem(c, 78, 76, 1.3);
    }
  },
};
