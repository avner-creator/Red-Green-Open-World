/**
 * The shared booth atlas (browser only; layout in ./cells.ts). Built once by the framework; each
 * booth's demo frames are drawn into its site slot when the mini-game adopts the kit (all at
 * boot, so the texture is uploaded once).
 */
import * as THREE from 'three';
import {
  BCELL, BOOTH_ATLAS, cellPx, countCell, DEMO_MAX_FRAMES, demoCell, KIT_CELL, PROMPTS, promptCell, quarterPx, SWATCH_ORDER, SWATCHES, swatchPx,
} from './cells';
import type { PromptId } from './cells';
import {
  arch, arrow, BERRY, button, check, cross, DARK, DEMO_KIT, disc, footprints, gem, GREY, hand, hero, INK, keyCap, line, mark, padButton, panel,
  poly, ring, roundRect, sparkle, star, tapHand, units, WHITE, YEL,
} from './draw';
import type { BoothDemo } from './types';

type C2 = CanvasRenderingContext2D;

/** Run `fn` in a cell (or any px rect) with the origin at its corner, clipped, in 100 units. */
function inRect(c: C2, rect: readonly number[], fn: (c: C2) => void): void {
  const [x, y, w, h] = rect;
  c.save();
  c.clearRect(x, y, w, h);
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(x, y);
  units(c, w);
  fn(c);
  c.restore();
}

function stripes(c: C2): void {
  c.fillStyle = '#fbf4e2';
  c.fillRect(0, 0, 100, 100);
  c.fillStyle = BERRY;
  // Diagonal bands that tile across the cell edges (a candy-cane helix on a pole).
  for (let k = -2; k < 4; k++) {
    const o = k * 50;
    poly(c, [o, 0, o + 25, 0, o + 25 + 100, 100, o + 100, 100], BERRY);
  }
}

function padPress(c: C2): void {
  disc(c, 50, 50, 49, YEL);
  disc(c, 50, 50, 44, INK);
  ring(c, 50, 50, 33, 5, WHITE);
  for (let k = 0; k < 4; k++) {
    c.save();
    c.translate(50, 50);
    c.rotate((k * Math.PI) / 2);
    poly(c, [-9, -42, 0, -35, 9, -42, 9, -37, 0, -30, -9, -37], WHITE);
    c.restore();
  }
  disc(c, 50, 50, 18, DARK);
  ring(c, 50, 50, 18, 3, GREY);
}

function padWalk(c: C2): void {
  disc(c, 50, 50, 49, YEL);
  disc(c, 50, 50, 44, INK);
  ring(c, 50, 50, 39, 3.5, WHITE);
  footprints(c, 50, 56, 1.75, YEL);
  // Chevrons at the top: this way to the play.
  poly(c, [38, 22, 50, 12, 62, 22, 62, 27, 50, 18, 38, 27], WHITE);
}

function banner(c: C2): void {
  // 100 units = 1024 px wide here; the strip is 25 units tall (256 px).
  const H = 25;
  c.fillStyle = '#141833';
  roundRect(c, 0.4, 0.6, 99.2, H * 0.72, 2.2);
  c.fill();
  c.fillStyle = YEL;
  c.fillRect(0.4, 0.6, 99.2, 1.3);
  c.fillRect(0.4, H * 0.72 - 0.7, 99.2, 1.3);
  // Marquee bulbs along both edges.
  for (let i = 0; i < 34; i++) {
    const x = 2 + i * 2.9;
    disc(c, x, 3.4, 0.75, i % 2 ? WHITE : YEL);
    disc(c, x, H * 0.72 - 2.6, 0.75, i % 2 ? YEL : WHITE);
  }
  // Scallops under the banner: cream / berry alternating half-discs.
  for (let i = 0; i < 16; i++) {
    const x = 3.1 + i * 6.25;
    c.beginPath();
    c.arc(x, H * 0.72, 3.0, 0, Math.PI);
    c.closePath();
    c.fillStyle = i % 2 ? BERRY : '#fbf4e2';
    c.fill();
  }
  // Centre: the magic-glasses mark between stars; ends: big sparkles.
  mark(c, 50, 9.2, 7.4);
  for (const sx of [-1, 1]) {
    star(c, 50 + sx * 15, 9.2, 4.2, YEL, 0.45);
    star(c, 50 + sx * 26, 9.2, 3.0, WHITE, 0.45);
    sparkle(c, 50 + sx * 36, 9.2, 3.6, YEL);
    star(c, 50 + sx * 45, 9.2, 2.4, WHITE, 0.45);
  }
}

