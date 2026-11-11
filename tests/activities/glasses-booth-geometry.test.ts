/**
 * Booth kit, pure parts: the atlas layout (cells never overlap, UVs inside the atlas), the device
 * pictogram choice, and the booth geometry (ONE non-indexed mesh, addressable quads, triangle
 * budget, colliders).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  bannerUv, BCELL, BOOTH_ATLAS, cellPx, cellUv, countCell, DEMO_MAX_FRAMES, DEMO_SLOTS, demoCell, deviceFor, deviceUv, DEVICES, footprintsUv, KIT_CELL,
  LAMP_STATES, lampUv, PROMPTS, promptCell, SWATCH_ORDER, swatchPx, swatchUv,
} from '../../src/activities/glasses/booth/cells';
import { buildBoothGeometry, placeQuad, setSlotColor, setSlotUv } from '../../src/activities/glasses/booth/geometry';
import type { BoothSpec } from '../../src/activities/glasses/booth/types';
import { GATE_BOOTH } from '../../src/activities/glasses/gates/constants';

const inside = (r: readonly number[]): boolean => r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 1 && r[1] + r[3] <= 1 && r[2] > 0 && r[3] > 0;

describe('booth atlas layout', () => {
  it('demo slots, kit cells and prompts are distinct cells of the 8 × 8 grid', () => {
    const used = new Map<number, string>();
    const take = (c: number, what: string): void => {
      expect(used.has(c), `${what} overlaps ${used.get(c)}`).toBe(false);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(64);
      used.set(c, what);
    };
    for (let s = 0; s < DEMO_SLOTS; s++) for (let f = 0; f < DEMO_MAX_FRAMES; f++) take(demoCell(s, f), `demo ${s}/${f}`);
    for (const [k, c] of Object.entries(KIT_CELL)) {
      take(c, k);
      if (k === 'banner') for (let i = 1; i < 4; i++) take(c + i, `banner+${i}`);
    }
    for (const p of PROMPTS) take(promptCell(p), `prompt ${p}`);
    expect(used.size).toBe(64);
    // The banner's four cells are one row.
    expect(cellPx(KIT_CELL.banner)[1]).toBe(cellPx(KIT_CELL.banner + 3)[1]);
    expect(() => demoCell(6, 0)).toThrow();
    expect(() => demoCell(0, 6)).toThrow();
  });

  it('every UV rect lies inside the atlas and inside its own cell', () => {
    const rects = [
      ...[...Array(64).keys()].map((c) => cellUv(c)),
      bannerUv(),
      ...LAMP_STATES.map(lampUv),
      ...DEVICES.map(deviceUv),
      footprintsUv(),
      ...SWATCH_ORDER.map(swatchUv),
    ];
    for (const r of rects) expect(inside(r), JSON.stringify(r)).toBe(true);
    for (const s of SWATCH_ORDER) {
      const [x, y, w, h] = swatchPx(s);
      const r = swatchUv(s);
      expect(r[0] * BOOTH_ATLAS).toBeGreaterThan(x);
      expect((r[0] + r[2]) * BOOTH_ATLAS).toBeLessThan(x + w);
      expect((1 - r[1]) * BOOTH_ATLAS).toBeLessThan(y + h);
      expect((1 - r[1] - r[3]) * BOOTH_ATLAS).toBeGreaterThan(y);
    }
    // Lamp states and device pictograms are four different quarters.
    expect(new Set(LAMP_STATES.map((s) => lampUv(s).join())).size).toBe(4);
    expect(new Set([...DEVICES.map((d) => deviceUv(d).join()), footprintsUv().join()]).size).toBe(4);
    expect(BCELL * 8).toBe(BOOTH_ATLAS);
  });

  it('countdown cells: 3, 2, 1, GO', () => {
    expect([3, 2, 1, 0].map(countCell)).toEqual([KIT_CELL.digit3, KIT_CELL.digit2, KIT_CELL.digit1, KIT_CELL.go]);
  });

  it('the pad shows the pictogram of the device in use (keyboard by default)', () => {
    expect(deviceFor('keyboard')).toBe('keyboard');
    expect(deviceFor('gamepad')).toBe('gamepad');
    expect(deviceFor('touch')).toBe('touch');
    expect(deviceFor(undefined)).toBe('keyboard');
    expect(deviceFor('mouse')).toBe('keyboard');
  });
});

const SPEC: BoothSpec = {
  marquee: { x: -3, z: 0, yaw: 0.4 },
  lamps: 5,
  pad: { x: 0, z: 2, walkIn: false },
  playPrompt: 'press',
  decals: [{ kind: 'chevron', x: 0, z: 0, size: 1, yaw: 0 }, { kind: 'footprints', x: 1, z: 1, size: 0.8, yaw: 0.3 }],
};

describe('booth geometry', () => {
  it('one non-indexed geometry with position, normal, uv and colour; addressable quads', () => {
    const b = buildBoothGeometry(SPEC);
    const g = b.geometry;
    expect(g.index).toBeNull();
    for (const a of ['position', 'normal', 'uv', 'color']) expect(g.getAttribute(a), a).toBeTruthy();
    expect(g.groups.length).toBe(0); // one material, one draw call
    const count = g.getAttribute('position').count;
    const names = ['demo', 'padFace', 'padGlow', 'device', 'prompt', 'lamp0', 'lamp1', 'lamp2', 'lamp3', 'lamp4'];
    expect([...b.slots.keys()].sort()).toEqual([...names].sort());
    const ranges = [...b.slots.values()].map((s) => [s.start, s.start + s.count]).sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < ranges.length; i++) {
      expect(ranges[i][1]).toBeLessThanOrEqual(count);
      if (i > 0) expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1]);
    }
    for (const n of ['demo', 'device', 'prompt', 'lamp0']) expect(b.slots.get(n)!.count, n).toBe(6);
    expect(b.colliders).toHaveLength(3);
  });

  it('stays within the triangle budget (≤ 1,500), also with 6 lamps', () => {
    for (const lamps of [3, 5, 6]) {
      const b = buildBoothGeometry({ ...SPEC, lamps });
      expect(b.triangles, `${lamps} lamps`).toBeLessThanOrEqual(1500);
    }
    const gates = buildBoothGeometry(GATE_BOOTH);
    console.info(`gates booth: ${gates.triangles} triangles`);
    expect(gates.triangles).toBeLessThanOrEqual(1500);
  });

  it('rewriting a quad touches only its own vertices', () => {
    const b = buildBoothGeometry(SPEC);
    const uv = b.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const col = b.geometry.getAttribute('color') as THREE.BufferAttribute;
    const pos = b.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = b.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const before = { uv: Float32Array.from(uv.array as Float32Array), col: Float32Array.from(col.array as Float32Array), pos: Float32Array.from(pos.array as Float32Array) };
    const s = b.slots.get('lamp2')!;
    setSlotUv(uv, s, lampUv('hit'));
    setSlotColor(col, s, 1.7);
    placeQuad(pos, nor, s, new THREE.Vector3(1, 2, 3), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0);
    const changed = (a: Float32Array, b0: Float32Array, k: number): number[] => {
      const out = new Set<number>();
      for (let i = 0; i < a.length; i++) if (a[i] !== b0[i]) out.add(Math.floor(i / k));
      return [...out];
    };
    for (const v of changed(uv.array as Float32Array, before.uv, 2)) expect(v >= s.start && v < s.start + s.count).toBe(true);
    for (const v of changed(col.array as Float32Array, before.col, 3)) expect(v >= s.start && v < s.start + s.count).toBe(true);
    for (const v of changed(pos.array as Float32Array, before.pos, 3)) expect(v >= s.start && v < s.start + s.count).toBe(true);
    // Collapsed: all six vertices at one point (no area, nothing drawn).
    for (let i = s.start; i < s.start + s.count; i++) expect([pos.getX(i), pos.getY(i), pos.getZ(i)]).toEqual([1, 2, 3]);
    // The new UVs are inside the 'hit' lamp quarter.
    const r = lampUv('hit');
    for (let i = s.start; i < s.start + s.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(r[0] - 1e-6);
      expect(uv.getX(i)).toBeLessThanOrEqual(r[0] + r[2] + 1e-6);
    }
  });

  it('follows the ground: the pad sits on the ground under it, the marquee on its lowest foot', () => {
    const b = buildBoothGeometry(SPEC, (x, z) => 0.1 * x + 0.05 * z);
    expect(b.padCenter.y).toBeCloseTo(0.1, 6);
    expect(b.marqueeBox.min.y).toBeLessThan(0);
    expect(b.marqueeBox.max.y).toBeGreaterThan(5.5);
  });
});
