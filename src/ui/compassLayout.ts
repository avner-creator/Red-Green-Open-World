/** Strip layout for the icon compass: keeps crowded markers readable (pure maths, unit tested). */
import { pickHighlight, stripPosition, STRIP_EDGE, wrapAngle } from './compassMath';
import type { Candidate } from './compassMath';

export type MarkerSize = 'lg' | 'md' | 'sm';
/** Marker diameters in strip units (the HUD scale `--u`). */
export const MARKER_WIDTH: Record<MarkerSize, number> = { lg: 7.2, md: 4.8, sm: 3.6 };
/** Clear space kept between neighbouring markers. */
export const MARKER_GAP = 0.5;
/** Room kept between the strip end and a marker centre (marker radius plus its arrow). */
export const STRIP_END_PAD = 4.6;

export interface LayoutInput {
  /** Bearing relative to the camera, radians. */
  rel: number;
  /** The marker that is enlarged (with distance dots). */
  focus: boolean;
}

export interface LayoutOutput {
  /** Centre offset from the middle of the strip, in strip units. */
  x: number;
  size: MarkerSize;
  clamped: boolean;
  /** Arrow direction: only the outermost marker of each pinned stack gets one. */
  arrow: -1 | 0 | 1;
}

/** Minimum centre-to-centre distance for two markers of these sizes. */
export function minSpacing(a: MarkerSize, b: MarkerSize): number {
  return (MARKER_WIDTH[a] + MARKER_WIDTH[b]) / 2 + MARKER_GAP;
}

function relax(targets: number[], sizes: MarkerSize[], weights: number[], lo: number, hi: number): number[] {
  const n = targets.length;
  const p = targets.map((t) => Math.min(hi, Math.max(lo, t)));
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i + 1 < n; i++) {
      const over = minSpacing(sizes[i], sizes[i + 1]) - (p[i + 1] - p[i]);
      if (over > 1e-6) {
        // The heavier (focused) marker moves less.
        const wi = 1 / weights[i];
        const wj = 1 / weights[i + 1];
        p[i] -= (over * wi) / (wi + wj);
        p[i + 1] += (over * wj) / (wi + wj);
        moved = true;
      }
    }
    for (let i = 0; i < n; i++) p[i] = Math.min(hi, Math.max(lo, p[i]));
    if (!moved) break;
  }
  // Guarantee the spacing exactly (also inside the end stacks): sweep forward, then back.
  for (let i = 1; i < n; i++) p[i] = Math.max(p[i], p[i - 1] + minSpacing(sizes[i - 1], sizes[i]));
  for (let i = n - 2; i >= 0; i--) p[i] = Math.min(p[i], p[i + 1] - minSpacing(sizes[i], sizes[i + 1]));
  return p;
}

/**
 * Lay markers out on a strip `halfWidth` units wide on each side. Markers are sorted by bearing;
 * a 1-D relaxation pushes them apart to their minimum spacing while keeping order and staying near
 * the true bearing (the focused one moves least). If they are still pushed far, the non-focused
 * ones shrink. Pinned (off-strip) markers stack at the ends. Results are in the order of `items`.
 */
export function layoutMarkers(items: readonly LayoutInput[], halfWidth: number): LayoutOutput[] {
  const n = items.length;
  if (n === 0) return [];
  const edge = Math.max(0, halfWidth - STRIP_END_PAD);
  const info = items.map((it) => {
    const sp = stripPosition(it.rel);
    const r = wrapAngle(it.rel);
    // Free markers sort by bearing; pinned ones sit beyond them on their own side.
    const key = sp.clamped ? sp.side * 10 + r : r;
    return { it, sp, key, target: (sp.x / STRIP_EDGE) * edge };
  });
  const order = info.map((_, i) => i).sort((a, b) => info[a].key - info[b].key);
  const targets = order.map((i) => info[i].target);
  const weights = order.map((i) => (info[i].it.focus ? 4 : 1));
  const baseSizes: MarkerSize[] = order.map((i) => (info[i].it.focus ? 'lg' : 'md'));

  let sizes = baseSizes;
  let pos = relax(targets, sizes, weights, -edge, edge);
  const crowded = pos.some((x, k) => Math.abs(x - targets[k]) > MARKER_WIDTH.md * 0.9);
  if (crowded) {
    sizes = baseSizes.map((s) => (s === 'lg' ? 'lg' : 'sm'));
    pos = relax(targets, sizes, weights, -edge, edge);
  }

  const out = new Array<LayoutOutput>(n);
  const leftPinned = order.filter((i) => info[i].sp.clamped && info[i].sp.side < 0);
  const rightPinned = order.filter((i) => info[i].sp.clamped && info[i].sp.side > 0);
  order.forEach((i, k) => {
    const sp = info[i].sp;
    let arrow: -1 | 0 | 1 = 0;
    if (sp.clamped && sp.side < 0 && i === leftPinned[0]) arrow = -1;
    if (sp.clamped && sp.side > 0 && i === rightPinned[rightPinned.length - 1]) arrow = 1;
    out[i] = { x: pos[k], size: sizes[k], clamped: sp.clamped, arrow };
  });
  return out;
}

/** Focus choice with a little hysteresis so two near-equal bearings do not flicker. */
export function pickFocus(items: readonly Candidate[], previous = -1): number {
  const best = pickHighlight(items);
  if (best < 0 || previous < 0 || previous >= items.length || previous === best) return best;
  const prevRel = Math.abs(wrapAngle(items[previous].rel));
  const bestRel = Math.abs(wrapAngle(items[best].rel));
  const limit = (22 * Math.PI) / 180;
  if (prevRel < limit && prevRel - bestRel < (3 * Math.PI) / 180) return previous;
  return best;
}
