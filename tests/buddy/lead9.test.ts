/**
 * QA round 9 regressions (director, pure). M1: an activity started on foot (a ticket at a ring, a
 * countdown) holds every lead until it ends; a lead chosen at that moment is dropped. M2: a place a
 * lead gave up on is offered again later (not dropped for the session), and Pip says so when he
 * changes his mind.
 */
import { describe, expect, it } from 'vitest';
import type { Line } from '../../src/buddy/dialogue';
import { ACTIVITY_HOLD_MAX, Director, LEAD_RETRY } from '../../src/buddy/director';
import type { DirectorSink, DirectorView } from '../../src/buddy/director';
import type { V2 } from '../../src/buddy/steer';
import { createBuddyStore } from '../../src/buddy/store';
import type { Attraction } from '../../src/buddy/types';

const PLACES: { name: Attraction; x: number; z: number }[] = [
  { name: 'trampoline', x: 58, z: -24 },
  { name: 'bouncePads', x: 84, z: -12 },
  { name: 'launchPads', x: 30, z: -60 },
  { name: 'foamCourse', x: 20, z: -14 },
  { name: 'gearShack', x: 14, z: 2 },
];

function setup() {
  const said: Line[] = [];
  const leads: (V2 | null)[] = [];
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
  const pastTrampoline = (): void => {
    d.begin(true);
    play(40);
    play(0.2, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    d.onTrampolineApex();
    d.onTrampolineApex();
  };
  return { d, said, leads, play, pastTrampoline };
}

const follows = (said: readonly Line[], from: number): Line[] => said.slice(from).filter((l) => /^guide:|^invite/.test(l.id ?? ''));

describe('QA9 M1: no lead from the moment an activity starts until it ends', () => {
  it('a ticket taken on foot (walk-on start, still in walk mode) starts no lead, and a chosen one is dropped', () => {
    const r = setup();
    r.pastTrampoline();
    // Led to a place with a walk-on game, the child stands at its start ring.
    r.play(0.5, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse' });
    const n = r.said.length;
    // The ring takes the ticket while the hero is still walking: the place is now "done".
    r.d.onTicketPaid(true);
    expect(r.d.leadTo).toBeNull();
    // Countdown on foot for a moment, then the game takes the hero over for a long run.
    r.play(0.5, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse' });
    expect(r.d.leadTo).toBeNull();
    r.play(80, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse', onFoot: false, ride: 'other', inGame: true });
    expect(r.d.leadTo).toBeNull();
    expect(follows(r.said, n)).toEqual([]);
    // The game is over: now the tour goes on.
    r.play(1, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse' });
    expect(r.d.leadTo).not.toBeNull();
    expect(r.d.leadTo).not.toBe('foamCourse');
  });

  it('a lead already running when a game takes the hero over at another place is cancelled', () => {
    const r = setup();
    r.pastTrampoline();
    expect(r.d.leadTo).toBe('bouncePads');
    // On the way the child jumps into another place's game.
    r.play(0.2, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse', onFoot: false, ride: 'other', inGame: true });
    expect(r.d.leadTo).toBeNull();
    r.play(30, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse', onFoot: false, ride: 'other', inGame: true });
    expect(r.d.leadTo).toBeNull();
  });

  it('a game played on foot holds the lead until it reports its end, the child walks off, or the cap', () => {
    const r = setup();
    r.pastTrampoline();
    r.play(0.5, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse' });
    r.d.onTicketPaid(true);
    r.play(20, { hero: { x: 22, z: -12 }, nearAttraction: 'foamCourse' });
    expect(r.d.leadTo).toBeNull();
    r.d.onActivityEnd();
    r.play(0.5, { hero: { x: 22, z: -12 }, nearAttraction: 'foamCourse' });
    expect(r.d.leadTo).not.toBeNull();

    const s = setup();
    s.pastTrampoline();
    s.play(0.5, { hero: { x: 20, z: -14 }, nearAttraction: 'foamCourse' });
    s.d.onTicketPaid(true);
    s.play(ACTIVITY_HOLD_MAX - 5, { hero: { x: 22, z: -12 }, nearAttraction: 'foamCourse' });
    expect(s.d.leadTo).toBeNull();
    s.play(6, { hero: { x: 22, z: -12 }, nearAttraction: 'foamCourse' });
    expect(s.d.leadTo).not.toBeNull();
  });
});

describe('QA9 M2: a failed lead is not forever, and never silent', () => {
  it('Pip says something when he turns to another place, and offers the failed one again later', () => {
    const r = setup();
    r.pastTrampoline();
    expect(r.d.leadTo).toBe('bouncePads');
    const n = r.said.length;
    r.d.leadFailed('unreachable: test');
    const next = r.d.leadTo;
    expect(next).not.toBeNull();
    expect(next).not.toBe('bouncePads');
    const spoken = follows(r.said, n);
    expect(spoken.length).toBe(1);
    expect(spoken[0].valid?.()).toBe(true);
    expect(r.d.unreachable.has('bouncePads')).toBe(true);
    r.play(LEAD_RETRY + 1, { hero: { x: 0, z: 0 } });
    expect(r.d.unreachable.has('bouncePads')).toBe(false);
  });
});
