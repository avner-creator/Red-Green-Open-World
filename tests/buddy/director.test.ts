import { describe, expect, it } from 'vitest';
import type { Line } from '../../src/buddy/dialogue';
import { PRIORITY } from '../../src/buddy/dialogue';
import { Director, GLASSES_SECONDS, HINT_GAP, IDLE_SECONDS, STUCK_PUSH_SECONDS, STUCK_SECONDS, WANDER_SECONDS, WELCOME_SECONDS } from '../../src/buddy/director';
import type { DirectorSink, DirectorView, LeadOptions } from '../../src/buddy/director';
import type { Attraction } from '../../src/buddy/types';
import { createBuddyStore } from '../../src/buddy/store';
import { INTRO } from '../../src/buddy/script';
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
  return { d, said, leads, opts, store, glasses: () => glasses };
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

describe('Director: opening tour follows the child', () => {
  it('welcome, then "walk" waits for walking (re-prompts, never moves on by itself)', () => {
    const { d, said } = setup();
    d.begin(true);
    expect(said[0].id).toBe('intro:welcome');
    tick(d, WELCOME_SECONDS + 0.1, view({ heroSpeed: 0 }));
    expect(d.step).toBe('move');
    expect(said.at(-1)!.action).toBe('move');
    tick(d, 40, view({ heroSpeed: 0, hero: { x: 50, z: -20 } }));
    expect(d.step).toBe('move');
    const prompts = said.filter((l) => l.id === 'intro:move').length;
    expect(prompts).toBeGreaterThanOrEqual(3);
    expect(prompts).toBeLessThanOrEqual(5); // one per REPROMPT
    tick(d, 2, view({ heroSpeed: 4 }));
    expect(d.step).toBe('look');
    expect(said.at(-1)!.action).toBe('look');
  });

  it('look waits for looking, then Pip puts on his magic glasses and leads to the trampoline', () => {
    const { d, said, leads, glasses } = setup();
    d.begin(true);
    tick(d, WELCOME_SECONDS + 0.1, view({ heroSpeed: 0 }));
    tick(d, 2, view({ heroSpeed: 4 }));
    expect(d.step).toBe('look');
    tick(d, 3, view({ heroSpeed: 0 }));
    expect(d.step).toBe('look');
    tick(d, 0.5, view({ heroSpeed: 0, look: 0.1 }));
    expect(d.step).toBe('glasses');
    expect(glasses()).toBe(1);
    expect(said.at(-1)!.icon).toBe('glasses');
    expect(said.at(-1)!.extra).toBe('gem');
    tick(d, GLASSES_SECONDS + 0.1, view({ heroSpeed: 0 }));
    expect(d.step).toBe('follow');
    expect(d.leadTo).toBe('trampoline');
    expect(leads.at(-1)).toEqual(PLACES[0]);
    expect(said.at(-1)!.extra).toBe('wTrampoline');
  });

  it('the jump tip is only said at the trampoline; two bounces finish the tour and lead on', () => {
    const { d, said, leads } = setup();
    d.begin(true);
    tick(d, WELCOME_SECONDS + 0.1, view({ heroSpeed: 0 }));
    tick(d, 2, view({ heroSpeed: 4 }));
    tick(d, 0.2, view({ look: 1 }));
    tick(d, GLASSES_SECONDS + 0.2);
    tick(d, 30, view({ hero: { x: 30, z: -10 } }));
    expect(said.some((l) => l.id === 'intro:jump')).toBe(false);
    d.update(0.1, view({ hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' }));
    expect(d.step).toBe('jump');
    expect(said.at(-1)!.id).toBe('intro:jump');
    expect(said.at(-1)!.action).toBe('jump');
    d.onTrampolineApex();
    d.onTrampolineApex();
    expect(d.step).toBe('done');
    expect(d.done.has('trampoline')).toBe(true);
    // Leads on to the nearest fun place from the trampoline.
    expect(d.leadTo).toBe('bouncePads');
    expect(leads.at(-1)).toEqual(PLACES[1]);
    expect(said.some((l) => l.id === 'guide:follow')).toBe(true);
  });

  it('stops leading after two attractions and lets the child choose', () => {
    const { d, said, leads } = setup();
    d.begin(true);
    tick(d, WELCOME_SECONDS + 0.1);
    tick(d, 2, view({ heroSpeed: 4 }));
    d.update(0.1, view({ hero: { x: 56, z: -22 }, nearAttraction: 'trampoline' }));
    d.onStunt({ kind: 'bigBounce', stars: 1 });
    expect(d.leadTo).toBe('bouncePads');
    tick(d, 0.5, view({ hero: { x: 84, z: -12 }, nearAttraction: 'bouncePads' }));
    expect(d.leadTo).toBeNull();
    d.onStunt({ kind: 'bounce', stars: 0 });
    expect(d.isGuiding).toBe(false);
    expect(leads.at(-1)).toBeNull();
    expect(ids(said)).toContain('guide:choose');
  });

  it('can be skipped only after 2 s', () => {
    const { d, said, store } = setup();
    d.begin(true);
    tick(d, 1);
    expect(d.skip()).toBe(false);
    tick(d, 1.2);
    expect(d.skip()).toBe(true);
    expect(d.step).toBe('done');
    expect(store.flags.intro).toBe(true);
    expect(said.at(-1)!.text).toBe(INTRO.skipped.text);
  });

  it('a returning player gets "welcome back" and the goal, no tour', () => {
    const { d, said } = setup();
    d.begin(false);
    expect(d.step).toBe('done');
    expect(said.map((l) => l.text)).toEqual(['Welcome back, buddy!', 'Collect 10 Glow Gems!']);
  });
});

describe('Director: rescues', () => {
  it('pushing against a fence for 3 s: Pip fetches the hero, leads, and helps turn', () => {
    const { d, opts } = setup();
    d.begin(true);
    tick(d, WELCOME_SECONDS + 0.1);
    tick(d, 2, view({ heroSpeed: 4 }));
    tick(d, STUCK_PUSH_SECONDS + 0.2, view({ hero: { x: 98, z: -40 }, heroSpeed: 0.8, pushing: true }));
    expect(d.rescues).toBe(1);
    expect(d.leadTo).toBe('trampoline');
    expect(opts.at(-1)).toMatchObject({ fetch: true, assist: true });
  });

  it('wandering away from everything for 15 s brings Pip over (while new)', () => {
    const { d } = setup();
    d.begin(true);
    tick(d, WELCOME_SECONDS + 0.1);
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
    tick(d, WELCOME_SECONDS + 0.1);
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
    d.update(0.1, view({ nearAttraction: 'garage' }));
    expect(said.at(-1)!.text).toBe('Drive!');
    expect(said.at(-1)!.action).toBe('use');
    said.length = 0;
    d.update(0.1, view({ nearAttraction: 'garage' }));
    expect(said).toEqual([]);
  });

  it('chest hints win over generic tips and repeat with a cooldown', () => {
    const { d, said } = setup();
    d.begin(false);
    tick(d, 30, view({ heroSpeed: 0, hero: { x: 0, z: 40 } }));
    said.length = 0;
    // At a locked chest when the compass tip would be due: "Find the key!" (key pictogram) only.
    tick(d, 20, view({ chestHint: 'findKey', heroSpeed: 0, hero: { x: 0, z: 40 } }));
    expect(said[0].text).toBe('Find the key!');
    expect(said[0].icon).toBe('key');
    expect(said[0].priority).toBe(PRIORITY.story);
    expect(said.some((l) => l.id?.startsWith('tip:'))).toBe(false);
    said.length = 0;
    d.update(0.1, view({ chestHint: 'findKey', busy: true }));
    said.length = 0;
    tick(d, 2, view({ chestHint: 'findKey', busy: true }));
    expect(said).toEqual([]);
  });

  it('stuck for 40 s suggests the nearest attraction not tried yet; progress resets it', () => {
    const { d, said, store } = setup();
    for (const t of ['missions', 'timer', 'skill', 'help', 'pip', 'compass']) store.markTip(t);
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
    for (const t of ['missions', 'timer', 'skill', 'help', 'pip', 'compass']) store.markTip(t);
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
    tick(d, 52);
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
