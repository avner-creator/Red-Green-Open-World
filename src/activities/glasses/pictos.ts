/**
 * Wordless pictograms for the glasses-play boards, drawn with Canvas2D into one shared atlas
 * (4×4 cells of 256 px). Same look as the wayfinding panels: light figures (white, warm yellow)
 * with bold strokes on a near-black rounded panel, so each picture reads by brightness alone in
 * the R-only and the G-only channel. The last cell holds flat swatches for the sign's wood.
 *
 * Layout (`GLASSES_PICTOS`, `glassesPictoUv`, `swatchUv`) is pure data for unit tests;
 * `createGlassesAtlas` needs a browser canvas.
 */
import * as THREE from 'three';

export type GlassesPicto =
  | 'magic' // magic glasses with sparkles (topper badge)
  | 'glasses' // glasses, one lens glowing
  | 'run' // running hero
  | 'firefly'
  | 'paw' // paw-print trail
  | 'toy'
  | 'odd' // three shapes, one different
  | 'press' // hand pressing a button
  | 'reticle' // reticle on a target
  | 'arches' // three arches, run through the right one
  | 'halves' // half + half = whole
  | 'dots' // dot picture with a hidden shape
  | 'gems' // gem with a plus
  | 'arrows'
  | 'check';

export const GLASSES_PICTOS: readonly GlassesPicto[] = [
  'magic', 'glasses', 'run', 'firefly', 'paw', 'toy', 'odd', 'press',
  'reticle', 'arches', 'halves', 'dots', 'gems', 'arrows', 'check',
];

export const GLASSES_ATLAS = 1024;
const CELL = 256;

/** Flat colour swatches in the last atlas cell (quarter cells). */
export type Swatch = 'wood' | 'woodDark' | 'ink' | 'cream';
const SWATCH_ORDER: Swatch[] = ['wood', 'woodDark', 'ink', 'cream'];
const SWATCH_COLOR: Record<Swatch, string> = { wood: '#a87a4c', woodDark: '#5e3f24', ink: '#16181d', cream: '#efe7d4' };

/** UV rect (u0, v0, du, dv) of a pictogram cell; v bottom-up (texture flipY). */
export function glassesPictoUv(id: GlassesPicto): [number, number, number, number] {
  const i = GLASSES_PICTOS.indexOf(id);
  const x = (i % 4) * CELL;
  const y = Math.floor(i / 4) * CELL;
  return [x / GLASSES_ATLAS, 1 - (y + CELL) / GLASSES_ATLAS, CELL / GLASSES_ATLAS, CELL / GLASSES_ATLAS];
}

/** UV rect of a flat swatch, inset so filtering never bleeds into its neighbours. */
export function swatchUv(s: Swatch): [number, number, number, number] {
  const i = SWATCH_ORDER.indexOf(s);
  const half = CELL / 2;
  const x = 3 * CELL + (i % 2) * half + 16;
  const y = 3 * CELL + Math.floor(i / 2) * half + 16;
  const size = half - 32;
  return [x / GLASSES_ATLAS, 1 - (y + size) / GLASSES_ATLAS, size / GLASSES_ATLAS, size / GLASSES_ATLAS];
}

// ───────────────────────────── drawing (100×100 units per cell) ─────────────────────────────

const INK = '#15171c';
const WHITE = '#f7f4ec';
const YEL = '#ffd23a';
const GREY = '#8a909a';
const DARK = '#3a3f49';

type C2 = CanvasRenderingContext2D;

function line(c: C2, pts: readonly number[], w: number, col = WHITE): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

function disc(c: C2, x: number, y: number, r: number, col: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
}

function ring(c: C2, x: number, y: number, r: number, w: number, col: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.stroke();
}

function roundRect(c: C2, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function poly(c: C2, pts: readonly number[], fill: string, stroke?: string, w = 3): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.lineWidth = w;
    c.strokeStyle = stroke;
    c.lineJoin = 'round';
    c.stroke();
  }
}

