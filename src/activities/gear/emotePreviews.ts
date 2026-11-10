/**
 * Emote pictures for shop cards: bold pictograms drawn with canvas 2D (no WebGL, instant, so they
 * also work in test mode). White and yellow shapes with a dark outline on transparent, readable in
 * the red channel alone and the green channel alone. Never throws.
 */
import { emoteKind } from './catalog';
import type { EmoteKind } from './catalog';

const SIZE = 192;
const INK = '#14182a';
const WHITE = '#ffffff';
const GOLD = '#ffd21f';
const cache = new Map<EmoteKind, string | null>();

type G = CanvasRenderingContext2D;

/** A thick line with a dark outline. */
function limb(g: G, pts: Array<[number, number]>, w = 15, color = WHITE): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const [lw, c] of [[w + 9, INK], [w, color]] as const) {
    g.strokeStyle = c;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.stroke();
  }
}

/** A short bold yellow stroke (burst lines). */
function dash(g: G, a: [number, number], b: [number, number], w = 7): void {
  limb(g, [a, b], w, GOLD);
}

function arc(g: G, cx: number, cy: number, r: number, from: number, to: number, w = 7): void {
  g.lineCap = 'round';
  for (const [lw, c] of [[w + 7, INK], [w, GOLD]] as const) {
    g.strokeStyle = c;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, r, from, to);
    g.stroke();
  }
}

function note(g: G, x: number, y: number, s = 1): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.lineCap = 'round';
  for (const [lw, c] of [[13, INK], [6, GOLD]] as const) {
    g.strokeStyle = c;
    g.fillStyle = c;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(10, 24);
    g.lineTo(10, -22);
    g.quadraticCurveTo(26, -16, 24, -2);
    g.stroke();
    g.beginPath();
    g.ellipse(0, 25, 12, 9, -0.4, 0, Math.PI * 2);
    g.fill();
    if (lw === 13) g.stroke();
  }
  g.restore();
}

function star(g: G, x: number, y: number, r: number, rot = 0): void {
  for (const [grow, c] of [[5, INK], [0, GOLD]] as const) {
    g.fillStyle = c;
    g.strokeStyle = c;
    g.lineWidth = grow * 2;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.45;
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    if (grow) g.stroke();
    g.fill();
  }
}

function head(g: G, x: number, y: number): void {
  g.fillStyle = WHITE;
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  g.arc(x, y, 24, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x - 8, y - 3, 4.5, 0, Math.PI * 2);
  g.arc(x + 8, y - 3, 4.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 3.5;
  g.beginPath();
  g.arc(x, y + 4, 9, 0.25, Math.PI - 0.25);
  g.stroke();
}

function body(g: G, x: number, y: number): void {
  g.fillStyle = WHITE;
  g.strokeStyle = INK;
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(x - 22, y, 44, 56, 14);
  g.fill();
  g.stroke();
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(x, y + 24, 8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.stroke();
}

function hand(g: G, x: number, y: number): void {
  g.fillStyle = WHITE;
  g.strokeStyle = INK;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(x, y, 11, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

function wave(g: G): void {
  limb(g, [[88, 128], [80, 160]]);
  limb(g, [[108, 128], [116, 160]]);
  limb(g, [[78, 88], [56, 108], [52, 130]]);
  limb(g, [[116, 86], [140, 74], [146, 44]]);
  body(g, 98, 76);
  head(g, 98, 46);
  hand(g, 147, 38);
  arc(g, 147, 46, 22, -Math.PI * 0.95, -Math.PI * 0.45);
  arc(g, 147, 46, 34, -Math.PI * 0.95, -Math.PI * 0.45);
  arc(g, 147, 46, 24, -Math.PI * 0.05, Math.PI * 0.25);
}

function cheer(g: G): void {
  limb(g, [[88, 134], [80, 168]]);
  limb(g, [[108, 134], [116, 168]]);
  limb(g, [[78, 98], [52, 74], [44, 40]]);
  limb(g, [[118, 98], [144, 74], [152, 40]]);
  body(g, 98, 82);
  head(g, 98, 54);
  hand(g, 44, 34);
  hand(g, 152, 34);
  for (let i = 0; i < 7; i++) {
    const a = -2.45 + (i * 1.76) / 6;
    dash(g, [98 + Math.cos(a) * 44, 56 + Math.sin(a) * 30], [98 + Math.cos(a) * 62, 56 + Math.sin(a) * 42]);
  }
  star(g, 22, 22, 13, 0.3);
  star(g, 172, 20, 11, -0.3);
  star(g, 176, 98, 9, 0.5);
  star(g, 20, 100, 9, -0.5);
}

function dance(g: G): void {
  g.save();
  g.translate(96, 100);
  g.rotate(-0.2);
  g.translate(-96, -100);
  limb(g, [[88, 132], [66, 150], [52, 176]]);
  limb(g, [[108, 132], [112, 170]]);
  limb(g, [[78, 92], [48, 84], [30, 58]]);
  limb(g, [[118, 92], [146, 108], [162, 100]]);
  body(g, 98, 76);
  head(g, 98, 46);
  g.restore();
  note(g, 160, 40, 0.9);
  note(g, 30, 118, 0.8);
  star(g, 168, 142, 10, 0.2);
  star(g, 28, 30, 9, -0.2);
}

/** Pictogram for an emote item id as a PNG data URL, or null (not an emote / no canvas). */
export function emotePreview(id: string): string | null {
  const kind = emoteKind(id);
  if (!kind) return null;
  if (cache.has(kind)) return cache.get(kind) ?? null;
  let url: string | null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const g = c.getContext('2d');
    if (g) {
      (kind === 'wave' ? wave : kind === 'cheer' ? cheer : dance)(g);
      url = c.toDataURL('image/png');
    } else url = null;
  } catch {
    url = null;
  }
  cache.set(kind, url);
  return url;
}
