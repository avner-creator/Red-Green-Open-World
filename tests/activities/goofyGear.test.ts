import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GEAR_CATALOG } from '../../src/activities/gear/catalog';
import { gearFit } from '../../src/activities/gear/fit';
import { GIFT_ITEM, GOOFY, GOOFY_ITEMS } from '../../src/activities/gear/goofy';
import { drawCalls, triangles } from '../../src/activities/gear/goofy/kit';
import { buildGear } from '../../src/activities/gear/models';
import { CHARACTERS } from '../../src/core/characters/catalog';

describe('goofy wardrobe catalog', () => {
  it('has at least 30 new items with unique ids, a price, a slot, a category and an icon', () => {
    expect(GOOFY.length).toBeGreaterThanOrEqual(30);
    const all = GEAR_CATALOG.map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
    for (const it of GOOFY_ITEMS) {
      expect(['head', 'face', 'back']).toContain(it.slot);
      expect(it.category).toBe('outfit');
      expect(typeof it.icon).toBe('string');
      expect(it.price).toBeGreaterThanOrEqual(0);
      expect(it.price).toBeLessThanOrEqual(100);
      expect(it.name.length).toBeGreaterThan(2);
    }
  });

  it('six are free from the start, the gift is cheap, and prices ramp gently', () => {
    const free = GOOFY_ITEMS.filter((i) => i.price === 0);
    expect(free.length).toBeGreaterThanOrEqual(6);
    expect(new Set(free.map((i) => i.slot)).size).toBe(3);
    expect(GOOFY_ITEMS.find((i) => i.id === GIFT_ITEM)?.price).toBeLessThanOrEqual(5);
    expect(GOOFY_ITEMS.filter((i) => i.price > 0 && i.price <= 8).length).toBeGreaterThanOrEqual(6);
    expect(GOOFY_ITEMS.filter((i) => i.price >= 40).length).toBeGreaterThanOrEqual(4);
  });

  it('every item builds, animates, stays in budget (≤ 1.5k triangles, ≤ 2 draws) and disposes', () => {
    for (const g of GOOFY) {
      const w = buildGear(g.id);
      expect(w, g.id).not.toBeNull();
      if (!w) continue;
      for (let i = 0; i < 30; i++) w.update?.(1 / 60, i < 15 ? 6 : 0);
      expect(triangles(w.object), g.id).toBeLessThanOrEqual(1500);
      expect(drawCalls(w.object), g.id).toBeLessThanOrEqual(2);
      w.object.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(w.object);
      expect(b.isEmpty(), g.id).toBe(false);
      // Sized for a head/face/back: never a building.
      expect(b.getSize(new THREE.Vector3()).length(), g.id).toBeLessThan(2.4);
      w.dispose();
    }
  });

  it('head and face items are centred left/right; back items stay behind the torso', () => {
    for (const g of GOOFY) {
      const w = buildGear(g.id)!;
      w.object.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(w.object);
      if (g.slot !== 'back') expect(Math.abs((b.min.x + b.max.x) / 2), g.id).toBeLessThan(0.12);
      else expect(b.max.z, g.id).toBeLessThan(0.12);
      w.dispose();
    }
  });

  it('every item reads by brightness in the R channel alone and the G channel alone', () => {
    for (const g of GOOFY) {
      const w = buildGear(g.id)!;
      let rMin = 1, rMax = 0, gMin = 1, gMax = 0;
      w.object.traverse((o) => {
        const c = (o as THREE.Mesh).geometry?.getAttribute('color');
        if (!c) return;
        for (let i = 0; i < c.count; i++) {
          rMin = Math.min(rMin, c.getX(i));
          rMax = Math.max(rMax, c.getX(i));
          gMin = Math.min(gMin, c.getY(i));
          gMax = Math.max(gMax, c.getY(i));
        }
      });
      // Bright parts against darker ones in each channel (baked light included), or a solid dark
      // silhouette (a moustache) that reads against every hero's lighter face.
      const reads = (lo: number, hi: number): boolean => hi - lo > 0.3 || hi < 0.25;
      expect(reads(rMin, rMax), `${g.id} R ${rMin}..${rMax}`).toBe(true);
      expect(reads(gMin, gMax), `${g.id} G ${gMin}..${gMax}`).toBe(true);
      w.dispose();
    }
  });

  it('every hero has head, face and back anchors; unknown heroes fall back to the anchor alone', () => {
    for (const c of CHARACTERS) {
      for (const part of ['head', 'face', 'back'] as const) expect(c.attach[part], `${c.id} ${part}`).toBeDefined();
      for (const g of GOOFY) {
        const f = gearFit(c.id, g.slot, g.id);
        if (f?.scale !== undefined) expect(f.scale).toBeGreaterThan(0.3);
      }
    }
    expect(gearFit('a-hero-from-another-branch', 'head', 'hat-cone')).toBeNull();
  });
});
