/**
 * QA round 6 M4: Pip guides for the whole ~5-minute session with a light touch. Simulated full
 * sessions (pure director + the real dialogue queue, 20 Hz):
 *  - a "follower" child (walks wherever Pip leads, plays ~20 s at each place, then stands about)
 *    is never without an active lead or an activity for more than 20 s;
 *  - an "ignorer" child (stands still) gets no more than the capped invitations;
 *  - an explorer (walking about) hears no invitations;
 *  - every lead goes to an attraction anchor (a both-eye place), never anywhere else.
 */
import { describe, expect, it } from 'vitest';
import { DialogueQueue } from '../../src/buddy/dialogue';
import { Director, INVITE_GAP, INVITE_IDLE, MAX_IGNORED, QUICK } from '../../src/buddy/director';
import type { DirectorSink } from '../../src/buddy/director';
import type { V2 } from '../../src/buddy/steer';
import { createBuddyStore } from '../../src/buddy/store';
import type { Attraction } from '../../src/buddy/types';

/** The real island layout (src/world/layout.ts, src/activities/glasses/sites.ts). */
const PLACES: { name: Attraction; x: number; z: number }[] = [
  { name: 'trampoline', x: 58, z: -24 },
  { name: 'bouncePads', x: 84, z: -12 },
  { name: 'launchPads', x: 80, z: 24 },
  { name: 'balloon', x: 84, z: 64 },
  { name: 'garage', x: 34, z: 20 },
  { name: 'gearShack', x: 14, z: 2 },
  { name: 'bungee', x: -1.5, z: -70 },
  { name: 'ranch', x: -74, z: 44 },
  { name: 'sillyZone', x: 8, z: 98 },
  { name: 'carnivalRow', x: 21, z: -42 },
  { name: 'iceCream', x: 24, z: -2 },
  { name: 'bubbleArena', x: 35, z: 57.5 },
  { name: 'dinoRing', x: 16, z: 58.5 },
  { name: 'raceStart', x: 29.5, z: 11.2 },
  { name: 'foamCourse', x: -25.5, z: -18.5 },
  { name: 'airstrip', x: -12, z: 46 },
  { name: 'dragonRoost', x: -34, z: -130 },
  { name: 'glowflies', x: -68.8, z: 18.8 },
  { name: 'oddone', x: -36.5, z: 3 },
  { name: 'lineup', x: 71.7, z: -89.5 },
  { name: 'toys', x: -30.5, z: 69.7 },
  { name: 'gates', x: 48, z: 104 },
  { name: 'dotsigns', x: 64, z: 8 },
];
const RADIUS = (a: Attraction): number => (a === 'trampoline' ? 10.5 : 7);
const SESSION = 300;
/** Seconds a following child plays at each place Pip led them to. */
const PLAY = 20;

type Child = 'follower' | 'ignorer' | 'explorer';

/** Lines that call the child to come along or do something (QA7 m8: one cap policy for all). */
const CALLS = new Set(['story:5', 'intro:follow', 'guide:follow', 'guide:invite', 'invite', 'invite:last', 'rescue', 'vehicle:drive', 'vehicle:suggest', 'vehicle:hop']);

interface SimOpts {
  /** The child stops following once the tour is over. */
  ignoreAfterTour?: boolean;
  /** At this second the child sits in a vehicle at the garage and does not drive (QA7 M2). */
  carAt?: number;
  vehicle?: 'car' | 'horse';
}

