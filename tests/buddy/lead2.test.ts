/**
 * QA round 5 regressions: Pip always makes progress while leading (watchdog, give up → next place),
 * re-invites a child who does nothing without nagging, keeps quiet during attraction games, caps
 * rescues and frees a stuck hero, and never tells a child to press a button at a chest.
 */
import { describe, expect, it } from 'vitest';
import type { Line } from '../../src/buddy/dialogue';
import { Director, RESCUE_CAP, RESCUE_WINDOW } from '../../src/buddy/director';
import type { DirectorSink, DirectorView } from '../../src/buddy/director';
import { LEAD, Leader, planPath } from '../../src/buddy/guide';
import { CHEST, DIZZY, DIZZY_GAP, HOWTO, POOLS } from '../../src/buddy/script';
import type { ScriptLine } from '../../src/buddy/script';
import type { V2 } from '../../src/buddy/steer';
import { createBuddyStore } from '../../src/buddy/store';
import type { Attraction } from '../../src/buddy/types';

const PLACES: { name: Attraction; x: number; z: number }[] = [
  { name: 'trampoline', x: 58, z: -24 },
  { name: 'bouncePads', x: 84, z: -12 },
  { name: 'launchPads', x: 30, z: -60 },
  { name: 'balloon', x: 84, z: 64 },
  { name: 'gearShack', x: 14, z: 2 },
];

