import { describe, expect, it } from 'vitest';
import { layoutMarkers, MARKER_WIDTH, minSpacing, pickFocus, STRIP_END_PAD } from '../../src/ui/compassLayout';
import type { LayoutInput } from '../../src/ui/compassLayout';

const deg = (d: number): number => (d * Math.PI) / 180;
const HALF = 24; // 640x360 strip half width in HUD units

function build(rels: number[]): LayoutInput[] {
  const f = pickFocus(rels.map((rel) => ({ rel, dist: 50 })));
  return rels.map((rel, i) => ({ rel, focus: i === f }));
}

describe('compass layout', () => {
  const crowded = [deg(2), deg(-3), deg(5), deg(8), deg(-6), deg(12)];

  it('never puts two markers closer than the minimum spacing, and keeps bearing order', () => {
    const items = build(crowded);
    const out = layoutMarkers(items, HALF);
    const idx = items.map((_, i) => i).sort((a, b) => items[a].rel - items[b].rel);
    for (let k = 0; k + 1 < idx.length; k++) {
      const a = out[idx[k]];
      const b = out[idx[k + 1]];
      expect(b.x - a.x).toBeGreaterThanOrEqual(minSpacing(a.size, b.size) - 1e-6);
      expect(b.x).toBeGreaterThan(a.x);
    }
    for (const o of out) expect(Math.abs(o.x)).toBeLessThanOrEqual(HALF - STRIP_END_PAD + 1e-6);
  });

  it('holds with many random bearings, including pinned ones', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rnd() * 6);
      const rels = Array.from({ length: n }, () => (rnd() - 0.5) * Math.PI * 2);
      const out = layoutMarkers(build(rels), HALF);
      const sorted = [...out].sort((a, b) => a.x - b.x);
      for (let k = 0; k + 1 < sorted.length; k++) {
        expect(sorted[k + 1].x - sorted[k].x).toBeGreaterThanOrEqual(minSpacing(sorted[k].size, sorted[k + 1].size) - 1e-6);
      }
    }
  });

  it('keeps an uncrowded marker at its true bearing and does not shrink it', () => {
    const out = layoutMarkers([{ rel: 0, focus: true }, { rel: deg(70), focus: false }], HALF);
    expect(out[0].x).toBeCloseTo(0, 6);
    expect(out[0].size).toBe('lg');
    expect(out[1].size).toBe('md');
    expect(out[1].x).toBeGreaterThan(out[0].x);
  });

  it('focuses the marker nearest the centre, enlarged, and shrinks the rest when crowded', () => {
    const items = build(crowded);
    const out = layoutMarkers(items, HALF);
    const focusIdx = items.findIndex((i) => i.focus);
    const nearest = crowded.reduce((b, r, i) => (Math.abs(r) < Math.abs(crowded[b]) ? i : b), 0);
    expect(focusIdx).toBe(nearest);
    expect(out[focusIdx].size).toBe('lg');
    out.forEach((o, i) => {
      if (i !== focusIdx) expect(o.size).toBe('sm');
    });
    expect(MARKER_WIDTH.sm).toBeLessThan(MARKER_WIDTH.md);
  });

  it('stacks pinned markers at the ends with one arrow on the outermost', () => {
    const rels = [deg(150), deg(170), deg(-160), deg(0)];
    const out = layoutMarkers(build(rels), HALF);
    expect(out[0].clamped && out[1].clamped && out[2].clamped).toBe(true);
    expect(out[3].clamped).toBe(false);
    // Right stack: the larger bearing (further behind) is outermost and carries the arrow.
    expect(out[1].x).toBeGreaterThan(out[0].x);
    expect(out[1].arrow).toBe(1);
    expect(out[0].arrow).toBe(0);
    expect(out[2].arrow).toBe(-1);
    expect(out[3].arrow).toBe(0);
  });

  it('focus hysteresis keeps the previous marker for near-equal bearings', () => {
    const items = [{ rel: deg(5), dist: 10 }, { rel: deg(3), dist: 10 }];
    expect(pickFocus(items)).toBe(1);
    expect(pickFocus(items, 0)).toBe(0);
    expect(pickFocus([{ rel: deg(5), dist: 10 }, { rel: deg(-10), dist: 10 }], 1)).toBe(0);
  });
});