function simulate(child: Child, intro: boolean, opt: SimOpts | boolean = {}) {
  const o: SimOpts = typeof opt === 'boolean' ? { ignoreAfterTour: opt } : opt;
  const ignoreAfterTour = !!o.ignoreAfterTour;
  const queue = new DialogueQueue();
  let leadTarget: V2 | null = null;
  const targets: V2[] = [];
  const calls: { t: number; id: string; lead: V2 | null }[] = [];
  let now = 0;
  let cueAt = -1;
  const sink: DirectorSink = {
    say: (l) => {
      queue.say(l);
      if (l.id && CALLS.has(l.id)) calls.push({ t: now, id: l.id, lead: leadTarget });
      // A call or a how-to (e.g. "Hop in the buggy and drive!" on arrival) is guidance.
      if (l.id && (CALLS.has(l.id) || l.id.startsWith('howto:'))) cueAt = now;
    },
    lead: (t) => {
      leadTarget = t ? { x: t.x, z: t.z } : null;
      if (t) targets.push({ x: t.x, z: t.z });
    },
    celebrate: () => {},
    bark: () => {},
    glasses: () => {},
    goal: () => ({ id: 'g', line: { text: 'Collect 10 Glow Gems!', icon: 'gem' } }),
    anchor: (n) => {
      const p = PLACES.find((q) => q.name === n);
      return p ? { x: p.x, z: p.z } : null;
    },
    places: () => PLACES,
  };
  const d = new Director(sink, createBuddyStore(false), () => 0.37);
  d.begin(intro);
  const dt = 1 / 20;
  let hero: V2 = { x: 0, z: 9 };
  let playing = 0;
  let gap = 0;
  let maxGap = 0;
  let maxGapAt = 0;
  let bounceT = 0;
  let wasLeading = false;
  let tourOver = false;
  let car: 'no' | 'sit' | 'out' = 'no';
  let carGap = 0;
  let carMaxGap = 0;
  let carMaxAt = 0;
  const timeline: string[] = [];
  for (let t = 0; t < SESSION; t += dt) {
    now = t;
    if (o.carAt !== undefined && car === 'no' && t >= o.carAt) {
      // Into the parked buggy / onto the pony at the garage; the child does not drive.
      car = 'sit';
      hero = { x: 34, z: 20 };
      playing = 0;
      timeline.push(`${t.toFixed(0)} sits in the ${o.vehicle ?? 'car'}`);
    }
    if (car === 'sit' && calls.at(-1)?.id === 'vehicle:hop') {
      car = 'out';
      timeline.push(`${t.toFixed(0)} hops out`);
    }
    const inCar = car === 'sit';
    const near = PLACES.find((p) => Math.hypot(p.x - hero.x, p.z - hero.z) < RADIUS(p.name))?.name ?? null;
    tourOver ||= d.step === 'done' && !d.isGuiding;
    const follows = child === 'follower' && !(ignoreAfterTour && tourOver);
    let pushing = false;
    let speed = 0;
    if (child === 'explorer') {
      hero = { x: Math.sin(t / 4) * 14, z: 9 + Math.cos(t / 4) * 14 };
      speed = 3.5;
      pushing = true;
    }
    // (Set by the sink callback: TypeScript cannot see that.)
    const lt = leadTarget as V2 | null;
    if (child !== 'explorer' && follows && playing <= 0 && lt && !inCar) {
      const dx = lt.x - hero.x;
      const dz = lt.z - hero.z;
      const l = Math.hypot(dx, dz);
      if (l > 1.5) {
        const k = Math.min(1, (5 * dt) / l);
        hero = { x: hero.x + dx * k, z: hero.z + dz * k };
        speed = 5;
        pushing = true;
      }
    }
    // The intro's trampoline step: bounce.
    if (follows && d.step === 'jump' && near === 'trampoline' && (bounceT += dt) > 1.5) {
      bounceT = 0;
      d.onTrampolineApex();
    }
    // Arrived where Pip led: play there for a while (a ride, a game, a glasses round).
    if (follows && wasLeading && !d.leadTo && near && d.step === 'done' && playing <= 0) {
      playing = PLAY;
      timeline.push(`${t.toFixed(0)} play ${near}`);
      d.onTicketPaid(true);
    }
    wasLeading = !!d.leadTo;
    d.update(dt, {
      hero,
      heroSpeed: speed,
      onFoot: !inCar,
      ride: inCar ? 'vehicle' : 'none',
      vehicle: inCar ? (o.vehicle ?? 'car') : null,
      nearAttraction: near,
      chestHint: null,
      keys: { use: 'E', jump: 'Space', skill: 'Q' },
      remaining: SESSION - t,
      hasMissions: true,
      busy: queue.busy,
      pushing: pushing && !inCar,
      inGame: playing > 0,
    });
    queue.update(dt);
    if (playing > 0) playing -= dt;
    // "Without an active lead or an activity", once the intro tour has started its first lead.
    const busy = !!d.leadTo || playing > 0 || d.step !== 'done';
    gap = busy ? 0 : gap + dt;
    if (gap > maxGap) {
      maxGap = gap;
      maxGapAt = t;
    }
    // From the moment the child sits in the vehicle: a cue, a lead or an activity at least every 25 s.
    if (car !== 'no') {
      carGap = busy || cueAt === t ? 0 : carGap + dt;
      if (carGap > carMaxGap) {
        carMaxGap = carGap;
        carMaxAt = t;
      }
    }
  }
  return { d, maxGap, maxGapAt, targets, timeline, calls, car, carMaxGap, carMaxAt };
}