function lamp(c: C2, q: number): void {
  // Quarter cells: 100 units = 128 px.
  disc(c, 50, 50, 47, YEL);
  disc(c, 50, 50, 41, INK);
  if (q === 0) {
    disc(c, 50, 50, 33, DARK);
    disc(c, 41, 40, 8, GREY);
  } else if (q === 1) {
    disc(c, 50, 50, 36, WHITE);
    disc(c, 50, 50, 28, YEL);
    line(c, [33, 51, 45, 63, 68, 37], 10, INK);
  } else if (q === 2) {
    disc(c, 50, 50, 33, '#2b2f38');
    line(c, [37, 37, 63, 63], 8, GREY);
    line(c, [63, 37, 37, 63], 8, GREY);
  } else {
    disc(c, 50, 50, 37, WHITE);
    star(c, 50, 50, 30, YEL, 0.5);
    disc(c, 50, 50, 9, WHITE);
  }
}

function device(c: C2, q: number): void {
  disc(c, 50, 50, 48, INK);
  ring(c, 50, 50, 45, 4, YEL);
  if (q === 0) keyCap(c, 50, 52, 1.35, 'E');
  else if (q === 1) padButton(c, 50, 50, 1.4, 'X');
  else if (q === 2) tapHand(c, 50, 54, 1.15);
  else footprints(c, 50, 52, 1.6, WHITE);
}

function chevron(c: C2): void {
  poly(c, [10, 62, 50, 22, 90, 62, 90, 84, 50, 46, 10, 84], YEL, INK, 5);
}

