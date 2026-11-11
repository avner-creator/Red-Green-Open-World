/**
 * Pictograms drawn on a 2D canvas for in-world boards and badges: the HUD's own icon shapes
 * (`src/ui/icons.ts`, parsed from their SVG markup and drawn with Path2D, synchronously, so a frozen
 * frame never changes under a test) plus a few board-only shapes. White/yellow on near-black with
 * black outlines, like the HUD, so every board reads in the red-only and the green-only channel.
 */
import { iconSvg } from '../../ui/icons';
import type { UiIconName } from '../../ui/icons';

export const INK = '#0a0d1a';
export const PANEL = '#10142a';
export const YELLOW = '#ffd93b';
export const WHITE = '#ffffff';

type El = { tag: string; attrs: Record<string, string> };

const parsed = new Map<UiIconName, El[]>();

function parse(name: UiIconName): El[] {
  const hit = parsed.get(name);
  if (hit) return hit;
  const out: El[] = [];
  const svg = iconSvg(name);
  const re = /<(path|circle|rect|ellipse)\s([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const attrs: Record<string, string> = {};
    const ar = /([a-z-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[2]))) attrs[a[1]] = a[2];
    out.push({ tag: m[1], attrs });
  }
  parsed.set(name, out);
  return out;
}

function shapeOf(e: El): Path2D {
  const n = (k: string, d = 0): number => (e.attrs[k] !== undefined ? Number(e.attrs[k]) : d);
  if (e.tag === 'path') return new Path2D(e.attrs.d ?? '');
  const p = new Path2D();
  if (e.tag === 'circle') p.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
  else if (e.tag === 'ellipse') p.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
  else p.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx'));
  return p;
}

/** Draw HUD icon `name` centred at (x, y), `size` px across, in `color` with a black outline. */
export function drawIcon(g: CanvasRenderingContext2D, name: UiIconName, x: number, y: number, size: number, color = WHITE): void {
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const e of parse(name)) {
    const cls = e.attrs.class ?? '';
    const style = e.attrs.style ?? '';
    const p = shapeOf(e);
    g.globalAlpha = /opacity:\s*\.?3/.test(style) ? 0.3 : 1;
    if (cls === 'k') {
      g.fillStyle = INK;
      g.fill(p);
    } else if (cls === 'l') {
      g.strokeStyle = INK;
      g.lineWidth = 1.3;
      g.stroke(p);
    } else if (cls === 'o') {
      g.strokeStyle = INK;
      g.lineWidth = 5.4;
      g.stroke(p);
    } else if (cls === 'w') {
      g.strokeStyle = color;
      g.lineWidth = 2.6;
      g.stroke(p);
    } else {
      if (!/stroke:\s*none/.test(style)) {
        g.strokeStyle = INK;
        g.lineWidth = 3.2; // the HUD's 1.9 outline drawn behind the fill (half of it shows)
        g.stroke(p);
      }
      g.fillStyle = color;
      g.fill(p);
    }
  }
  g.restore();
}

/** A fat outlined arrow from (x0, y0) to (x1, y1). */
export function drawArrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color = WHITE): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  g.save();
  g.translate(x0, y0);
  g.rotate(a);
  const p = new Path2D();
  const head = w * 1.5;
  p.moveTo(0, -w / 2);
  p.lineTo(len - head, -w / 2);
  p.lineTo(len - head, -w * 1.15);
  p.lineTo(len, 0);
  p.lineTo(len - head, w * 1.15);
  p.lineTo(len - head, w / 2);
  p.lineTo(0, w / 2);
  p.closePath();
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = w * 0.55;
  g.stroke(p);
  g.fillStyle = color;
  g.fill(p);
  g.restore();
}

/** A rounded dark panel with a white rim (the HUD chip look). */
export function drawPanel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, rim = WHITE): void {
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fillStyle = PANEL;
  g.fill();
  g.lineWidth = Math.max(4, r * 0.28);
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.roundRect(x + g.lineWidth, y + g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth, r * 0.8);
  g.lineWidth *= 0.6;
  g.strokeStyle = rim;
  g.stroke();
  g.restore();
}

export type BoardShape = 'heart' | 'diamond' | 'square' | 'plus';

/**
 * Board-only shapes for the vault's rule demo. They are deliberately NOT the vault's own shapes
 * (star, moon, ring, triangle), so the demo shows the rule and never the answer.
 */
export function drawShape(g: CanvasRenderingContext2D, kind: BoardShape, x: number, y: number, r: number, color = WHITE, outline = true): void {
  const p = new Path2D();
  if (kind === 'heart') {
    p.moveTo(x, y + r * 0.95);
    p.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.75, y - r * 1.25, x, y - r * 0.45);
    p.bezierCurveTo(x + r * 0.75, y - r * 1.25, x + r * 1.5, y - r * 0.1, x, y + r * 0.95);
  } else if (kind === 'diamond') {
    p.moveTo(x, y - r * 1.1);
    p.lineTo(x + r * 0.8, y);
    p.lineTo(x, y + r * 1.1);
    p.lineTo(x - r * 0.8, y);
  } else if (kind === 'square') {
    p.roundRect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6, r * 0.2);
  } else {
    const t = r * 0.36;
    p.moveTo(x - t, y - r);
    p.lineTo(x + t, y - r);
    p.lineTo(x + t, y - t);
    p.lineTo(x + r, y - t);
    p.lineTo(x + r, y + t);
    p.lineTo(x + t, y + t);
    p.lineTo(x + t, y + r);
    p.lineTo(x - t, y + r);
    p.lineTo(x - t, y + t);
    p.lineTo(x - r, y + t);
    p.lineTo(x - r, y - t);
    p.lineTo(x - t, y - t);
  }
  p.closePath();
  g.save();
  g.lineJoin = 'round';
  if (outline) {
    g.strokeStyle = INK;
    g.lineWidth = r * 0.32;
    g.stroke(p);
  }
  g.fillStyle = color;
  g.fill(p);
  g.restore();
}

/** Small round pips (1, 2, 3...) as an order mark without numbers. */
export function drawPips(g: CanvasRenderingContext2D, n: number, x: number, y: number, r: number, color = WHITE): void {
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.arc(x + (i - (n - 1) / 2) * r * 2.8, y, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.strokeStyle = INK;
    g.lineWidth = r * 0.6;
    g.stroke();
    g.fill();
  }
}

/** A canvas of `w` × `h` px with a 2D context (throws only if the browser has no 2D canvas). */
export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2D canvas');
  return { canvas, g };
}
