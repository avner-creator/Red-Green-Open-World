/** Pure layout maths for Pip's bubble: above the anchor, inside the safe area, off the hero. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  x: number;
  y: number;
  /** Bubble sits below the anchor (tail on top). */
  below: boolean;
  /** Tail x, relative to the bubble's left edge. */
  tail: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Place a `w`×`h` bubble whose tail points at `anchor` (screen px). `gap` = tail length.
 * Tries above the anchor, then shifted sideways away from the hero, then below; always clamped
 * inside `bounds`. The tail x is clamped so it stays on the bubble's rounded body.
 */
export function placeBubble(
  anchor: { x: number; y: number },
  w: number,
  h: number,
  bounds: Rect,
  hero: Rect | null,
  gap: number,
  avoid: readonly Rect[] = [],
): Placement {
  const minX = bounds.x;
  const maxX = bounds.x + bounds.w - w;
  const minY = bounds.y;
  const maxY = bounds.y + bounds.h - h;
  const cands: { x: number; y: number; below: boolean }[] = [];
  const above = { x: clamp(anchor.x - w / 2, minX, maxX), y: clamp(anchor.y - gap - h, minY, maxY), below: false };
  cands.push(above);
  if (hero) {
    // Slide sideways, away from the hero's centre.
    const heroCx = hero.x + hero.w / 2;
    const leftX = hero.x - w - 4;
    const rightX = hero.x + hero.w + 4;
    const prefRight = anchor.x >= heroCx;
    for (const x of prefRight ? [rightX, leftX] : [leftX, rightX]) cands.push({ x: clamp(x, minX, maxX), y: above.y, below: false });
    // Above the hero's head.
    cands.push({ x: above.x, y: clamp(hero.y - h - gap, minY, maxY), below: false });
  }
  cands.push({ x: above.x, y: clamp(anchor.y + gap, minY, maxY), below: true });
  // Also beside the anchor (left / right), for when HUD pieces sit above and below it.
  const sideY = clamp(anchor.y - h / 2, minY, maxY);
  cands.push({ x: clamp(anchor.x + gap, minX, maxX), y: sideY, below: false });
  cands.push({ x: clamp(anchor.x - gap - w, minX, maxX), y: sideY, below: false });
  // Score: hero overlap is worst, then the area covered on HUD pieces; first best candidate wins.
  const cost = (c: { x: number; y: number }): number => {
    const r = { x: c.x, y: c.y, w, h };
    let k = hero && overlaps(r, hero) ? 1e9 : 0;
    for (const a of avoid) {
      const ox = Math.min(r.x + r.w, a.x + a.w) - Math.max(r.x, a.x);
      const oy = Math.min(r.y + r.h, a.y + a.h) - Math.max(r.y, a.y);
      if (ox > 0 && oy > 0) k += ox * oy;
    }
    return k;
  };
  let pick = cands[0];
  let best = cost(pick);
  for (const c of cands) {
    if (best === 0) break;
    const k = cost(c);
    if (k < best) {
      best = k;
      pick = c;
    }
  }
  const r = Math.min(h / 2, 28);
  const tail = clamp(anchor.x - pick.x, r, w - r);
  return { x: pick.x, y: pick.y, below: pick.below, tail };
}