function countdown(c: C2, label: string): void {
  // A bright burst with a dark disc and a huge white digit: reads by brightness from far away.
  star(c, 50, 50, 49, YEL, 0.78);
  disc(c, 50, 50, 37, INK);
  ring(c, 50, 50, 37, 3.5, WHITE);
  c.fillStyle = WHITE;
  c.font = `900 ${label.length > 1 ? 30 : 56}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 3;
  c.strokeStyle = INK;
  c.strokeText(label, 50, 53);
  c.fillText(label, 50, 53);
}

function burst(c: C2): void {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    line(c, [50 + Math.cos(a) * 20, 50 + Math.sin(a) * 20, 50 + Math.cos(a) * 44, 50 + Math.sin(a) * 44], 6, k % 2 ? WHITE : YEL);
  }
  star(c, 50, 50, 18, WHITE, 0.45);
}

const PROMPT_ART: Record<PromptId, (c: C2) => void> = {
  // Run through an arch: a big arch, the hero running into it, an arrow forward.
  arch: (c) => {
    panel(c);
    arch(c, 50, 84, 44, 66, YEL, 8);
    line(c, [12, 84, 88, 84], 3.2, GREY);
    hero(c, 50, 84, 0.95, 'runA');
    arrow(c, 18, 66, 30, 66, 4.5, WHITE);
  },
  press: (c) => {
    panel(c);
    button(c, 50, 80, 1.3, true);
    hand(c, 50, 72, 1.0);
    for (const [x0, y0, x1, y1] of [[24, 70, 15, 65], [76, 70, 85, 65], [26, 82, 15, 84], [74, 82, 85, 84]]) line(c, [x0, y0, x1, y1], 3.4, YEL);
  },
  look: (c) => {
    panel(c);
    // A big open eye with rays.
    c.beginPath();
    c.moveTo(14, 52);
    c.quadraticCurveTo(50, 14, 86, 52);
    c.quadraticCurveTo(50, 90, 14, 52);
    c.closePath();
    c.fillStyle = WHITE;
    c.fill();
    disc(c, 50, 52, 16, INK);
    disc(c, 50, 52, 8, YEL);
    disc(c, 44, 46, 4, WHITE);
    for (const a of [-2.4, -1.9, -1.57, -1.2, -0.7]) line(c, [50 + Math.cos(a) * 36, 50 + Math.sin(a) * 30, 50 + Math.cos(a) * 44, 50 + Math.sin(a) * 38], 3.6, YEL);
  },
  backToPad: (c) => {
    panel(c);
    c.beginPath();
    c.ellipse(50, 76, 30, 11, 0, 0, Math.PI * 2);
    c.fillStyle = DARK;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = YEL;
    c.stroke();
    footprints(c, 50, 75, 0.7, WHITE);
    // A U-turn arrow coming back onto the pad.
    c.beginPath();
    c.moveTo(72, 56);
    c.lineTo(72, 30);
    c.arc(50, 30, 22, 0, Math.PI, true);
    c.lineTo(28, 48);
    c.lineWidth = 6;
    c.strokeStyle = WHITE;
    c.lineCap = 'round';
    c.stroke();
    poly(c, [18, 46, 38, 46, 28, 60], WHITE);
  },
  stepPad: (c) => {
    panel(c);
    c.beginPath();
    c.ellipse(50, 74, 32, 12, 0, 0, Math.PI * 2);
    c.fillStyle = DARK;
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = YEL;
    c.stroke();
    footprints(c, 50, 73, 0.75, WHITE);
    arrow(c, 50, 14, 50, 50, 6, WHITE);
  },
  catch: (c) => {
    panel(c);
    hero(c, 42, 88, 0.95, 'jump');
    sparkle(c, 62, 24, 12, YEL);
    ring(c, 62, 24, 17, 3, WHITE);
  },
  follow: (c) => {
    panel(c);
    for (const [x, y, r] of [[22, 80, 0.5], [40, 64, 0.3], [56, 50, 0.6], [72, 34, 0.4]] as const) {
      c.save();
      c.translate(x, y);
      c.rotate(r);
      c.beginPath();
      c.ellipse(0, 3, 6.5, 5.5, 0, 0, Math.PI * 2);
      c.fillStyle = WHITE;
      c.fill();
      for (const [px, py] of [[-7, -4], [-2.6, -8], [2.6, -8], [7, -4]]) disc(c, px, py, 2.6, WHITE);
      c.restore();
    }
    arrow(c, 74, 30, 88, 14, 4.5, YEL);
  },
  aim: (c) => {
    panel(c);
    ring(c, 50, 50, 17, 3, WHITE);
    disc(c, 56, 43, 3, WHITE);
    ring(c, 50, 50, 29, 6, YEL);
    sparkle(c, 82, 20, 7, YEL);
  },
};

export interface BoothAtlas {
  readonly texture: THREE.CanvasTexture;
  /** Draw a mini-game's demo frames into its slot (call before the first render). */
  drawDemo(slot: number, demo: BoothDemo): void;
  dispose(): void;
}

export function createBoothAtlas(): BoothAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = BOOTH_ATLAS;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  c.clearRect(0, 0, BOOTH_ATLAS, BOOTH_ATLAS);

  inRect(c, cellPx(KIT_CELL.mark), (g) => mark(g, 50, 50, 48));
  inRect(c, cellPx(KIT_CELL.stripes), stripes);
  for (const s of SWATCH_ORDER) {
    const [x, y, w, h] = swatchPx(s);
    c.fillStyle = SWATCHES[s];
    c.fillRect(x, y, w, h);
  }
  inRect(c, cellPx(KIT_CELL.padPress), padPress);
  {
    const [x, y] = cellPx(KIT_CELL.banner);
    // 100 units span the 4 cells' width (1024 px); the strip is 25 units (256 px) tall.
    inRect(c, [x, y, BCELL * 4, BCELL], banner);
  }
  inRect(c, cellPx(KIT_CELL.padWalk), padWalk);
  for (let q = 0; q < 4; q++) inRect(c, quarterPx(KIT_CELL.lamps, q), (g) => lamp(g, q));
  for (let q = 0; q < 4; q++) inRect(c, quarterPx(KIT_CELL.device, q), (g) => device(g, q));
  inRect(c, cellPx(KIT_CELL.chevron), chevron);
  for (const n of [3, 2, 1, 0]) inRect(c, cellPx(countCell(n)), (g) => countdown(g, n ? String(n) : 'GO!'));
  inRect(c, cellPx(KIT_CELL.check), (g) => check(g, 50, 50, 46));
  inRect(c, cellPx(KIT_CELL.cross), (g) => cross(g, 50, 50, 44));
  inRect(c, cellPx(KIT_CELL.gem), (g) => gem(g, 50, 52, 5.6));
  inRect(c, cellPx(KIT_CELL.burst), burst);
  for (const p of PROMPTS) inRect(c, cellPx(promptCell(p)), PROMPT_ART[p]);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'glasses:booth-atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return {
    texture,
    drawDemo(slot, demo) {
      const n = Math.max(1, Math.min(DEMO_MAX_FRAMES, Math.floor(demo.frames)));
      for (let f = 0; f < n; f++) {
        const [x, y, w, h] = cellPx(demoCell(slot, f));
        c.save();
        c.clearRect(x, y, w, h);
        c.beginPath();
        c.rect(x, y, w, h);
        c.clip();
        c.translate(x, y);
        demo.draw(c, f, BCELL, DEMO_KIT);
        c.restore();
      }
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