const isAnchor = (p: V2): boolean => PLACES.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.01);

describe('Pip guides the whole session (QA6 M4)', () => {
  it('a following child (new player) is never without a lead or an activity for more than 20 s', () => {
    const r = simulate('follower', true);
    expect(r.maxGap, `${r.maxGap.toFixed(1)} s at ${r.maxGapAt.toFixed(0)} s; ${r.timeline.join(', ')}`).toBeLessThanOrEqual(20);
    // Pip went on after "Now you choose!": more places than the three of the tour.
    expect(r.d.done.size).toBeGreaterThanOrEqual(6);
    expect(r.d.invitations).toBeGreaterThanOrEqual(3);
    // A kind not tried yet comes early: a glasses game is among the first places after the tour.
    expect([...r.d.done].some((a) => ['glowflies', 'oddone', 'lineup', 'toys', 'gates', 'dotsigns'].includes(a))).toBe(true);
    for (const p of r.targets) expect(isAnchor(p)).toBe(true);
  });

  it('a following returning player is guided the same way', () => {
    const r = simulate('follower', false);
    expect(r.maxGap, `${r.maxGap.toFixed(1)} s at ${r.maxGapAt.toFixed(0)} s; ${r.timeline.join(', ')}`).toBeLessThanOrEqual(20);
    expect(r.d.done.size).toBeGreaterThanOrEqual(5);
    for (const p of r.targets) expect(isAnchor(p)).toBe(true);
  });

  it('an ignoring child gets no more than the capped invitations (plus the last-minute beat)', () => {
    const r = simulate('ignorer', false);
    expect(r.d.invitations).toBeGreaterThanOrEqual(1);
    expect(r.d.invitations).toBeLessThanOrEqual(MAX_IGNORED + 1);
    // After the tour, a child who stops following is treated the same.
    const t = simulate('follower', true, true);
    expect(t.d.invitations).toBeGreaterThanOrEqual(1);
    expect(t.d.invitations).toBeLessThanOrEqual(MAX_IGNORED + 1);
  });

  it('QA7 m8: an ignoring new player gets at most the capped calls, one per 25 s, each to a different, nearer place', () => {
    const r = simulate('ignorer', true);
    const summary = r.calls.map((c) => `${c.t.toFixed(0)} ${c.id}`).join(', ');
    // The story's "follow me" + two more, then quiet (plus the last-minute beat).
    expect(r.calls.length, summary).toBeLessThanOrEqual(MAX_IGNORED + 1);
    expect(r.calls.length, summary).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < r.calls.length; i++) expect(r.calls[i].t - r.calls[i - 1].t, summary).toBeGreaterThanOrEqual(INVITE_GAP - 0.1);
    const to = r.calls.map((c) => c.lead).filter((p): p is V2 => !!p);
    const names = to.map((p) => PLACES.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.01)?.name);
    expect(new Set(names).size, names.join(', ')).toBe(names.length);
    // After the ignored trampoline call, the next place is nearer to where the child stands.
    const dist = (p: V2): number => Math.hypot(p.x, p.z - 9);
    expect(dist(to[1]), names.join(', ')).toBeLessThan(dist(to[0]));
    for (const p of r.targets) expect(isAnchor(p)).toBe(true);
  });

  for (const vehicle of ['car', 'horse'] as const) {
    it(`QA7 M2: a follower who sits in the parked ${vehicle} is never more than 25 s without a cue, a lead or an activity`, () => {
      const r = simulate('follower', true, { carAt: 105, vehicle });
      const summary = `${r.carMaxGap.toFixed(1)} s at ${r.carMaxAt.toFixed(0)} s; ${r.timeline.join(', ')}; calls ${r.calls.map((c) => `${c.t.toFixed(0)} ${c.id}`).join(', ')}`;
      expect(r.carMaxGap, summary).toBeLessThanOrEqual(25);
      const inCar = r.calls.filter((c) => c.t >= 105);
      // "Drive!" first (about 8 s in), later "hop out, follow me" and a lead on foot.
      expect(inCar[0]?.id, summary).toBe('vehicle:drive');
      expect(inCar[0].t - 105, summary).toBeLessThan(16);
      expect(r.car, summary).toBe('out');
      expect(r.d.done.size, summary).toBeGreaterThanOrEqual(6);
      for (const p of r.targets) expect(isAnchor(p)).toBe(true);
    });
  }

  it('a child who drives about hears a race or destination suggestion now and then, never more than the cap', () => {
    const r = simulateDriver();
    expect(r.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(r.suggestions.length).toBeLessThanOrEqual(MAX_IGNORED + 1);
    for (let i = 1; i < r.suggestions.length; i++) expect(r.suggestions[i] - r.suggestions[i - 1]).toBeGreaterThanOrEqual(INVITE_GAP - 0.1);
  });

  it('a busy explorer hears no invitation until the last minute, which leads somewhere quick', () => {
    const r = simulate('explorer', false);
    expect(r.d.invitations).toBe(1);
    const last = r.targets.at(-1)!;
    const name = PLACES.find((q) => Math.hypot(q.x - last.x, q.z - last.z) < 0.01)!.name;
    expect(QUICK).toContain(name);
    expect(INVITE_IDLE).toBeLessThanOrEqual(15);
  });
});