function setup() {
  const said: Line[] = [];
  const leads: (V2 | null)[] = [];
  const hops: V2[] = [];
  let now = 0;
  let until = 0;
  const sink: DirectorSink = {
    say: (l) => {
      said.push(l);
      until = now + 3;
    },
    lead: (t) => leads.push(t),
    celebrate: () => {},
    bark: () => {},
    glasses: () => {},
    hop: (t) => hops.push(t),
    goal: () => ({ id: 'g', line: { text: 'Collect 10 Glow Gems!', icon: 'gem' } }),
    anchor: (n) => PLACES.find((p) => p.name === n) ?? null,
    places: () => PLACES,
  };
  const d = new Director(sink, createBuddyStore(false), () => 0);
  const view = (over: Partial<DirectorView> = {}): DirectorView => ({
    hero: { x: 0, z: 0 },
    heroSpeed: 0,
    onFoot: true,
    ride: 'none',
    nearAttraction: null,
    chestHint: null,
    keys: { use: 'E', jump: 'Space', skill: 'Q' },
    remaining: 300,
    hasMissions: true,
    busy: false,
    ...over,
  });
  const play = (seconds: number, over: Partial<DirectorView> = {}, dt = 1 / 30): void => {
    for (let t = 0; t < seconds; t += dt) {
      now += dt;
      d.update(dt, view({ busy: now < until, ...over }));
    }
  };
  /** Story told, trampoline done: the tour now leads to the second place. */
  const pastTrampoline = (): void => {
    d.begin(true);
    play(40);
    play(0.2, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    d.onTrampolineApex();
    d.onTrampolineApex();
  };
  return { d, said, leads, hops, play, pastTrampoline };
}

describe('Leader watchdog (B1): never "run" in place', () => {
  it('no movement for 4 s while running: re-plans to a different hop spot, with a reason', () => {
    const L = new Leader();
    L.set({ x: 60, z: 0 });
    const pip = { x: 0, z: 3 };
    const hero = { x: 0, z: 0 };
    const first = L.update(0.1, pip, hero)!.target;
    let o = L.update(0.1, pip, hero)!;
    for (let t = 0; t < LEAD.stallSeconds + 0.5; t += 0.1) o = L.update(0.1, pip, hero)!;
    expect(o.state).toBe('run');
    expect(L.replans).toBeGreaterThanOrEqual(1);
    expect(L.why).toMatch(/stalled/);
    expect(Math.hypot(o.target.x - first.x, o.target.z - first.z)).toBeGreaterThan(1);
  });

  it('no progress towards the destination for ~10 s of running: gives up', () => {
    const L = new Leader();
    L.set({ x: 60, z: 0 });
    const hero = { x: 0, z: 0 };
    // Pip trots in a little circle (moving, never closer): blocked by something.
    for (let t = 0; t < LEAD.giveUpSeconds + 1; t += 0.1) L.update(0.1, { x: Math.sin(t) * 2, z: Math.cos(t) * 2 }, hero);
    expect(L.gaveUp).toBe(true);
    expect(L.why).toMatch(/unreachable/);
  });

  it('a hero who never follows is fetched again and again, but the lead is not given up', () => {
    const L = new Leader();
    L.set({ x: 60, z: 0 });
    const hero = { x: 0, z: 0 };
    let pip = { x: 0, z: 1 };
    for (let t = 0; t < 150; t += 0.1) {
      const o = L.update(0.1, pip, hero)!;
      // Pip gets wherever he wants at 8 m/s.
      const dx = o.target.x - pip.x;
      const dz = o.target.z - pip.z;
      const d = Math.hypot(dx, dz);
      const k = d > 0.8 ? 0.8 / d : 1;
      pip = { x: pip.x + dx * k, z: pip.z + dz * k };
    }
    expect(L.gaveUp).toBe(false);
  });
});

describe('Director: always progress, re-invite, no nagging', () => {
  it('an unreachable second place: the tour goes on to the next-nearest one', () => {
    const r = setup();
    r.pastTrampoline();
    expect(r.d.leadTo).toBe('bouncePads');
    r.d.leadFailed('unreachable: test');
    expect(r.d.unreachable.has('bouncePads')).toBe(true);
    expect(r.d.leadTo).not.toBeNull();
    expect(r.d.leadTo).not.toBe('bouncePads');
    expect(r.d.why).toMatch(/bouncePads/);
  });

  it('a child who does nothing is re-invited a few times, further apart, then left in peace', () => {
    const r = setup();
    r.pastTrampoline();
    const n = r.said.length;
    r.play(150, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    const inv = r.said.slice(n).filter((l) => l.id === 'guide:invite');
    expect(inv.length).toBeGreaterThanOrEqual(1);
    expect(inv.length).toBeLessThanOrEqual(3);
    expect(new Set(inv.map((l) => l.text)).size).toBe(inv.length);
    expect(r.d.leadTo).toBe('bouncePads');
  });
});

describe('Director: quiet during attraction games (m7)', () => {
  it('no unsolicited lines, leads or rescues while a game runs; the lead starts after it', () => {
    const r = setup();
    r.d.begin(true);
    r.play(40);
    r.play(0.2, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    r.play(1, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    const n = r.said.length;
    const l = r.leads.length;
    const rescues = r.d.rescues;
    // The hero starts a game (external controller) and the trampoline counts as done meanwhile.
    r.play(0.1, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline', onFoot: false, ride: 'other', inGame: true });
    r.d.onTrampolineApex();
    r.d.onTrampolineApex();
    r.play(140, { hero: { x: 20, z: -2 }, onFoot: false, ride: 'other', inGame: true, pushing: true });
    const during = r.said.slice(n).map((x) => x.id);
    expect(during.filter((id) => /follow|invite|rescue|idle|stuck|tip:|glasses:nudge|sunset/.test(id ?? ''))).toEqual([]);
    expect(r.leads.slice(l).filter((t) => t !== null)).toEqual([]);
    expect(r.d.rescues).toBe(rescues);
    // Back on foot: Pip leads on to the next place.
    r.play(0.5, { hero: { x: 20, z: -2 } });
    expect(r.d.leadTo).not.toBeNull();
    expect(r.said.at(-1)?.id).toBe('guide:follow');
  });

  it('reactions to results still come during a game', () => {
    const r = setup();
    r.d.begin(false);
    r.play(30, { inGame: true, onFoot: false, ride: 'other' });
    const n = r.said.length;
    r.d.onMissionCompleted();
    expect(r.said.length).toBe(n + 1);
    expect(POOLS.goal.some((p) => p.text === r.said.at(-1)!.text)).toBe(true);
  });
});

describe('Director: rescues free the hero and are capped (M1)', () => {
  it('pushing at one counter for 120 s: the third rescue frees the hero; never more than the cap per minute', () => {
    const r = setup();
    r.d.begin(true);
    r.play(1);
    const times: number[] = [];
    let last = 0;
    for (let t = 0; t < 120; t += 1 / 30) {
      r.play(1 / 30, { hero: { x: 24, z: -2 }, heroSpeed: 0.3, pushing: true });
      if (r.d.rescues !== last) {
        last = r.d.rescues;
        times.push(t);
      }
    }
    expect(r.hops.length).toBeGreaterThanOrEqual(1);
    expect(r.d.frees).toBe(r.hops.length);
    for (let i = 0; i < times.length; i++) {
      const inWindow = times.filter((x) => x >= times[i] && x < times[i] + RESCUE_WINDOW).length;
      expect(inWindow).toBeLessThanOrEqual(RESCUE_CAP);
    }
    expect(r.d.rescues).toBeLessThanOrEqual(Math.ceil(120 / RESCUE_WINDOW) * RESCUE_CAP);
  });
});

describe('Dizzy (carnival spin): a gentle reused line, rate-limited', () => {
  it('says "Wibble wobble!" at most once per DIZZY_GAP', () => {
    const r = setup();
    r.d.begin(false);
    r.play(5);
    const n = r.said.length;
    r.d.onDizzy();
    r.play(5);
    r.d.onDizzy();
    expect(r.said.slice(n).filter((l) => l.id === 'dizzy').map((l) => l.text)).toEqual([DIZZY.text]);
    r.play(DIZZY_GAP);
    r.d.onDizzy();
    expect(r.said.filter((l) => l.id === 'dizzy').length).toBe(2);
    expect(POOLS.flop.some((p) => p.text === DIZZY.text)).toBe(true);
  });
});

describe('Chest hints match the step-on-the-symbol mechanic', () => {
  it('no chest line asks for a button press', () => {
    for (const l of [...HOWTO.chest, CHEST.findKey, CHEST.shape] as ScriptLine[]) {
      expect(l.action ?? null).not.toBe('use');
      expect(l.text).not.toMatch(/\bpress\b|\bE\b|button/i);
      expect(l.extra ?? null).not.toBe('lock');
    }
    expect(CHEST.shape.extra).toBe('step');
    expect(CHEST.shape.text).toMatch(/step/i);
  });
});

describe('Director: stuck means "not getting anywhere", whatever the velocity says', () => {
  it('pushing into a rail fence (walking velocity, position unchanged) brings a rescue', () => {
    const r = setup();
    r.pastTrampoline();
    const n = r.d.rescues;
    r.play(5, { hero: { x: 41.5, z: -40.3 }, heroSpeed: 4.5, pushing: true });
    expect(r.d.rescues).toBeGreaterThan(n);
  });
});

describe('Leader plans round fences (a straight hop over a rail fence strands the hero)', () => {
  // A fence along x = 10 from z = -30 to z = 12; the way round is north of it.
  const crosses = (a: V2, b: V2): boolean => {
    if ((a.x - 10) * (b.x - 10) > 0) return false;
    const t = (10 - a.x) / (b.x - a.x || 1e-9);
    const z = a.z + (b.z - a.z) * t;
    return z > -30 && z < 12;
  };
  const clear = (a: V2, b: V2): boolean => !crosses(a, b);

  it('planPath goes round the end of the fence', () => {
    const path = planPath({ x: 0, z: 0 }, { x: 20, z: 0 }, clear);
    expect(path).not.toBeNull();
    let prev = { x: 0, z: 0 };
    for (const p of path!) {
      expect(crosses(prev, p)).toBe(false);
      prev = p;
    }
    expect(path!.at(-1)).toEqual({ x: 20, z: 0 });
  });

  it('every hop spot Pip runs to keeps the hero on the walkable side', () => {
    const L = new Leader(() => true, clear);
    L.set({ x: 20, z: 0 }, 2.5);
    let pip = { x: 0, z: 1 };
    let hero = { x: 0, z: 0 };
    for (let t = 0; t < 60; t += 0.1) {
      const o = L.update(0.1, pip, hero);
      if (!o || o.state === 'arrived') break;
      expect(crosses(pip, o.target)).toBe(false);
      pip = { ...o.target };
      hero = { x: pip.x - 0.5, z: pip.z };
    }
    expect(Math.hypot(hero.x - 20, hero.z)).toBeLessThan(4);
  });
});
