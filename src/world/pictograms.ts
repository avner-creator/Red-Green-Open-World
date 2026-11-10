/**
 * Wordless pictograms for wayfinding: attraction icons (round badges) and "how to play" panels,
 * drawn procedurally into one canvas atlas. Style: white and yellow figures with bold strokes on
 * near-black, so every picture reads by brightness alone in the R-only and G-only channels.
 *
 * The atlas layout (`PICTO_RECTS`, `pictoUv`) is pure data so geometry can be built without a
 * canvas (unit tests); `drawPictogram` / `createPictogramAtlas` need a 2D canvas (browser).
 */
import * as THREE from 'three';

export type IconId =
  | 'iTrampoline' | 'iBounce' | 'iCar' | 'iBalloon' | 'iTarget' | 'iRocket'
  | 'iHorse' | 'iBungee' | 'iSilly' | 'iLake' | 'iLighthouse';
export type PanelId =
  | 'tramp1' | 'tramp2' | 'tramp3'
  | 'bounce1' | 'bounce2'
  | 'car1' | 'car2' | 'car3'
  | 'balloon1' | 'balloon2' | 'balloon3'
  | 'rocket1' | 'rocket2' | 'rocket3'
  | 'horse1' | 'horse2' | 'horse3'
  | 'bungee1' | 'bungee2'
  | 'silly1' | 'silly2';
export type PictoId = IconId | PanelId;

/** Atlas width (and the unit for UV maths); the atlas is ATLAS_SIZE × ATLAS_H pixels. */
export const ATLAS_SIZE = 2048;
export const ATLAS_H = 3072;
const CELL = 512;
const COLS = ATLAS_SIZE / CELL;

const PANEL_ORDER: PanelId[] = [
  'tramp1', 'tramp2', 'tramp3', 'bounce1', 'bounce2', 'car1', 'car2', 'car3',
  'balloon1', 'balloon2', 'balloon3', 'rocket1', 'rocket2', 'rocket3',
  'horse1', 'horse2', 'horse3', 'bungee1', 'bungee2', 'silly1', 'silly2',
];
const ICON_ORDER: IconId[] = [
  'iTrampoline', 'iBounce', 'iCar', 'iBalloon', 'iTarget', 'iRocket', 'iHorse', 'iBungee', 'iSilly', 'iLake', 'iLighthouse',
];

/** Pixel rectangles [x, y, size] in the atlas (y down, canvas convention). */
export const PICTO_RECTS: Readonly<Record<PictoId, readonly [number, number, number]>> = (() => {
  const r = {} as Record<PictoId, [number, number, number]>;
  PANEL_ORDER.forEach((id, i) => (r[id] = [(i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL]));
  // Icons: 256 px badges, four per cell, in the cells after the panels.
  ICON_ORDER.forEach((id, i) => {
    const cell = PANEL_ORDER.length + Math.floor(i / 4);
    const j = i % 4;
    r[id] = [(cell % COLS) * CELL + (j % 2) * 256, Math.floor(cell / COLS) * CELL + Math.floor(j / 2) * 256, 256];
  });
  return r;
})();

/** UV rectangle (u0, v0, du, dv) of a pictogram; v is bottom-up (texture flipY). */
export function pictoUv(id: PictoId): [number, number, number, number] {
  const [x, y, s] = PICTO_RECTS[id];
  return [x / ATLAS_SIZE, 1 - (y + s) / ATLAS_H, s / ATLAS_SIZE, s / ATLAS_H];
}

// ───────────────────────────── drawing ─────────────────────────────

const INK = '#15171c';
const WHITE = '#f7f4ec';
const YEL = '#ffd23a';
const GREY = '#7d838e';
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

function ellipse(c: C2, x: number, y: number, rx: number, ry: number, fill: string | null, stroke?: string, w = 3): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.lineWidth = w;
    c.strokeStyle = stroke;
    c.stroke();
  }
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

/** Thick arrow from (x0,y0) to (x1,y1). */
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

function dashedCurve(c: C2, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w = 3, col = WHITE): void {
  c.save();
  c.setLineDash([w * 1.4, w * 1.6]);
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(cx, cy, x1, y1);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.lineCap = 'round';
  c.stroke();
  c.restore();
}

function star(c: C2, x: number, y: number, r: number, col = YEL): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  poly(c, pts, col);
}

