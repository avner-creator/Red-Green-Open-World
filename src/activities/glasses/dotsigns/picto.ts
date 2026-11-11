/**
 * Button pictograms of the dot-picture shapes, drawn from the SAME masks the dot pictures use
 * (toolkit `shapeContains`), so the button shape matches the hidden shape exactly. Light fill with
 * a thick near-black outline on a dark navy disc with a light rim (same look as the toolkit's
 * full-symbol boards): reads by brightness alone in R-only and G-only.
 */
import { FULL_SYMBOL_STYLE, shapeContains } from '../../../vision/toolkit';
import type { ShapeId } from '../../../vision/toolkit';

const PX = 256;
/** Shape coordinates [-1, 1] → this many pixels from the centre. */
const SCALE = 84;
const OUTLINE = 11;

/** Pure: inside mask (row 0 at the top) and outline ring of a shape on a `px` grid. */
export function shapeImageMask(shape: ShapeId, px = PX, scale = SCALE, outline = OUTLINE): { inside: Uint8Array; ring: Uint8Array } {
  const inside = new Uint8Array(px * px);
  const c = px / 2;
  for (let j = 0; j < px; j++) {
    const y = (c - (j + 0.5)) / scale;
    for (let i = 0; i < px; i++) inside[j * px + i] = shapeContains(shape, (i + 0.5 - c) / scale, y) ? 1 : 0;
  }
  // Chamfer (3-4) distance to the shape, two passes.
  const BIG = 1e9;
  const d = new Float32Array(px * px);
  for (let k = 0; k < d.length; k++) d[k] = inside[k] ? 0 : BIG;
  for (let j = 0; j < px; j++)
    for (let i = 0; i < px; i++) {
      const k = j * px + i;
      if (i > 0) d[k] = Math.min(d[k], d[k - 1] + 3);
      if (j > 0) {
        d[k] = Math.min(d[k], d[k - px] + 3);
        if (i > 0) d[k] = Math.min(d[k], d[k - px - 1] + 4);
        if (i < px - 1) d[k] = Math.min(d[k], d[k - px + 1] + 4);
      }
    }
  for (let j = px - 1; j >= 0; j--)
    for (let i = px - 1; i >= 0; i--) {
      const k = j * px + i;
      if (i < px - 1) d[k] = Math.min(d[k], d[k + 1] + 3);
      if (j < px - 1) {
        d[k] = Math.min(d[k], d[k + px] + 3);
        if (i < px - 1) d[k] = Math.min(d[k], d[k + px + 1] + 4);
        if (i > 0) d[k] = Math.min(d[k], d[k + px - 1] + 4);
      }
    }
  const ring = new Uint8Array(px * px);
  for (let k = 0; k < d.length; k++) ring[k] = !inside[k] && d[k] <= outline * 3 ? 1 : 0;
  return { inside, ring };
}

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const cache = new Map<ShapeId, HTMLCanvasElement>();

/** A 256 px round button face showing `shape` (cached per shape). */
export function shapeButtonCanvas(shape: ShapeId): HTMLCanvasElement {
  const hit = cache.get(shape);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const g = canvas.getContext('2d');
  if (g) {
    const { inside, ring } = shapeImageMask(shape);
    const img = g.createImageData(PX, PX);
    const rim = hex(FULL_SYMBOL_STYLE.rim);
    const board = hex(FULL_SYMBOL_STYLE.board);
    const fill = hex(FULL_SYMBOL_STYLE.fill);
    const line = hex(FULL_SYMBOL_STYLE.outline);
    const c = PX / 2;
    for (let j = 0; j < PX; j++)
      for (let i = 0; i < PX; i++) {
        const k = j * PX + i;
        const r = Math.hypot(i + 0.5 - c, j + 0.5 - c);
        const col = inside[k] ? fill : ring[k] ? line : r < c - 12 ? board : rim;
        img.data.set([col[0], col[1], col[2], 255], k * 4);
      }
    g.putImageData(img, 0, 0);
  }
  cache.set(shape, canvas);
  return canvas;
}
