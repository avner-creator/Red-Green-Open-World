import { describe, expect, it } from 'vitest';
import type { Line } from '../../src/buddy/dialogue';
import { PRIORITY } from '../../src/buddy/dialogue';
import { Director, HINT_GAP, IDLE_SECONDS, STUCK_PUSH_SECONDS, STUCK_SECONDS, WANDER_SECONDS } from '../../src/buddy/director';
import { REPEAT_SECONDS, ShuffleBag, UNSOLICITED_GAP } from '../../src/buddy/pools';
import type { DirectorSink, DirectorView, LeadOptions } from '../../src/buddy/director';
import type { Attraction } from '../../src/buddy/types';
import { createBuddyStore } from '../../src/buddy/store';
import { CHEST, HOWTO, INTRO, POOLS, RETURNING, STORY } from '../../src/buddy/script';
import type { V2 } from '../../src/buddy/steer';

function setup() {
  const said: Line[] = [];
  const leads: (V2 | null)[] = [];
  const opts: (LeadOptions | undefined)[] = [];
  let glasses = 0;
  const sink: DirectorSink = {
    say: (l) => said.push(l),
    lead: (t, o) => {
      leads.push(t);
      opts.push(o);
    },
    celebrate: () => {},
    bark: () => {},
    glasses: () => glasses++,
    goal: () => ({ id: 'g', line: { text: 'Collect 10 Glow Gems!', icon: 'gem' } }),
    anchor: (n) => PLACES.find((p) => p.name === n) ?? null,
    places: () => PLACES,
  };
  const store = createBuddyStore(false);
  const d = new Director(sink, store, () => 0);
  return { d, said, leads, opts, store, sink, glasses: () => glasses };
}

const PLACES: { name: Attraction; x: number; z: number }[] = [
  { name: 'trampoline', x: 58, z: -24 },
  { name: 'bouncePads', x: 84, z: -12 },
  { name: 'balloon', x: 84, z: 64 },
  { name: 'gearShack', x: 14, z: 2 },
];