type Pose = 'stand' | 'walk' | 'jump' | 'fly' | 'hang';

/** A bold stick figure; (x, y) is the hip. Height ≈ 36·s units. `rot` tilts it (radians). */
function person(c: C2, x: number, y: number, s: number, pose: Pose, rot = 0, col = WHITE): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  const w = 5.2;
  disc(c, 0, -23, 5.6, col);
  line(c, [0, -14, 0, 0], w, col);
  switch (pose) {
    case 'stand':
      line(c, [-7, -2, 0, -12, 7, -2], w, col);
      line(c, [-5, 14, 0, 0, 5, 14], w, col);
      break;
    case 'walk':
      line(c, [-7, -4, 0, -12, 6, -6], w, col);
      line(c, [-7, 13, -2, 4, 0, 0, 3, 6, 8, 13], w, col);
      break;
    case 'jump':
      line(c, [-14, -23, 0, -12, 14, -23], w, col);
      line(c, [-6, 13, -6, 6, 0, 0, 6, 6, 6, 13], w, col);
      break;
    case 'fly':
      line(c, [-12, -27, 0, -12, 12, -27], w, col);
      line(c, [-2, 15, 0, 0, 2, 15], w, col);
      // Rocket-boot flame.
      poly(c, [-5, 17, 0, 34, 5, 17], YEL);
      break;
    case 'hang':
      line(c, [-13, -22, 0, -12, 13, -22], w, col);
      line(c, [-4, 13, 0, 0, 4, 13], w, col);
      break;
  }
  c.restore();
}

