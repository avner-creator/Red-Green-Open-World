/**
 * The glow-flies booth's demo flipbook (5 frames, generic: always the same fly and jar). The hero
 * runs at a glowing fly → jumps right through it → it bursts into sparkles that fly to the jar →
 * the jar gets a glowing bead → cheer and ✓.
 */
import type { BoothDemo } from '../booth/types';
import type { DemoKit } from '../booth/draw';

type C2 = CanvasRenderingContext2D;

const GROUND = 84;
const FLY = { x: 56, y: 40 } as const;
const JAR = { x: 82, y: GROUND } as const;

/** A glow-fly: a bright sparkle in a soft halo with two little wings. */
function fly(c: C2, k: DemoKit, x: number, y: number): void {
  c.beginPath();
  c.arc(x, y, 11, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,210,58,0.22)';
  c.fill();
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(x + s * 5, y - 4, 4.5, 2.6, s * -0.6, 0, Math.PI * 2);
    c.fillStyle = k.colors.WHITE;
    c.fill();
  }
  k.disc(c, x, y + 1, 3.6, k.colors.YEL);
  k.sparkle(c, x, y + 1, 7.5, k.colors.YEL);
}

/** The jar: glass outline with a lid; `beads` glowing beads inside. */
function jar(c: C2, k: DemoKit, beads: number, glow: boolean): void {
  const { x, y } = JAR;
  if (glow) {
    c.beginPath();
    c.arc(x, y - 13, 16, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,210,58,0.25)';
    c.fill();
  }
  k.roundRect(c, x - 9, y - 24, 18, 24, 5);
  c.fillStyle = k.colors.DARK;
  c.fill();
  c.lineWidth = 2.6;
  c.strokeStyle = k.colors.WHITE;
  c.stroke();
  k.roundRect(c, x - 7, y - 29, 14, 5, 1.5);
  c.fillStyle = k.colors.WHITE;
  c.fill();
  const spots = [
    [x - 3.5, y - 5],
    [x + 3.5, y - 5],
    [x, y - 11],
  ];
  for (let i = 0; i < Math.min(beads, spots.length); i++) k.disc(c, spots[i][0], spots[i][1], 3.2, k.colors.YEL);
}

export const GLOWFLIES_DEMO: BoothDemo = {
  frames: 5,
  fps: 2.2,
  hold: 1.0,
  draw(c, f, size, k) {
    k.units(c, size);
    k.panel(c);
    k.ground(c, GROUND, 8, 92);
    // Two beads already in the jar; the catch adds the third.
    jar(c, k, f >= 3 ? 3 : 2, f >= 3);
    if (f === 0) {
      fly(c, k, FLY.x, FLY.y);
      k.hero(c, 18, GROUND, 0.62, 'runA');
    } else if (f === 1) {
      fly(c, k, FLY.x + 2, FLY.y - 2);
      k.hero(c, 34, GROUND, 0.62, 'runB');
      k.arrow(c, 40, 54, 50, 46, 3.2, k.colors.WHITE);
    } else if (f === 2) {
      // Jumping right through it: a burst of sparkles round the hero's head.
      k.hero(c, 52, GROUND - 14, 0.62, 'jump');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        k.sparkle(c, FLY.x + 2 + Math.cos(a) * 13, FLY.y - 4 + Math.sin(a) * 11, i % 2 ? 3 : 4.4, i % 2 ? k.colors.WHITE : k.colors.YEL);
      }
    } else if (f === 3) {
      k.hero(c, 60, GROUND, 0.62, 'stand');
      // Sparkles fly into the jar.
      for (const [x, y, r] of [[66, 40, 3.4], [72, 50, 4.2], [78, 58, 3]] as const) k.sparkle(c, x, y, r, k.colors.YEL);
    } else {
      k.hero(c, 60, GROUND, 0.62, 'cheer');
      k.check(c, 30, 40, 11);
      k.sparkle(c, JAR.x + 10, JAR.y - 34, 4, k.colors.YEL);
    }
  },
};
