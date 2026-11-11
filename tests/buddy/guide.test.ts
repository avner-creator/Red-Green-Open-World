import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Director, STUCK_PUSH_SECONDS, WELCOME_SECONDS } from '../../src/buddy/director';
import type { DirectorSink, DirectorView } from '../../src/buddy/director';
import { LEAD, Leader } from '../../src/buddy/guide';
import type { V2 } from '../../src/buddy/steer';
import { createBuddyStore } from '../../src/buddy/store';
import type { Attraction } from '../../src/buddy/types';

const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

describe('Leader: runs ahead, looks back, waits, fetches', () => {
  it('hops ahead of the hero, waits, and runs on when the hero is close', () => {
    const L = new Leader();
    L.set({ x: 60, z: 0 });
    const pip = { x: 0, z: 1 };
    const hero = { x: 0, z: 0 };
    let o = L.update(0.1, pip, hero)!;
    expect(o.state).toBe('run');
    expect(dist(o.target, hero)).toBeCloseTo(LEAD.hop);
    expect(o.target.x).toBeGreaterThan(0);
    // Pip gets there: waits (look back + bark once) while the hero is far.
    const spot = o.target;
    hero.x = -10;
    o = L.update(0.1, { ...spot }, hero)!;
    expect(o.state).toBe('wait');
    expect(o.startedWaiting).toBe(true);
    o = L.update(0.1, { ...spot }, hero)!;
    expect(o.startedWaiting).toBe(false);
    // Hero comes within 6 m: next hop, further on.
    hero.x = spot.x - 4;
    o = L.update(0.1, { ...spot }, hero)!;
    expect(o.state).toBe('run');
    expect(o.target.x).toBeGreaterThan(spot.x + 5);
  });

  it('runs back to fetch a hero who does not come, and stops at the destination', () => {
    const L = new Leader();
    L.set({ x: 60, z: 0 });
    const hero = { x: 0, z: 0 };
    const spot = L.update(0.1, { x: 0, z: 0 }, hero)!.target;
    hero.x = -20;
    let o = L.update(0.1, spot, hero)!;
    for (let i = 0; i < 60 && o.state === 'wait'; i++) o = L.update(0.1, spot, hero)!;
    expect(o.state).toBe('fetch');
    expect(dist(o.target, hero)).toBeLessThan(2);
    o = L.update(0.1, { x: -19, z: 0 }, hero)!;
    expect(o.state).toBe('run');
    o = L.update(0.1, spot, { x: 57, z: 0 })!;
    expect(o.state).toBe('arrived');
  });

  it('skips hop spots that are not walkable (water)', () => {
    const L = new Leader((_f, p) => p.z > -0.5 || p.x < 2);
    L.set({ x: 60, z: -30 });
    const o = L.update(0.1, { x: 0, z: 0 }, { x: 0, z: 0 })!;
    expect(o.target.z).toBeGreaterThan(-0.5);
  });
});

/**
 * Vision rule: Pip (a both-eye object) must never move towards, look at or point at a weak-eye
 * or strong-eye object. Leading targets only ever come from attraction anchors.
 */
describe('Pip never leads towards layer objects', () => {
  const PLACES: { name: Attraction; x: number; z: number }[] = [
    { name: 'trampoline', x: 58, z: -24 },
    { name: 'bouncePads', x: 84, z: -12 },
    { name: 'balloon', x: 84, z: 64 },
    { name: 'toys', x: -20, z: 30 },
    { name: 'glowflies', x: 40, z: 40 },
  ];

  it('every lead target is an attraction anchor, through the whole tour, rescues and nudges', () => {
    const leads: (V2 | null)[] = [];
    const sink: DirectorSink = {
      say: () => {},
      lead: (t) => leads.push(t),
      celebrate: () => {},
      bark: () => {},
      glasses: () => {},
      goal: () => ({ id: 'g', line: { text: 'x', icon: 'gem' } }),
      anchor: (n) => PLACES.find((p) => p.name === n) ?? null,
      places: () => PLACES,
    };
    const d = new Director(sink, createBuddyStore(false), () => 0.3);
    const v = (o: Partial<DirectorView>): DirectorView => ({
      hero: { x: 0, z: 0 }, heroSpeed: 3, onFoot: true, ride: 'none', nearAttraction: null, chestHint: null,
      keys: { use: 'E', jump: 'Space', skill: 'Q' }, remaining: 300, hasMissions: true, busy: false, ...o,
    });
    const run = (s: number, o: Partial<DirectorView>) => {
      for (let t = 0; t < s; t += 1 / 30) d.update(1 / 30, v(o));
    };
    d.begin(true);
    run(WELCOME_SECONDS + 0.2, {});
    run(2, { heroSpeed: 5, look: 0.2 });
    d.onGem({}); // a gem pickup must not steer Pip anywhere
    run(STUCK_PUSH_SECONDS + 1, { hero: { x: 98, z: -40 }, heroSpeed: 0, pushing: true });
    run(20, { hero: { x: -60, z: 80 }, heroSpeed: 5 });
    run(20, { hero: { x: -60, z: 80 }, heroSpeed: 0 });
    d.update(0.1, v({ hero: { x: 57, z: -23 }, nearAttraction: 'trampoline' }));
    d.onTrampolineApex();
    d.onTrampolineApex();
    d.onChestKey();
    run(12, { hero: { x: 84, z: -12 }, nearAttraction: 'bouncePads', chestHint: 'findSide' });
    run(200, { heroSpeed: 0 });
    const targets = leads.filter((t): t is V2 => t !== null);
    expect(targets.length).toBeGreaterThan(2);
    for (const t of targets) expect(PLACES.some((p) => p.x === t.x && p.z === t.z), JSON.stringify(t)).toBe(true);
  });

  it('the director and the leader have no access to gem, key, lock or layer positions', () => {
    for (const f of ['director.ts', 'guide.ts', 'steer.ts', 'sniff.ts']) {
      const src = readFileSync(`src/buddy/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/gemSpots|chestSpots|keySpot|lockSpot|VisionLayer|WeakOnly|StrongOnly|gemWay|ctx\./);
    }
  });

  it('in the game glue, leading is only set from the director sink (anchors)', () => {
    const src = readFileSync('src/buddy/index.ts', 'utf8');
    const sets = src.match(/leader\.set\(/g) ?? [];
    expect(sets.length).toBe(1);
    const at = src.indexOf('leader.set(');
    expect(src.slice(at - 80, at)).toMatch(/lead\(target, opts\)/);
    // The sink offers no gem / key / lock lookup.
    expect(src).not.toMatch(/gemWay|gemSpots/);
  });
});
