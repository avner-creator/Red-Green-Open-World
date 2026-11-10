import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import { arcPoint, solveLaunch, stepVertical, timeToLand, timeToReach } from '../../src/activities/ballistics';
import { NET, ROCKET } from '../../src/activities/constants';
import { findNetSite, siteOk } from '../../src/activities/rocketSite';
import type { SiteWorld } from '../../src/activities/rocketSite';

const G = PLAYER.gravity;

describe('ballistic launch solver', () => {
  const cases = [
    { name: 'level', dy: 0 },
    { name: 'net 3 m below the pad', dy: -3 },
    { name: 'net 6 m above the pad', dy: 6 },
    { name: 'net 12 m above', dy: 12 },
    { name: 'net 20 m below', dy: -20 },
  ];
  for (const c of cases) {
    it(`hits the target within 1.5 m: ${c.name}`, () => {
      for (const d of [20, 45, 60, 65]) {
        const dx = d * 0.8;
        const dz = d * 0.6;
        const apex = ROCKET.apexBase + ROCKET.apexPerMetre * d;
        const s = solveLaunch(dx, c.dy, dz, apex);
        const p = arcPoint({ x: 0, y: 0, z: 0 }, s, s.time);
        expect(Math.hypot(p.x - dx, p.z - dz)).toBeLessThan(1.5);
        expect(Math.abs(p.y - c.dy)).toBeLessThan(1.5);
      }
    });
  }

  it('a 60 m rocket is a high arc (apex 25 m+) with a sensible speed', () => {
    const s = solveLaunch(60, 0, 0, ROCKET.apexBase + ROCKET.apexPerMetre * 60);
    expect(s.apex).toBeGreaterThan(25);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(30);
    expect(s.time).toBeGreaterThan(2.5);
  });

  it('raises the apex when the target is higher than it', () => {
    const s = solveLaunch(10, 15, 0, 5);
    expect(s.apex).toBeGreaterThan(15);
    expect(Number.isFinite(s.time)).toBe(true);
  });

  it('time to reach is the descending root', () => {
    const vy = Math.sqrt(2 * G * 10);
    expect(timeToReach(vy, 0)).toBeCloseTo((2 * vy) / G, 9);
    expect(timeToReach(vy, 11)).toBeNaN();
  });

  it('time to land counts down to zero', () => {
    const vy = Math.sqrt(2 * G * 10);
    expect(timeToLand(0, vy, 0)).toBeCloseTo((2 * vy) / G, 9);
    expect(timeToLand(10, 0, 0)).toBeCloseTo(Math.sqrt((2 * 10) / G), 9);
    expect(timeToLand(0, 0, 5)).toBe(0);
  });
});

describe('vertical stepping', () => {
  it('integrates a whole arc and arrives exactly on the end height', () => {
    for (const dt of [1 / 60, 1 / 30, 1 / 20]) {
      let y = 0;
      let vy = Math.sqrt(2 * G * 45);
      let t = 0;
      let peak = 0;
      let arrived = false;
      for (let i = 0; i < 1000 && !arrived; i++) {
        const s = stepVertical(y, vy, dt, 0);
        y = s.y;
        vy = s.vy;
        t += s.used;
        peak = Math.max(peak, y);
        arrived = s.arrived;
      }
      expect(arrived).toBe(true);
      expect(y).toBe(0);
      expect(peak).toBeGreaterThan(44.5);
      expect(peak).toBeLessThanOrEqual(45.001);
      expect(t).toBeCloseTo((2 * Math.sqrt(2 * G * 45)) / G, 3);
    }
  });

  it('does not arrive while still rising from the end height', () => {
    expect(stepVertical(0, 20, 1 / 60, 0).arrived).toBe(false);
  });
});

describe('net site search', () => {
  const flat = (over: Partial<SiteWorld> = {}): SiteWorld => ({
    heightAt: () => 2,
    isLand: () => true,
    keepClear: [],
    ...over,
  });

  it('picks the preferred 60 m on open flat land, straight ahead', () => {
    const s = findNetSite(flat(), { x: 0, z: 0 }, 0);
    expect(s).not.toBeNull();
    expect(s?.distance).toBe(60);
    expect(s?.shortened).toBe(false);
    expect(s?.x).toBeCloseTo(0);
    expect(s?.z).toBeCloseTo(60);
  });

  it('follows the anchor yaw', () => {
    const s = findNetSite(flat(), { x: 0, z: 0 }, Math.PI / 2);
    expect(s?.x).toBeCloseTo(60);
    expect(s?.z).toBeCloseTo(0);
  });

  it('skips water: lands on the dry stretch', () => {
    const w = flat({ isLand: (_x, z) => z < 52 || z > 70 });
    const s = findNetSite(w, { x: 0, z: 0 }, 0);
    expect(s).not.toBeNull();
    expect(s && s.distance >= 45 && s.distance <= 65).toBe(true);
    expect(s && w.isLand(s.x, s.z)).toBe(true);
  });

  it('rejects sloped ground and blocked props', () => {
    expect(siteOk(flat({ heightAt: (x) => x * 0.5 }), 0, 0)).toBe(false);
    expect(siteOk(flat({ blocked: () => true }), 0, 0)).toBe(false);
    expect(siteOk(flat(), 0, 0)).toBe(true);
  });

  it('keeps clear of other attractions', () => {
    const w = flat({ keepClear: [{ x: 0, z: 60, radius: 10 }] });
    const s = findNetSite(w, { x: 0, z: 0 }, 0);
    expect(s).not.toBeNull();
    const d = Math.hypot((s?.x ?? 0) - 0, (s?.z ?? 0) - 60);
    expect(d).toBeGreaterThanOrEqual(10 + NET.radius + NET.anchorClearance);
  });

  it('shortens the arc when nothing flat exists at 45 m or more', () => {
    const w = flat({ isLand: (x, z) => Math.hypot(x, z) < 38 });
    const s = findNetSite(w, { x: 0, z: 0 }, 0);
    expect(s?.shortened).toBe(true);
    expect(s && s.distance < 45).toBe(true);
  });

  it('returns null when there is no flat land at all', () => {
    expect(findNetSite(flat({ isLand: () => false }), { x: 0, z: 0 }, 0)).toBeNull();
  });
});
