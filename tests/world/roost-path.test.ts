import { describe, expect, it } from 'vitest';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { ANCHORS } from '../../src/world/layout';
import { FINGERPOSTS } from '../../src/world/wayfinding';
import { CONTROLLER } from '../../src/core/tuning';

/**
 * QA round 3: the dragon roost sits ~20 m up the ridge. There must be a walkable route from the
 * north road to it: the roost footpath, with no stretch steeper than the character controller slides
 * on, and a junction fingerpost pointing up it.
 */
describe('dragon roost', () => {
  const t = buildTerrain();
  const h = (x: number, z: number): number => sampleHeight(t, x, z);
  const path = t.roads.find((r) => r.def.id === 'roostPath');
  const north = t.roads.find((r) => r.def.id === 'north');

  it('is reached by the roost path, which leaves the north road', () => {
    expect(path).toBeDefined();
    expect(north).toBeDefined();
    const start = path!.pts[0];
    const end = path!.pts[path!.pts.length - 1];
    const dNorth = Math.min(...north!.pts.map((p) => Math.hypot(p.x - start.x, p.z - start.z)));
    expect(dNorth).toBeLessThan(north!.def.width);
    const roost = ANCHORS.dragonRoost;
    expect(Math.hypot(end.x - roost.x, end.z - roost.z)).toBeLessThan(roost.radius + 2);
  });

  it('can be walked: road → path → roost stays below the slide slope', () => {
    const roost = ANCHORS.dragonRoost;
    const pts = [...path!.pts.map((p) => ({ x: p.x, z: p.z })), { x: roost.x, z: roost.z }];
    const limit = CONTROLLER.slideSlopeDeg - 5;
    let worst = 0;
    const step = 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.ceil(len / step));
      for (let j = 0; j < n; j++) {
        const x0 = a.x + ((b.x - a.x) * j) / n;
        const z0 = a.z + ((b.z - a.z) * j) / n;
        const x1 = a.x + ((b.x - a.x) * (j + 1)) / n;
        const z1 = a.z + ((b.z - a.z) * (j + 1)) / n;
        const run = Math.hypot(x1 - x0, z1 - z0) || 1e-6;
        const deg = (Math.atan2(Math.abs(h(x1, z1) - h(x0, z0)), run) * 180) / Math.PI;
        worst = Math.max(worst, deg);
      }
    }
    expect(worst).toBeLessThan(limit);
  });

  it('has a junction fingerpost by the road pointing up the path', () => {
    const start = path!.pts[0];
    const posts = FINGERPOSTS.filter((p) => p.targets.includes('dragonRoost') && Math.hypot(p.x - start.x, p.z - start.z) < 8);
    expect(posts.length).toBeGreaterThan(0);
  });
});
