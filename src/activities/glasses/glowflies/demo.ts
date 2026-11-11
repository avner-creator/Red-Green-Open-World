/**
 * The glow-flies booth's demo flipbook (4 frames, generic: always the same fly and jar). Big and
 * simple, one idea per frame (the kit's `DEMO_RULE`): the hero runs at a glowing fly → jumps right
 * through it (sparkles) → the sparkles fly into the jar → cheer, ✓ and a glowing jar.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const GROUND = 95;
const FLY = { x: 64, y: 30 } as const;
const JAR = { x: 85, y: GROUND } as const;
const S = 0.8;

/** A glow-fly: a bright sparkle in a soft halo with two little wings. */
function fly(c: C2, k: DemoKit, x: number, y: number): void {
  c.beginPath();
  c.arc(x, y, 15, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,210,58,0.25)';
  c.fill();
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(x + s * 7, y - 6, 6.5, 3.6, s * -0.6, 0, Math.PI * 2);
    c.fillStyle = k.colors.WHITE;
    c.fill();
  }
  k.disc(c, x, y + 1, 5, k.colors.YEL);
  k.sparkle(c, x, y + 1, 10, k.colors.YEL);
}

/** The jar: glass outline with a lid; `beads` glowing beads inside. */
function jar(c: C2, k: DemoKit, beads: number, glow: boolean): void {
  const { x, y } = JAR;
  if (glow) {
    c.beginPath();
    c.arc(x, y - 15, 17, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,210,58,0.3)';
    c.fill();
  }
  k.roundRect(c, x - 10, y - 27, 20, 27, 5);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  k.roundRect(c, x - 8, y - 33, 16, 6, 2);
  c.fillStyle = k.colors.WHITE;
  c.fill();
  const spots = [
    [x - 4, y - 6],
    [x + 4, y - 6],
    [x, y - 14],
  ];
  for (let i = 0; i < Math.min(beads, spots.length); i++) k.disc(c, spots[i][0], spots[i][1], 3.6, k.colors.YEL);
}

export const GLOWFLIES_DEMO: BoothDemo = {
  frames: 4,
  fps: 1.8,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    k.ground(c, GROUND, 6, 94);
    // Two beads already in the jar; the catch adds the third.
    jar(c, k, f >= 2 ? 3 : 2, f >= 3);
    if (f === 0) {
      fly(c, k, FLY.x, FLY.y);
      k.hero(c, 24, GROUND, S, 'runA');
      k.arrow(c, 38, 52, 50, 42, 4, k.colors.WHITE);
    } else if (f === 1) {
      // Jumping right through it: a burst of sparkles round the hero's hands.
      k.hero(c, 56, GROUND - 16, S, 'jump');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        k.sparkle(c, FLY.x - 4 + Math.cos(a) * 15, FLY.y - 2 + Math.sin(a) * 12, i % 2 ? 4.5 : 6, i % 2 ? k.colors.WHITE : k.colors.YEL);
      }
    } else if (f === 2) {
      k.hero(c, 50, GROUND, S, 'stand');
      // Sparkles fly into the jar.
      for (const [x, y, r] of [[70, 40, 5], [77, 50, 6], [83, 58, 4.5]] as const) k.sparkle(c, x, y, r, k.colors.YEL);
    } else {
      k.hero(c, 46, GROUND, S, 'cheer');
      k.check(c, 20, 32, 14);
      k.sparkle(c, JAR.x - 2, JAR.y - 46, 5, k.colors.YEL);
    }
  },
};
