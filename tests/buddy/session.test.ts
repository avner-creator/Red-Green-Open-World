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
import { Director, INVITE_IDLE, MAX_IGNORED, QUICK } from '../../src/buddy/director';
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

function simulate(child: Child, intro: boolean, ignoreAfterTour = false) {
  const queue = new DialogueQueue();
  let leadTarget: V2 | null = null;
  const targets: V2[] = [];
  const sink: DirectorSink = {
    say: (l) => queue.say(l),
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
  const timeline: string[] = [];
  for (let t = 0; t < SESSION; t += dt) {
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
    if (child !== 'explorer' && follows && playing <= 0 && lt) {
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
      onFoot: true,
      ride: 'none',
      nearAttraction: near,
      chestHint: null,
      keys: { use: 'E', jump: 'Space', skill: 'Q' },
      remaining: SESSION - t,
      hasMissions: true,
      busy: queue.busy,
      pushing,
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
  }
  return { d, maxGap, maxGapAt, targets, timeline };
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

  it('a busy explorer hears no invitation until the last minute, which leads somewhere quick', () => {
    const r = simulate('explorer', false);
    expect(r.d.invitations).toBe(1);
    const last = r.targets.at(-1)!;
    const name = PLACES.find((q) => Math.hypot(q.x - last.x, q.z - last.z) < 0.01)!.name;
    expect(QUICK).toContain(name);
    expect(INVITE_IDLE).toBeLessThanOrEqual(15);
  });
});