function arrow(c: C2, x0: number, y0: number, x1: number, y1: number, w = 6, col = YEL): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const hl = w * 2.1;
  const bx = x1 - Math.cos(a) * hl;
  const by = y1 - Math.sin(a) * hl;
  line(c, [x0, y0, bx, by], w, col);
  const px = -Math.sin(a) * w * 1.6;
  const py = Math.cos(a) * w * 1.6;
  poly(c, [x1, y1, bx + px, by + py, bx - px, by - py], col);
}

function star(c: C2, x: number, y: number, r: number, col = YEL, inner = 0.45): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  poly(c, pts, col);
}

/** Four-point sparkle. */
function sparkle(c: C2, x: number, y: number, r: number, col = WHITE): void {
  const k = r * 0.22;
  poly(c, [x, y - r, x + k, y - k, x + r, y, x + k, y + k, x, y + r, x - k, y + k, x - r, y, x - k, y - k], col);
}

function dashedCurve(c: C2, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w = 3, col = WHITE): void {
  c.save();
  c.setLineDash([w * 1.4, w * 1.8]);
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(cx, cy, x1, y1);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.stroke();
  c.restore();
}

/** Bold stick hero; (x, y) is the hip, height ≈ 36·s. */
function hero(c: C2, x: number, y: number, s: number, pose: 'stand' | 'run' | 'point', col = WHITE): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const w = 5.4;
  if (pose === 'run') {
    c.rotate(0.18);
    disc(c, 1, -23, 5.8, col);
    line(c, [0, -14, 0, 0], w, col);
    line(c, [-9, -6, -2, -12, 7, -15, 12, -9], w, col);
    line(c, [-11, 10, -5, 4, 0, 0, 6, 6, 4, 14], w, col);
  } else if (pose === 'point') {
    disc(c, 0, -23, 5.8, col);
    line(c, [0, -14, 0, 0], w, col);
    line(c, [-7, -2, 0, -12, 14, -14], w, col);
    line(c, [-5, 14, 0, 0, 5, 14], w, col);
  } else {
    disc(c, 0, -23, 5.8, col);
    line(c, [0, -14, 0, 0], w, col);
    line(c, [-7, -2, 0, -12, 7, -2], w, col);
    line(c, [-5, 14, 0, 0, 5, 14], w, col);
  }
  c.restore();
}

/** Glasses: two round lenses; `glow` = which lens shines (0 none, 1 right). */
function specs(c: C2, x: number, y: number, s: number, glow: boolean): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const r = 13;
  // Temples and bridge.
  line(c, [-36, -4, -27, -2], 5, WHITE);
  line(c, [36, -4, 27, -2], 5, WHITE);
  c.beginPath();
  c.arc(0, 2, 6, Math.PI * 1.1, Math.PI * 1.9);
  c.lineWidth = 5;
  c.strokeStyle = WHITE;
  c.stroke();
  if (glow) {
    // Rays around the shining lens.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      line(c, [16 + Math.cos(a) * (r + 5), 2 + Math.sin(a) * (r + 5), 16 + Math.cos(a) * (r + 10), 2 + Math.sin(a) * (r + 10)], 3.2, YEL);
    }
  }
  disc(c, -16, 2, r, DARK);
  disc(c, 16, 2, r, glow ? YEL : DARK);
  if (glow) disc(c, 12, -2, 4, WHITE);
  ring(c, -16, 2, r, 5, WHITE);
  ring(c, 16, 2, r, 5, WHITE);
  c.restore();
}