const view = (over: Partial<DirectorView> = {}): DirectorView => ({
  hero: { x: 0, z: 0 },
  heroSpeed: 2,
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

function tick(d: Director, seconds: number, v: DirectorView = view(), dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) d.update(dt, v);
}

const ids = (said: Line[]) => said.map((l) => l.id);

/** Ticks with a pretend dialogue queue: every line keeps Pip busy for `secs` seconds. */
function talking(secs = 3) {
  const r = setup();
  let now = 0;
  let until = 0;
  const say = r.sink.say;
  r.sink.say = (l) => {
    say(l);
    until = now + secs;
  };
  const play = (seconds: number, over: Partial<DirectorView> = {}, dt = 1 / 30): void => {
    for (let t = 0; t < seconds; t += dt) {
      now += dt;
      r.d.update(dt, view({ busy: now < until, ...over }));
    }
  };
  return { ...r, play };
}

describe('Director: the spoken welcome story', () => {
  it('tells every beat in order while the child moves, puts on the glasses, then leads to the trampoline', () => {
    const { d, said, leads, glasses, play } = talking(4);
    d.begin(true);
    expect(d.step).toBe('story');
    expect(said[0].id).toBe('intro:welcome');
    play(40, { heroSpeed: 4, look: 0.1 });
    const beats = said.filter((l) => l.id === 'intro:welcome' || l.id?.startsWith('story:')).map((l) => l.text);
    expect(beats).toEqual(STORY.map((l) => l.text));
    expect(glasses()).toBe(1);
    expect(d.step).toBe('follow');
    expect(d.leadTo).toBe('trampoline');
    expect(leads.at(-1)).toEqual(PLACES[0]);
    // Nothing else was said during the story.
    const storyEnd = said.findIndex((l) => l.text === STORY.at(-1)!.text);
    expect(said.slice(0, storyEnd + 1).every((l) => l.priority === PRIORITY.story)).toBe(true);
  });

  it('can be skipped after 2 s', () => {
    const { d, said, store, play } = talking();
    d.begin(true);
    play(1);
    expect(d.skip()).toBe(false);
    play(1.2);
    expect(d.skip()).toBe(true);
    expect(d.step).toBe('done');
    expect(store.flags.intro).toBe(true);
    expect(said.at(-1)!.text).toBe(INTRO.skipped.text);
    const n = said.length;
    play(10);
    expect(said.slice(n).some((l) => l.id?.startsWith('story:'))).toBe(false);
  });

  it('reaching the trampoline gives the jump how-to; two bounces finish the tour and lead on', () => {
    const { d, said, leads, play } = talking();
    d.begin(true);
    play(40);
    expect(said.some((l) => l.id === 'intro:jump')).toBe(false);
    play(0.2, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    expect(d.step).toBe('jump');
    expect(said.some((l) => l.id === 'intro:jump' && l.action === 'jump')).toBe(true);
    d.onTrampolineApex();
    d.onTrampolineApex();
    expect(d.step).toBe('done');
    expect(d.leadTo).toBe('bouncePads');
    expect(leads.at(-1)).toEqual(PLACES[1]);
    expect(said.some((l) => l.id === 'guide:follow')).toBe(true);
  });

  it('stops leading after two attractions and lets the child choose', () => {
    const { d, said, leads, play } = talking();
    d.begin(true);
    play(40);
    play(0.2, { hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' });
    d.onStunt({ kind: 'bigBounce', stars: 1 });
    expect(d.leadTo).toBe('bouncePads');
    play(0.5, { hero: { x: 84, z: -12 }, nearAttraction: 'bouncePads' });
    expect(d.leadTo).toBeNull();
    d.onStunt({ kind: 'bounce', stars: 0 });
    expect(d.isGuiding).toBe(false);
    expect(leads.at(-1)).toBeNull();
    expect(ids(said)).toContain('guide:choose');
  });

  it('a returning player gets "welcome back" and the goal, no story', () => {
    const { d, said } = setup();
    d.begin(false);
    expect(d.step).toBe('done');
    expect(said.map((l) => l.text)).toEqual([RETURNING.text, 'Collect 10 Glow Gems!']);
  });
});

describe('Director: how-tos and the economy', () => {
  it('first arrival at an attraction says its whole how-to once; asking Pip there says it again', () => {
    const { d, said, play, store } = talking(2);
    for (const t of ['compass', 'missions', 'timer']) store.markTip(t);
    d.begin(false);
    play(4);
    said.length = 0;
    play(10, { nearAttraction: 'dinoRing' });
    expect(said.map((l) => l.text)).toEqual(HOWTO.dinoRing.map((l) => l.text));
    said.length = 0;
    play(10, { nearAttraction: 'dinoRing' });
    expect(said).toEqual([]);
    d.ask(null);
    play(5, { nearAttraction: 'dinoRing' });
    expect(said.map((l) => l.text)).toEqual(HOWTO.dinoRing.map((l) => l.text));
  });

  it('a focused use prompt (a booth, a vault) gets its own how-to', () => {
    const { d, said, play, store } = talking(2);
    for (const t of ['compass', 'missions', 'timer']) store.markTip(t);
    d.begin(false);
    play(4);
    said.length = 0;
    play(8, { nearAttraction: 'carnivalRow', topic: 'booth:strengthBell' });
    expect(said[0].text).toBe(HOWTO['booth:strengthBell'][0].text);
    said.length = 0;
    play(8, { topic: 'vault' });
    expect(said.map((l) => l.text)).toEqual(HOWTO.vault.map((l) => l.text));
  });

  it('walking away drops the rest of a how-to', () => {
    const { d, said, play, store } = talking(3);
    for (const t of ['compass', 'missions', 'timer']) store.markTip(t);
    d.begin(false);
    play(4);
    said.length = 0;
    play(0.5, { nearAttraction: 'balloon' });
    play(8, { nearAttraction: null });
    expect(said.map((l) => l.text)).toEqual([HOWTO.balloon[0].text]);
  });

  it('explains gems, mega gems, keys, paid rides, stamps and the shop once each', () => {
    const { d, said, play, store } = talking(1);
    for (const t of ['compass', 'missions', 'timer']) store.markTip(t);
    d.begin(false);
    play(4);
    said.length = 0;
    d.onGem({});
    d.onGem({ mega: true });
    d.onChestKey();
    d.onTicketPaid(true);
    d.onTicketPaid(false);
    d.onStamp();
    d.onShopOpen();
    expect(said.map((l) => l.id)).toEqual(['econ:gem', 'econ:mega', 'econ:key', 'econ:ticket', 'econ:stamp', 'econ:shop']);
    expect(said[0].callout).toBeTruthy();
    said.length = 0;
    d.onTicketPaid(false);
    d.onShopOpen();
    expect(said.filter((l) => l.id?.startsWith('econ:'))).toEqual([]);
  });
});

describe('Director: variety and restraint', () => {
  const quiet = () => {
    const r = talking(1.5);
    for (const t of ['missions', 'timer', 'skill', 'help', 'pip', 'compass', 'arrows', 'combo', 'econ:gem', 'econ:mega', 'econ:key', 'econ:stamp']) r.store.markTip(t);
    r.d.begin(false);
    r.play(1);
    r.said.length = 0;
    return r;
  };

  it('gems: a cheer only every 5th gem, never more than one unsolicited line per 15 s', () => {
    const { d, said, play } = quiet();
    for (let i = 0; i < 120; i++) {
      d.onGem({});
      play(1, { heroSpeed: 3 });
    }
    const lines = said.filter((l) => l.priority <= PRIORITY.react);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.length).toBeLessThanOrEqual(Math.ceil(120 / UNSOLICITED_GAP) + 1);
    for (const l of lines) expect(l.praise).toBe(true);
  });

  it('never repeats a line back-to-back, nor within three minutes', () => {
    const { d, said, play } = quiet();
    const when: { text: string; t: number }[] = [];
    let t = 0;
    for (let i = 0; i < 600; i++) {
      const n = said.length;
      if (i % 3 === 0) d.onStunt({ kind: 'flip', stars: 3 });
      else if (i % 3 === 1) d.onFlop();
      else d.onChestOpened();
      play(1, { heroSpeed: 3 });
      t += 1;
      for (const l of said.slice(n)) when.push({ text: l.text, t });
    }
    expect(when.length).toBeGreaterThan(20);
    for (let i = 1; i < when.length; i++) expect(when[i].text).not.toBe(when[i - 1].text);
    const last = new Map<string, number>();
    for (const w of when) {
      const p = last.get(w.text);
      if (p !== undefined) expect(w.t - p, w.text).toBeGreaterThanOrEqual(REPEAT_SECONDS - 3);
      last.set(w.text, w.t);
    }
  });

  it('mega gems: at most one line per 20 s', () => {
    const { d, said, play } = quiet();
    for (let i = 0; i < 60; i++) {
      d.onGem({ mega: true });
      play(1, { heroSpeed: 3 });
    }
    const megas = said.filter((l) => POOLS.mega.some((m) => m.text === l.text));
    expect(megas.length).toBeGreaterThan(0);
    expect(megas.length).toBeLessThanOrEqual(3);
  });
});

describe('ShuffleBag', () => {
  it('uses every line before reshuffling and never gives the same one twice in a row', () => {
    let seed = 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const bag = new ShuffleBag(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], rand);
    const out: string[] = [];
    for (let i = 0; i < 800; i++) out.push(bag.next()!);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    expect(new Set(out.slice(0, 8)).size).toBe(8);
  });
});
describe('Director: rescues', () => {
  it('pushing against a fence for 3 s: Pip fetches the hero, leads, and helps turn', () => {
    const { d, opts } = setup();
    d.begin(true);
    tick(d, 1);
    tick(d, 2, view({ heroSpeed: 4 }));
    tick(d, STUCK_PUSH_SECONDS + 0.2, view({ hero: { x: 98, z: -40 }, heroSpeed: 0.8, pushing: true }));
    expect(d.rescues).toBe(1);
    expect(d.leadTo).toBe('trampoline');
    expect(opts.at(-1)).toMatchObject({ fetch: true, assist: true });
  });

  it('wandering away from everything for 15 s brings Pip over (while new)', () => {
    const { d } = setup();
    d.begin(true);
    tick(d, 1);
    let x = -30;
    for (let i = 0; i < 30 * (WANDER_SECONDS + 1); i++) {
      x -= 5 / 30;
      d.update(1 / 30, view({ hero: { x, z: 0 }, heroSpeed: 5, look: 0.1 }));
    }
    expect(d.rescues).toBeGreaterThanOrEqual(1);
  });

  it('never more than one unsolicited hint per HINT_GAP seconds', () => {
    const { d, said } = setup();
    d.begin(true);
    tick(d, 1);
    const t0 = said.length;
    // Stuck at a fence the whole time: rescues repeat, lines do not pile up.
    tick(d, 60, view({ hero: { x: 98, z: -40 }, heroSpeed: 0, pushing: true }));
    const lines = said.slice(t0).filter((l) => l.priority >= PRIORITY.tip);
    expect(lines.length).toBeLessThanOrEqual(Math.ceil(60 / HINT_GAP) + 1);
  });
});

describe('Director: tips and nudges', () => {
  it('each HUD tip fires once ever', () => {
    const { d, said, store } = setup();
    d.begin(false);
    said.length = 0;
    tick(d, 60);
    const tips = said.filter((l) => l.id?.startsWith('tip:')).map((l) => l.id);
    expect(tips).toContain('tip:missions');
    expect(tips).toContain('tip:timer');
    expect(new Set(tips).size).toBe(tips.length);
    // A new session: the same tips do not come back.
    d.begin(false);
    said.length = 0;
    tick(d, 60);
    expect(said.filter((l) => l.id === 'tip:missions' || l.id === 'tip:timer')).toEqual([]);
    expect(store.tipSeen('timer')).toBe(true);
  });

  it('first visit to an attraction gives its how-to once', () => {
    const { d, said } = setup();
    d.begin(false);
    said.length = 0;
    tick(d, 1, view({ nearAttraction: 'garage' }));
    expect(said.map((l) => l.text)).toEqual(HOWTO.garage.map((l) => l.text));
    expect(said[0].action).toBe('use');
    said.length = 0;
    tick(d, 1, view({ nearAttraction: 'garage' }));
    expect(said).toEqual([]);
  });

  it('a locked chest: the how-to first, it wins over generic tips; then a short hint with a long cooldown', () => {
    const { d, said } = setup();
    d.begin(false);
    tick(d, 30, view({ heroSpeed: 0, hero: { x: 0, z: 40 } }));
    said.length = 0;
    tick(d, 20, view({ chestHint: 'findKey', heroSpeed: 0, hero: { x: 0, z: 40 } }));
    expect(said.map((l) => l.text)).toEqual(HOWTO.chest.map((l) => l.text));
    expect(said[0].icon).toBe('chest');
    expect(said[0].priority).toBe(PRIORITY.story);
    expect(said.some((l) => l.id?.startsWith('tip:'))).toBe(false);
    said.length = 0;
    d.update(0.1, view({ chestHint: 'findKey', busy: true }));
    said.length = 0;
    tick(d, 2, view({ chestHint: 'findKey', busy: true }));
    expect(said).toEqual([]);
    said.length = 0;
    tick(d, 60, view({ chestHint: 'findKey', heroSpeed: 0, hero: { x: 0, z: 40 } }));
    expect(said.filter((l) => l.text === CHEST.findKey.text).length).toBe(1);
  });

  it('stuck for 40 s suggests the nearest attraction not tried yet; progress resets it', () => {
    const { d, said, store } = setup();
    for (const t of ['missions', 'timer', 'skill', 'help', 'pip', 'compass', 'arrows']) store.markTip(t);
    d.begin(false);
    said.length = 0;
    tick(d, STUCK_SECONDS - 5);
    d.onWalletChange();
    tick(d, 10);
    expect(said.filter((l) => l.id === 'stuck')).toEqual([]);
    tick(d, STUCK_SECONDS);
    const s = said.find((l) => l.id === 'stuck');
    expect(s?.text).toBe('Try the Gear Shack!');
  });

  it('standing still says a playful idle line', () => {
    const { d, said, store } = setup();
    for (const t of ['missions', 'timer', 'skill', 'help', 'pip', 'compass', 'arrows']) store.markTip(t);
    d.begin(false);
    said.length = 0;
    tick(d, IDLE_SECONDS + 0.5, view({ heroSpeed: 0 }));
    expect(said.some((l) => l.id === 'idle' && l.priority === PRIORITY.idle)).toBe(true);
  });

  it('denied ticket says how many gems are missing; last 30 s warns once', () => {
    const { d, said } = setup();
    d.begin(false);
    d.onTicketDenied(5, 2);
    expect(said.at(-1)!.text).toBe('Need 3 more gems!');
    d.onTick(29);
    d.onTick(25);
    expect(said.filter((l) => l.id === 'sunset').length).toBe(1);
  });

  it('the first freefall explains the chute with the right key', () => {
    const { d, said } = setup();
    d.begin(false);
    d.update(0.1, view({ ride: 'freefall', onFoot: false }));
    expect(said.at(-1)!.text).toBe('Parachute now!');
    expect(said.at(-1)!.action).toBe('jump');
  });
});

describe('Director: magic-glasses games', () => {
  const setupG = () => {
    const r = setup();
    return r;
  };
  it('points at the nearest unvisited glasses game early, once per nudge', () => {
    const said: Line[] = [];
    const leads: (V2 | null)[] = [];
    const sink: DirectorSink = {
      say: (l) => said.push(l),
      lead: (t) => leads.push(t),
      celebrate: () => {},
      bark: () => {},
      goal: () => ({ id: 'g', line: { text: 'x', icon: 'gem' } }),
      glasses: () => {},
      anchor: (n) => (n === 'toys' ? { x: 10, z: 0 } : { x: 90, z: 0 }),
      places: () => [
        { name: 'glowflies', x: 90, z: 0 },
        { name: 'toys', x: 10, z: 0 },
      ],
    };
    const d = new Director(sink, createBuddyStore(false), () => 0);
    d.begin(false);
    tick(d, 62);
    const n = said.find((l) => l.id === 'glasses:nudge');
    expect(n?.text).toBe('Try the magic toy hunt!');
    expect(leads.at(-1)).toEqual({ x: 10, z: 0 });
    tick(d, 10);
    expect(leads.at(-1)).toBeNull();
    expect(said.filter((l) => l.id === 'glasses:nudge')).toHaveLength(1);
  });
  it('does not nudge when a glasses game was already visited, and cheers a hit', () => {
    const { d, said } = setupG();
    d.begin(false);
    d.update(0.1, view({ nearAttraction: 'oddone' }));
    tick(d, 60);
    expect(said.some((l) => l.id === 'glasses:nudge')).toBe(false);
    d.onGlassesHit();
    expect(said.at(-1)?.icon).toBe('glasses');
  });
});