/** Keyboard key: 'E' or the space bar. */
function key(c: C2, x: number, y: number, w: number, h: number, label: 'E' | 'space'): void {
  roundRect(c, x - w / 2, y - h / 2 + 3, w, h, 4);
  c.fillStyle = GREY;
  c.fill();
  roundRect(c, x - w / 2, y - h / 2, w, h, 4);
  c.fillStyle = WHITE;
  c.fill();
  if (label === 'E') {
    c.fillStyle = INK;
    c.font = `bold ${h * 0.72}px "Arial Black", Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('E', x, y + h * 0.04);
  } else {
    line(c, [x - w * 0.28, y - h * 0.12, x - w * 0.28, y + h * 0.16, x + w * 0.28, y + h * 0.16, x + w * 0.28, y - h * 0.12], 3.2, INK);
  }
}

function trampoline(c: C2, x: number, y: number, w: number): void {
  const h = w * 0.16;
  line(c, [x - w * 0.42, y, x - w * 0.36, y + w * 0.24], 4);
  line(c, [x + w * 0.42, y, x + w * 0.36, y + w * 0.24], 4);
  line(c, [x - w * 0.05, y + h, x, y + w * 0.24], 4);
  ellipse(c, x, y, w / 2, h, DARK, WHITE, 4.5);
  ellipse(c, x, y, w * 0.38, h * 0.68, null, YEL, 2.5);
}

function pad(c: C2, x: number, y: number, w: number, dots: number): void {
  const h = w * 0.22;
  ellipse(c, x, y + 3, w / 2, h, GREY);
  ellipse(c, x, y, w / 2, h, YEL, WHITE, 3);
  for (let i = 0; i < dots; i++) disc(c, x + (i - (dots - 1) / 2) * 6.5, y, 2.4, INK);
}

function buggy(c: C2, x: number, y: number, s: number, col = WHITE): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  // Body, roll cage, wheels (big, with white tyres and dark hubs).
  poly(c, [-24, -4, -18, -12, 14, -12, 24, -6, 24, 2, -24, 2], col);
  line(c, [-12, -12, -8, -26, 6, -26, 10, -12], 4.5, col);
  line(c, [-1, -26, -1, -12], 3.5, col);
  for (const wx of [-15, 15]) {
    disc(c, wx, 4, 10.5, col);
    disc(c, wx, 4, 5.5, INK);
    disc(c, wx, 4, 2.2, YEL);
  }
  c.restore();
}

function hotAirBalloon(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  // Envelope: a teardrop with yellow gores.
  c.beginPath();
  c.moveTo(-8, 10);
  c.bezierCurveTo(-30, -6, -26, -40, 0, -40);
  c.bezierCurveTo(26, -40, 30, -6, 8, 10);
  c.closePath();
  c.fillStyle = WHITE;
  c.fill();
  c.save();
  c.clip();
  for (const gx of [-14, 0, 14]) ellipse(c, gx, -14, 4.2, 30, YEL);
  c.restore();
  line(c, [-8, 10, -5, 19], 2.4);
  line(c, [8, 10, 5, 19], 2.4);
  roundRect(c, -6.5, 18, 13, 9, 2);
  c.fillStyle = YEL;
  c.fill();
  c.restore();
}

function target(c: C2, x: number, y: number, rx: number, ry: number): void {
  const cols = [WHITE, INK, YEL, INK, WHITE];
  cols.forEach((col, i) => ellipse(c, x, y, rx * (1 - i * 0.19), ry * (1 - i * 0.19), col));
}

function rocket(c: C2, x: number, y: number, s: number, rot: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(s, s);
  // Flame (behind), fins, body, nose, window. Points up (−y) before rotation.
  poly(c, [-6, 14, 0, 34, 6, 14], YEL);
  poly(c, [-3.5, 14, 0, 25, 3.5, 14], WHITE);
  poly(c, [-8, 4, -15, 16, -6, 13], YEL);
  poly(c, [8, 4, 15, 16, 6, 13], YEL);
  c.beginPath();
  c.moveTo(0, -26);
  c.bezierCurveTo(10, -16, 9, 4, 7, 14);
  c.lineTo(-7, 14);
  c.bezierCurveTo(-9, 4, -10, -16, 0, -26);
  c.closePath();
  c.fillStyle = WHITE;
  c.fill();
  disc(c, 0, -6, 4.6, INK);
  disc(c, 0, -6, 2.8, YEL);
  c.restore();
}

function gem(c: C2, x: number, y: number, s: number): void {
  const pts = [x - 7 * s, y - 3 * s, x - 3.5 * s, y - 8 * s, x + 3.5 * s, y - 8 * s, x + 7 * s, y - 3 * s, x, y + 8 * s];
  poly(c, pts, WHITE);
  poly(c, [x - 7 * s, y - 3 * s, x + 7 * s, y - 3 * s, x, y + 8 * s], YEL);
}

function parachute(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-26, -24);
  c.quadraticCurveTo(0, -56, 26, -24);
  c.quadraticCurveTo(13, -30, 0, -24);
  c.quadraticCurveTo(-13, -30, -26, -24);
  c.closePath();
  c.fillStyle = YEL;
  c.fill();
  c.save();
  c.clip();
  ellipse(c, 0, -36, 6, 18, WHITE);
  c.restore();
  for (const lx of [-26, -9, 9, 26]) line(c, [lx, -24, lx * 0.15, 2], 1.8);
  person(c, 0, 14, 0.62, 'hang');
  c.restore();
}

function net(c: C2, x: number, y: number, w: number, sag: number): void {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  line(c, [x0, y - 10, x0, y + 22], 5);
  line(c, [x1, y - 10, x1, y + 22], 5);
  // Sagging net: crossing lines between two curves.
  c.save();
  c.beginPath();
  c.moveTo(x0, y - 8);
  c.quadraticCurveTo(x, y - 8 + sag * 2, x1, y - 8);
  c.lineWidth = 4;
  c.strokeStyle = YEL;
  c.stroke();
  c.restore();
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const px = x0 + (x1 - x0) * t;
    const py = y - 8 + sag * 4 * t * (1 - t) * 1;
    line(c, [px, py, px + 4, py + 5], 1.8, WHITE);
    line(c, [px, py, px - 4, py + 5], 1.8, WHITE);
  }
}

function road(c: C2, y0: number, y1: number): void {
  c.fillStyle = DARK;
  c.fillRect(6, y0, 88, y1 - y0);
  line(c, [6, y0, 94, y0], 2.2, WHITE);
  line(c, [6, y1, 94, y1], 2.2, WHITE);
  for (let x = 12; x < 84; x += 16) line(c, [x, (y0 + y1) / 2, x + 8, (y0 + y1) / 2], 2.4, YEL);
}

function speedLines(c: C2, x: number, y: number): void {
  for (let i = 0; i < 3; i++) line(c, [x - 16 + i * 3, y - 8 + i * 7, x - 4 + i * 3, y - 8 + i * 7], 3, WHITE);
}

/** Horse in profile facing right; (x, y) is the middle of the body. `jump` tucks the legs. */
function horse(c: C2, x: number, y: number, s: number, opts: { jump?: boolean; rider?: boolean; col?: string } = {}): void {
  const col = opts.col ?? WHITE;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  // Tail and legs first (behind the body).
  line(c, [-19, -4, -27, 2, -29, 12], 4.5, col);
  const legs = opts.jump
    ? [[-15, 5, -24, 12, -30, 14], [-10, 5, -18, 14, -25, 18], [11, 5, 20, 10, 18, 18], [16, 4, 26, 4, 25, 12]]
    : [[-15, 5, -17, 15, -16, 24], [-9, 6, -8, 15, -8, 24], [11, 6, 12, 15, 11, 24], [16, 5, 18, 14, 19, 24]];
  for (const l of legs) line(c, l, 4.6, col);
  ellipse(c, 0, 0, 20, 9.5, col);
  // Neck and head.
  poly(c, [10, -5, 17, -21, 24, -25, 28, -22, 21, -8, 18, 2], col);
  poly(c, [21, -25, 35, -17, 34, -12, 22, -16], col);
  poly(c, [21, -24, 22, -31, 25, -25], col);
  // Mane (yellow), eye (dark).
  line(c, [11, -9, 15, -19, 21, -25], 3.2, YEL);
  disc(c, 27, -20, 1.6, INK);
  if (opts.rider) {
    disc(c, -1, -27, 4.6, YEL);
    line(c, [-1, -22, -2, -11], 4.4, YEL);
    line(c, [-2, -18, 10, -14], 3.6, YEL);
    line(c, [-2, -11, 4, -4], 3.6, YEL);
  }
  c.restore();
}

/** A striped show-jump fence: two posts and two rails. */
function jumpFence(c: C2, x: number, y: number, w: number, h: number): void {
  line(c, [x - w / 2, y, x - w / 2, y - h], 4);
  line(c, [x + w / 2, y, x + w / 2, y - h], 4);
  for (const ry of [h * 0.45, h * 0.9]) {
    line(c, [x - w / 2, y - ry, x + w / 2, y - ry], 4.2, WHITE);
    for (let i = 0; i < 3; i++) line(c, [x - w / 2 + (i + 0.25) * (w / 3), y - ry, x - w / 2 + (i + 0.6) * (w / 3), y - ry], 4.2, YEL);
  }
}

/** Zig-zag spring cord from (x0,y0) to (x1,y1). */
function cord(c: C2, x0: number, y0: number, x1: number, y1: number, n = 7, amp = 4): void {
  const pts: number[] = [x0, y0];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const px = -dy / l;
  const py = dx / l;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const o = (i % 2 ? 1 : -1) * amp;
    pts.push(x0 + dx * t + px * o, y0 + dy * t + py * o);
  }
  pts.push(x1, y1);
  line(c, pts, 3, YEL);
}

/** Bridge deck stub with a jump platform sticking out to the right; returns the platform tip. */
function deck(c: C2, x: number, y: number, w: number): void {
  c.fillStyle = GREY;
  c.fillRect(x - w / 2, y, w, 7);
  line(c, [x - w / 2, y, x + w / 2, y], 3, WHITE);
  line(c, [x - w / 2 + 4, y, x - w / 2 + 4, y - 12, x + w / 2 - 10, y - 12], 2.5, WHITE);
}

/** Giant striped beach ball. */
function beachBall(c: C2, x: number, y: number, r: number): void {
  disc(c, x, y, r, WHITE);
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - 0.4;
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, r, a, a + Math.PI / 3);
    c.closePath();
    c.fillStyle = [YEL, WHITE, DARK][i % 3];
    c.fill();
  }
  c.restore();
  disc(c, x, y, r * 0.16, WHITE);
  ellipse(c, x - r * 0.42, y - r * 0.45, r * 0.22, r * 0.12, WHITE);
  ellipse(c, x, y, r, r, null, WHITE, 3);
}

/** Lighthouse tower with a lit lantern and two beams. */
function tower(c: C2, x: number, y: number, s: number): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  poly(c, [-28, -26, -6, -30, -6, -24], YEL);
  poly(c, [28, -26, 6, -30, 6, -24], YEL);
  poly(c, [-9, 26, -6, -18, 6, -18, 9, 26], WHITE);
  poly(c, [-8.2, 12, -7.4, 0, 7.4, 0, 8.2, 12], DARK);
  poly(c, [-6.8, -6, -6.4, -12, 6.4, -12, 6.8, -6], DARK);
  c.fillStyle = WHITE;
  c.fillRect(-9, -20, 18, 3);
  disc(c, 0, -26, 5.5, YEL);
  poly(c, [-7, -31, 0, -38, 7, -31], WHITE);
  c.restore();
}

/** Two rows of waves. */
function waves(c: C2, x0: number, x1: number, y: number, col = WHITE): void {
  for (const [dy, w] of [[0, 3.2], [8, 2.6]] as const) {
    const pts: number[] = [];
    for (let px = x0; px <= x1; px += 2) pts.push(px, y + dy + Math.sin((px - x0) * 0.42) * 2.4);
    line(c, pts, w, col);
  }
}

function panelBg(c: C2, step: number): void {
  roundRect(c, 2.5, 2.5, 95, 95, 9);
  c.fillStyle = INK;
  c.fill();
  roundRect(c, 4.5, 4.5, 91, 91, 7.5);
  c.lineWidth = 3.2;
  c.strokeStyle = WHITE;
  c.stroke();
  // Step number as dots: ● / ●● / ●●●.
  for (let i = 0; i < step; i++) disc(c, 13 + i * 8, 13, 3.1, YEL);
}

function iconBg(c: C2): void {
  disc(c, 50, 50, 48.5, WHITE);
  disc(c, 50, 50, 43, INK);
}

const DRAW: Record<PictoId, (c: C2) => void> = {
  // ── icons ──
  iTrampoline: (c) => {
    iconBg(c);
    trampoline(c, 50, 70, 54);
    person(c, 50, 38, 0.72, 'jump');
    line(c, [38, 52, 38, 58], 2.5, YEL);
    line(c, [62, 52, 62, 58], 2.5, YEL);
  },
  iBounce: (c) => {
    iconBg(c);
    dashedCurve(c, 24, 66, 34, 38, 46, 58, 3, WHITE);
    dashedCurve(c, 52, 56, 62, 26, 74, 50, 3, WHITE);
    pad(c, 24, 70, 20, 1);
    pad(c, 49, 62, 22, 2);
    pad(c, 75, 54, 24, 3);
  },
  iCar: (c) => {
    iconBg(c);
    buggy(c, 50, 54, 1.25);
  },
  iBalloon: (c) => {
    iconBg(c);
    hotAirBalloon(c, 50, 52, 1.0);
  },
  iTarget: (c) => {
    iconBg(c);
    target(c, 50, 50, 34, 34);
  },
  iRocket: (c) => {
    iconBg(c);
    rocket(c, 52, 48, 1.15, Math.PI / 4);
  },
  iHorse: (c) => {
    iconBg(c);
    horse(c, 50, 54, 1.08);
  },
  iBungee: (c) => {
    iconBg(c);
    deck(c, 38, 32, 34);
    cord(c, 50, 32, 54, 56, 5, 4);
    person(c, 54, 72, 0.68, 'jump', Math.PI);
    line(c, [76, 40, 76, 72], 3, WHITE);
    poly(c, [70, 44, 76, 34, 82, 44], WHITE);
    poly(c, [70, 68, 76, 78, 82, 68], WHITE);
  },
  iSilly: (c) => {
    iconBg(c);
    disc(c, 50, 52, 30, YEL);
    disc(c, 39, 44, 8, WHITE);
    disc(c, 61, 44, 8, WHITE);
    disc(c, 42, 46, 4, INK);
    disc(c, 58, 42, 4, INK);
    c.beginPath();
    c.arc(50, 56, 15, 0.15, Math.PI - 0.15);
    c.fillStyle = INK;
    c.fill();
    ellipse(c, 54, 68, 6, 5, WHITE);
  },
  iLake: (c) => {
    iconBg(c);
    poly(c, [50, 18, 50, 58, 74, 58], WHITE);
    poly(c, [46, 26, 46, 58, 30, 58], YEL);
    line(c, [48, 16, 48, 62], 3, WHITE);
    poly(c, [26, 62, 74, 62, 66, 72, 34, 72], WHITE);
    waves(c, 16, 84, 78);
  },
  iLighthouse: (c) => {
    iconBg(c);
    tower(c, 50, 56, 1.15);
  },
  // ── trampoline: walk on → hold jump → go higher ──
  tramp1: (c) => {
    panelBg(c, 1);
    person(c, 20, 60, 1.0, 'walk');
    arrow(c, 31, 52, 47, 52, 5);
    trampoline(c, 70, 70, 46);
  },
  tramp2: (c) => {
    panelBg(c, 2);
    trampoline(c, 50, 56, 44);
    person(c, 50, 36, 0.8, 'jump');
    key(c, 44, 82, 48, 15, 'space');
    // "Hold": a timer ring next to the key.
    c.beginPath();
    c.arc(83, 82, 7.5, -Math.PI / 2, Math.PI);
    c.lineWidth = 4;
    c.strokeStyle = YEL;
    c.lineCap = 'round';
    c.stroke();
    disc(c, 83, 82, 2.2, WHITE);
  },
  tramp3: (c) => {
    panelBg(c, 3);
    trampoline(c, 56, 82, 34);
    dashedCurve(c, 56, 74, 58, 58, 56, 52, 3);
    person(c, 56, 38, 0.82, 'jump');
    arrow(c, 18, 86, 18, 22, 6);
    star(c, 82, 22, 8);
    star(c, 30, 30, 5);
  },
  // ── bounce pads: run across in order ──
  bounce1: (c) => {
    panelBg(c, 1);
    person(c, 16, 50, 0.85, 'walk');
    dashedCurve(c, 26, 66, 34, 42, 44, 62, 3);
    dashedCurve(c, 50, 60, 60, 34, 70, 56, 3);
    pad(c, 26, 74, 20, 1);
    pad(c, 50, 68, 22, 2);
    pad(c, 76, 62, 26, 3);
    arrow(c, 30, 88, 70, 88, 4);
  },
  bounce2: (c) => {
    panelBg(c, 2);
    pad(c, 58, 84, 34, 3);
    dashedCurve(c, 58, 78, 60, 60, 58, 52, 3);
    person(c, 58, 38, 0.82, 'jump');
    arrow(c, 18, 86, 18, 22, 6);
    star(c, 84, 24, 8);
  },
  // ── buggy: E → drive → gems on the road ──
  car1: (c) => {
    panelBg(c, 1);
    key(c, 22, 56, 22, 22, 'E');
    arrow(c, 36, 56, 50, 56, 5);
    buggy(c, 72, 60, 0.95);
  },
  car2: (c) => {
    panelBg(c, 2);
    road(c, 64, 90);
    buggy(c, 56, 64, 0.95);
    speedLines(c, 28, 52);
    arrow(c, 70, 30, 90, 30, 4);
  },
  car3: (c) => {
    panelBg(c, 3);
    road(c, 64, 90);
    buggy(c, 28, 64, 0.8);
    gem(c, 56, 52, 1.0);
    gem(c, 72, 52, 1.0);
    gem(c, 88, 52, 1.0);
    star(c, 74, 32, 7);
  },
  // ── balloon: E → rise → jump → parachute → target ──
  balloon1: (c) => {
    panelBg(c, 1);
    key(c, 20, 76, 22, 22, 'E');
    hotAirBalloon(c, 56, 56, 1.05);
    arrow(c, 86, 84, 86, 26, 5);
  },
  balloon2: (c) => {
    panelBg(c, 2);
    hotAirBalloon(c, 26, 38, 0.62);
    dashedCurve(c, 34, 52, 46, 40, 52, 56, 3);
    parachute(c, 68, 66, 0.82);
    key(c, 26, 84, 30, 11, 'space');
  },
  balloon3: (c) => {
    panelBg(c, 3);
    target(c, 50, 82, 36, 10);
    parachute(c, 50, 46, 0.8);
    line(c, [50, 64, 50, 68], 3, YEL);
    star(c, 84, 24, 7);
  },
  // ── rocket pads: step on → fly → net ──
  rocket1: (c) => {
    panelBg(c, 1);
    person(c, 18, 60, 0.95, 'walk');
    arrow(c, 29, 52, 43, 52, 5);
    ellipse(c, 68, 76, 26, 8, GREY);
    ellipse(c, 68, 73, 26, 8, DARK, WHITE, 3);
    poly(c, [56, 76, 68, 66, 80, 76, 74, 76, 68, 71, 62, 76], YEL);
    rocket(c, 68, 40, 0.75, 0);
  },
  rocket2: (c) => {
    panelBg(c, 2);
    ellipse(c, 20, 86, 14, 4.5, DARK, WHITE, 2.5);
    poly(c, [14, 87, 20, 83, 26, 87], YEL);
    dashedCurve(c, 20, 80, 40, 10, 90, 48, 3);
    person(c, 50, 36, 0.78, 'fly', 1.1);
    line(c, [20, 46, 30, 41], 3, WHITE);
    line(c, [26, 56, 36, 51], 3, WHITE);
    arrow(c, 74, 64, 88, 72, 4);
  },
  rocket3: (c) => {
    panelBg(c, 3);
    dashedCurve(c, 10, 22, 40, 10, 52, 54, 3);
    net(c, 54, 72, 66, 7);
    person(c, 54, 66, 0.7, 'jump', 0.25);
    star(c, 82, 26, 7);
    star(c, 24, 52, 5);
  },
  // ── horse: E next to a horse → gallop → jump the fences ──
  horse1: (c) => {
    panelBg(c, 1);
    person(c, 16, 58, 0.9, 'walk');
    key(c, 34, 30, 20, 20, 'E');
    horse(c, 64, 60, 0.95);
  },
  horse2: (c) => {
    panelBg(c, 2);
    horse(c, 56, 60, 0.95, { rider: true });
    speedLines(c, 26, 52);
    line(c, [8, 86, 92, 86], 2.4, GREY);
    arrow(c, 66, 92, 90, 92, 3.5);
  },
  horse3: (c) => {
    panelBg(c, 3);
    jumpFence(c, 50, 88, 26, 22);
    dashedCurve(c, 14, 82, 48, 20, 86, 82, 3);
    horse(c, 50, 42, 0.78, { rider: true, jump: true });
    star(c, 84, 22, 7);
  },
  // ── bungee: E on the platform → dive → boing ──
  bungee1: (c) => {
    panelBg(c, 1);
    deck(c, 44, 48, 64);
    person(c, 62, 34, 0.8, 'stand');
    cord(c, 40, 22, 60, 46, 5, 3);
    line(c, [30, 22, 40, 22], 3, WHITE);
    key(c, 26, 78, 22, 22, 'E');
    arrow(c, 66, 70, 66, 92, 4);
  },
  bungee2: (c) => {
    panelBg(c, 2);
    deck(c, 30, 30, 40);
    cord(c, 46, 30, 54, 58, 6, 4);
    person(c, 54, 74, 0.72, 'jump', Math.PI);
    line(c, [82, 34, 82, 76], 3.2, WHITE);
    poly(c, [76, 38, 82, 28, 88, 38], YEL);
    poly(c, [76, 72, 82, 82, 88, 72], YEL);
    star(c, 20, 56, 6);
  },
  // ── Silly Zone: push the giant ball → FLOP ──
  silly1: (c) => {
    panelBg(c, 1);
    person(c, 22, 62, 0.95, 'walk');
    arrow(c, 32, 54, 44, 54, 4.5);
    beachBall(c, 68, 62, 22);
    line(c, [60, 92, 88, 92], 3, WHITE);
  },
  silly2: (c) => {
    panelBg(c, 2);
    line(c, [10, 82, 90, 82], 3, GREY);
    person(c, 54, 74, 0.95, 'jump', Math.PI / 2 - 0.15);
    star(c, 24, 50, 6);
    star(c, 40, 38, 4.5);
    star(c, 18, 32, 4);
    ellipse(c, 74, 38, 13, 6, GREY);
    ellipse(c, 74, 34, 13, 6, YEL, WHITE, 3);
  },
};

/** Draw one pictogram into a 2D canvas at (x, y) with the given pixel size. */
export function drawPictogram(c: C2, id: PictoId, x: number, y: number, size: number): void {
  c.save();
  c.translate(x, y);
  c.scale(size / 100, size / 100);
  DRAW[id](c);
  c.restore();
}

/** Build the whole atlas as a mip-mapped sRGB CanvasTexture (browser only). */
export function createPictogramAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_H;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  for (const [id, [x, y, s]] of Object.entries(PICTO_RECTS) as [PictoId, readonly [number, number, number]][]) drawPictogram(c, id, x, y, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