/** A returning player who drives the buggy round and round for the whole session. */
function simulateDriver() {
  const queue = new DialogueQueue();
  const suggestions: number[] = [];
  let now = 0;
  const sink: DirectorSink = {
    say: (l) => {
      queue.say(l);
      if (l.id === 'vehicle:suggest') suggestions.push(now);
    },
    lead: () => {},
    celebrate: () => {},
    bark: () => {},
    glasses: () => {},
    goal: () => ({ id: 'g', line: { text: 'Collect 10 Glow Gems!', icon: 'gem' } }),
    anchor: (n) => PLACES.find((q) => q.name === n) ?? null,
    places: () => PLACES,
  };
  const d = new Director(sink, createBuddyStore(false), () => 0.37);
  d.begin(false);
  const dt = 1 / 20;
  for (let t = 0; t < SESSION; t += dt) {
    now = t;
    const hero = { x: Math.sin(t / 8) * 40, z: 9 + Math.cos(t / 8) * 40 };
    d.update(dt, {
      hero, heroSpeed: 10, onFoot: false, ride: 'vehicle', vehicle: 'car', nearAttraction: null, chestHint: null,
      keys: { use: 'E', jump: 'Space', skill: 'Q' }, remaining: SESSION - t, hasMissions: true, busy: queue.busy, pushing: false,
    });
    queue.update(dt);
  }
  return { d, suggestions };
}