function gem(c: C2, x: number, y: number, s: number): void {
  const pts = [x - 7 * s, y - 3 * s, x - 3.5 * s, y - 8 * s, x + 3.5 * s, y - 8 * s, x + 7 * s, y - 3 * s, x, y + 8 * s];
  poly(c, pts, WHITE, INK, 1.5);
  poly(c, [x - 7 * s, y - 3 * s, x + 7 * s, y - 3 * s, x, y + 8 * s], YEL);
  line(c, [x - 3.5 * s, y - 3 * s, x, y - 8 * s, x + 3.5 * s, y - 3 * s], 1.2 * s, INK);
}

function paw(c: C2, x: number, y: number, s: number, rot: number, col = WHITE): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  c.beginPath();
  c.ellipse(0, 3, 6.5, 5.5, 0, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  disc(c, -7, -4, 2.6, col);
  disc(c, -2.6, -8, 2.6, col);
  disc(c, 2.6, -8, 2.6, col);
  disc(c, 7, -4, 2.6, col);
  c.restore();
}

/** Push button on a base. */
function button(c: C2, x: number, y: number, s: number, pressed: boolean): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  roundRect(c, -16, 0, 32, 10, 3);
  c.fillStyle = GREY;
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = WHITE;
  c.stroke();
  c.beginPath();
  const h = pressed ? 5 : 11;
  c.ellipse(0, 0, 11, h, 0, Math.PI, 0);
  c.closePath();
  c.fillStyle = YEL;
  c.fill();
  c.stroke();
  c.restore();
}

/** Pointing hand (index finger down), fingertip at (x, y). */
function hand(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  // Finger.
  roundRect(c, -4, -22, 8, 22, 4);
  c.fillStyle = WHITE;
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.stroke();
  // Fist.
  roundRect(c, -8, -40, 24, 22, 7);
  c.fillStyle = WHITE;
  c.fill();
  c.stroke();
  line(c, [3, -33, 14, -33], 1.8, INK);
  line(c, [3, -26, 14, -26], 1.8, INK);
  // Sleeve.
  roundRect(c, -6, -52, 20, 12, 3);
  c.fillStyle = YEL;
  c.fill();
  c.restore();
}

function arch(c: C2, x: number, y: number, w: number, h: number, col: string, lw: number): void {
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.lineTo(x - w / 2, y - h + w / 2);
  c.arc(x, y - h + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w / 2, y);
  c.lineWidth = lw;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.stroke();
}

/** Rounded dark panel with a white border and the step number as dots. */
function panelBg(c: C2, step = 0): void {
  roundRect(c, 2.5, 2.5, 95, 95, 11);
  c.fillStyle = INK;
  c.fill();
  roundRect(c, 5, 5, 90, 90, 9);
  c.lineWidth = 3.4;
  c.strokeStyle = WHITE;
  c.stroke();
  for (let i = 0; i < step; i++) disc(c, 14 + i * 8, 14, 3.1, YEL);
}

/** Round badge (white rim, dark face). */
function badgeBg(c: C2): void {
  disc(c, 50, 50, 49, WHITE);
  disc(c, 50, 50, 43.5, INK);
}

