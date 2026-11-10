/**
 * Bold pictogram shapes a child can name, as pure masks on [-1, 1]² (y up), and a rasteriser to a
 * cell grid. Used by the red-green dot pictures (no DOM, unit-testable).
 */

export type ShapeId = 'star' | 'heart' | 'circle' | 'triangle' | 'square' | 'arrow' | 'moon' | 'fish';
export const SHAPE_IDS: readonly ShapeId[] = ['star', 'heart', 'circle', 'triangle', 'square', 'arrow', 'moon', 'fish'];

type Pt = readonly [number, number];

function inPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const STAR: Pt[] = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 0.4 : 0.92;
  const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r - 0.06] as const;
});
const TRIANGLE: Pt[] = [[0, 0.82], [0.88, -0.7], [-0.88, -0.7]];
const ARROW: Pt[] = [[-0.82, -0.26], [0.08, -0.26], [0.08, -0.66], [0.86, 0], [0.08, 0.66], [0.08, 0.26], [-0.82, 0.26]];
const FISH_TAIL: Pt[] = [[0.25, 0], [0.88, 0.5], [0.88, -0.5]];

/** Is the point (x, y) in [-1, 1]² (y up) inside the shape? */
export function shapeContains(id: ShapeId, x: number, y: number): boolean {
  switch (id) {
    case 'circle':
      return x * x + y * y <= 0.8 * 0.8;
    case 'square':
      return Math.abs(x) <= 0.72 && Math.abs(y) <= 0.72;
    case 'triangle':
      return inPolygon(x, y, TRIANGLE);
    case 'star':
      return inPolygon(x, y, STAR);
    case 'arrow':
      return inPolygon(x, y, ARROW);
    case 'heart': {
      const X = x * 1.42;
      const Y = (y + 0.08) * 1.42;
      const a = X * X + Y * Y - 1;
      return a * a * a - X * X * Y * Y * Y <= 0;
    }
    case 'moon': {
      const outer = x * x + y * y <= 0.84 * 0.84;
      const bx = x - 0.42;
      const by = y - 0.2;
      return outer && bx * bx + by * by > 0.66 * 0.66;
    }
    case 'fish': {
      const ex = (x + 0.2) / 0.6;
      const ey = y / 0.42;
      return ex * ex + ey * ey <= 1 || inPolygon(x, y, FISH_TAIL);
    }
  }
}

/**
 * Rasterise a shape on an `n × n` grid (cell centres). Row-major, row 0 at the TOP.
 * Returns 1 inside, 0 outside.
 */
export function rasterizeShape(id: ShapeId, n: number): Uint8Array {
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const y = 1 - ((j + 0.5) * 2) / n;
    for (let i = 0; i < n; i++) {
      const x = -1 + ((i + 0.5) * 2) / n;
      out[j * n + i] = shapeContains(id, x, y) ? 1 : 0;
    }
  }
  return out;
}