const DRAW: Record<GlassesPicto, (c: C2) => void> = {
  magic: (c) => {
    badgeBg(c);
    specs(c, 50, 54, 1.0, true);
    sparkle(c, 24, 26, 7);
    sparkle(c, 78, 76, 5);
    star(c, 74, 22, 6);
  },
  glasses: (c) => {
    panelBg(c);
    specs(c, 50, 52, 1.05, true);
    sparkle(c, 82, 22, 6);
  },
  run: (c) => {
    panelBg(c);
    hero(c, 46, 58, 1.15, 'run');
    for (let i = 0; i < 3; i++) line(c, [12 + i * 2, 42 + i * 10, 26 + i * 2, 42 + i * 10], 3.4, YEL);
    line(c, [14, 84, 86, 84], 3, GREY);
  },
  firefly: (c) => {
    panelBg(c);
    dashedCurve(c, 12, 80, 30, 30, 54, 58, 3.2, WHITE);
    // Glow rings, body, wings.
    ring(c, 64, 46, 22, 2.5, GREY);
    ring(c, 64, 46, 15, 3, YEL);
    c.beginPath();
    c.ellipse(56, 36, 9, 5, -0.6, 0, Math.PI * 2);
    c.ellipse(72, 36, 9, 5, 0.6, 0, Math.PI * 2);
    c.fillStyle = WHITE;
    c.fill();
    disc(c, 64, 48, 8.5, YEL);
    disc(c, 64, 39, 4.5, WHITE);
    sparkle(c, 84, 74, 6, YEL);
    sparkle(c, 30, 22, 5, WHITE);
  },
  paw: (c) => {
    panelBg(c);
    paw(c, 22, 78, 1.0, 0.5);
    paw(c, 40, 62, 1.0, 0.3);
    paw(c, 56, 48, 1.05, 0.6);
    paw(c, 72, 32, 1.1, 0.4, YEL);
    sparkle(c, 86, 16, 5, YEL);
  },
  toy: (c) => {
    panelBg(c);
    // Squeaky bone.
    c.save();
    c.translate(36, 60);
    c.rotate(-0.5);
    roundRect(c, -16, -5, 32, 10, 4);
    c.fillStyle = WHITE;
    c.fill();
    for (const [bx, by] of [[-17, -6], [-17, 6], [17, -6], [17, 6]]) disc(c, bx, by, 6.5, WHITE);
    c.restore();
    // Ball.
    disc(c, 70, 64, 15, YEL);
    c.beginPath();
    c.arc(70, 64, 15, -0.9, 0.9);
    c.lineWidth = 4;
    c.strokeStyle = WHITE;
    c.stroke();
    ring(c, 70, 64, 15, 2.5, WHITE);
    sparkle(c, 54, 26, 7, YEL);
    sparkle(c, 82, 34, 4.5, WHITE);
  },
  odd: (c) => {
    panelBg(c);
    // Three pedestals; the middle shape is the odd one.
    for (const x of [22, 50, 78]) {
      c.fillStyle = GREY;
      c.fillRect(x - 9, 66, 18, 20);
      line(c, [x - 12, 66, x + 12, 66], 3, WHITE);
    }
    poly(c, [22, 40, 34, 60, 10, 60], WHITE);
    poly(c, [78, 40, 90, 60, 66, 60], WHITE);
    disc(c, 50, 50, 11, YEL);
    ring(c, 50, 50, 17, 2.5, YEL);
    arrow(c, 50, 18, 50, 30, 4, WHITE);
  },
  press: (c) => {
    panelBg(c);
    button(c, 50, 80, 1.25, true);
    hand(c, 50, 72, 1.0);
    for (const [x0, y0, x1, y1] of [[24, 70, 16, 66], [76, 70, 84, 66], [26, 80, 16, 82], [74, 80, 84, 82]]) line(c, [x0, y0, x1, y1], 3, YEL);
  },
  reticle: (c) => {
    panelBg(c);
    // Target.
    disc(c, 50, 52, 26, WHITE);
    disc(c, 50, 52, 19, INK);
    disc(c, 50, 52, 12, WHITE);
    disc(c, 50, 52, 5, INK);
    // Reticle on top.
    ring(c, 50, 52, 33, 4, YEL);
    for (const [x0, y0, x1, y1] of [[50, 12, 50, 26], [50, 78, 50, 92], [10, 52, 24, 52], [76, 52, 90, 52]]) line(c, [x0, y0, x1, y1], 4.5, YEL);
  },
  arches: (c) => {
    panelBg(c);
    arch(c, 22, 72, 18, 34, GREY, 5);
    arch(c, 50, 72, 18, 34, YEL, 6);
    arch(c, 78, 72, 18, 34, GREY, 5);
    line(c, [8, 72, 92, 72], 3, WHITE);
    hero(c, 50, 58, 0.62, 'run');
    arrow(c, 50, 92, 50, 80, 4, WHITE);
  },
  halves: (c) => {
    panelBg(c);
    // Left half of a star + right half = whole star.
    c.save();
    c.beginPath();
    c.rect(4, 0, 18, 100);
    c.clip();
    star(c, 22, 50, 15, WHITE, 0.5);
    c.restore();
    line(c, [32, 50, 40, 50], 3.5, WHITE);
    line(c, [36, 46, 36, 54], 3.5, WHITE);
    c.save();
    c.beginPath();
    c.rect(46, 0, 30, 100);
    c.clip();
    star(c, 46, 50, 15, WHITE, 0.5);
    c.restore();
    line(c, [60, 46, 66, 46], 3.5, WHITE);
    line(c, [60, 54, 66, 54], 3.5, WHITE);
    star(c, 81, 50, 13, YEL, 0.5);
  },
  dots: (c) => {
    panelBg(c);
    // A disc of dots; the dots inside a hidden star are bright.
    const inStar = (x: number, y: number): boolean => {
      const dx = x - 50;
      const dy = y - 52;
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      const r = Math.hypot(dx, dy);
      const k = Math.abs(((a / (Math.PI / 5)) % 2 + 2) % 2 - 1); // 0 at points, 1 between
      return r < 26 - k * 13;
    };
    for (let y = 18; y <= 86; y += 6.8) {
      for (let x = 16; x <= 84; x += 6.8) {
        const ox = (Math.round(y) % 2) * 3.4;
        const px = x + ox;
        if (Math.hypot(px - 50, y - 52) > 34) continue;
        const hit = inStar(px, y);
        disc(c, px, y, hit ? 2.9 : 2.3, hit ? YEL : GREY);
      }
    }
  },
  gems: (c) => {
    panelBg(c);
    gem(c, 56, 56, 3.2);
    line(c, [12, 30, 30, 30], 6, YEL);
    line(c, [21, 21, 21, 39], 6, YEL);
    sparkle(c, 84, 20, 6, WHITE);
    sparkle(c, 82, 84, 4, YEL);
  },
  arrows: (c) => {
    panelBg(c);
    arrow(c, 16, 50, 84, 50, 9, YEL);
  },
  check: (c) => {
    panelBg(c);
    disc(c, 50, 50, 32, WHITE);
    line(c, [33, 51, 45, 63, 68, 38], 10, INK);
  },
};

/** Draw one pictogram into a 2D canvas at (x, y) with the given pixel size. */
export function drawGlassesPicto(c: C2, id: GlassesPicto, x: number, y: number, size: number): void {
  c.save();
  c.translate(x, y);
  c.scale(size / 100, size / 100);
  DRAW[id](c);
  c.restore();
}

/** Build the atlas (browser only). One per `createGlasses`, shared by every board. */
export function createGlassesAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GLASSES_ATLAS;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  c.clearRect(0, 0, GLASSES_ATLAS, GLASSES_ATLAS);
  GLASSES_PICTOS.forEach((id, i) => drawGlassesPicto(c, id, (i % 4) * CELL, Math.floor(i / 4) * CELL, CELL));
  SWATCH_ORDER.forEach((s, i) => {
    c.fillStyle = SWATCH_COLOR[s];
    c.fillRect(3 * CELL + (i % 2) * (CELL / 2), 3 * CELL + Math.floor(i / 2) * (CELL / 2), CELL / 2, CELL / 2);
  });
  // Wood grain on the two wood swatches (subtle, brightness only).
  c.globalAlpha = 0.18;
  for (let k = 0; k < 2; k++) {
    const x0 = 3 * CELL + k * (CELL / 2);
    for (let y = 3 * CELL + 6; y < 3 * CELL + CELL / 2; y += 9) {
      c.fillStyle = k ? '#2e1d0f' : '#6a4724';
      c.fillRect(x0, y, CELL / 2, 2);
    }
  }
  c.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
