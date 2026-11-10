import { describe, expect, it } from 'vitest';
import type { Line } from '../../src/buddy/dialogue';
import { PRIORITY } from '../../src/buddy/dialogue';
import { Director, IDLE_SECONDS, INTRO_TIMEOUT, STUCK_SECONDS } from '../../src/buddy/director';
import type { DirectorSink, DirectorView } from '../../src/buddy/director';
import { createBuddyStore } from '../../src/buddy/store';
import { INTRO } from '../../src/buddy/script';
import type { V2 } from '../../src/buddy/steer';

function setup() {
  const said: Line[] = [];
  const leads: (V2 | null)[] = [];
  const sink: DirectorSink = {
    say: (l) => said.push(l),
    lead: (t) => leads.push(t),
    celebrate: () => {},
    bark: () => {},
    goal: () => ({ id: 'g', line: { text: 'Collect 10 Glow Gems!', icon: 'gem' } }),
    gemWay: () => ({ x: 5, z: 0 }),
    anchor: (n) => (n === 'gearShack' ? { x: 14, z: 5 } : { x: 50, z: -20 }),
    places: () => [
      { name: 'trampoline', x: 58, z: -24 },
      { name: 'balloon', x: 84, z: 64 },
    ],
  };
  const store = createBuddyStore(false);
  const d = new Director(sink, store, () => 0);
  return { d, said, leads, store };
}

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

describe('Director: opening tour', () => {
  it('advances welcome -> glasses -> findGem by time, then waits for a gem', () => {
    const { d, said, leads } = setup();
    d.begin(true);
    expect(d.step).toBe('welcome');
    expect(said[0].text).toBe(INTRO.welcome.text);
    tick(d, INTRO_TIMEOUT.welcome + 0.1);
    expect(d.step).toBe('glasses');
    tick(d, INTRO_TIMEOUT.glasses + 0.1);
    expect(d.step).toBe('findGem');
    expect(leads.at(-1)).toEqual({ x: 5, z: 0 });
    tick(d, 3);
    expect(d.step).toBe('findGem');
    d.onGem({});
    expect(d.step).toBe('wallet');
    const w = said.at(-1)!;
    expect(w.text).toBe(INTRO.wallet.text);
    expect(w.callout).toContain('wallet');
  });

  it('wallet -> shop (leads to the shack) -> trampoline on shop:open -> choose (compass) -> done', () => {
    const { d, said, leads, store } = setup();
    d.begin(true);
    tick(d, INTRO_TIMEOUT.welcome + INTRO_TIMEOUT.glasses + 0.5);
    d.onGem({});
    tick(d, INTRO_TIMEOUT.wallet + 0.1);
    expect(d.step).toBe('shop');
    expect(leads.at(-1)).toEqual({ x: 14, z: 5 });
    d.onShopOpen();
    tick(d, 0.1);
    expect(d.step).toBe('trampoline');
    expect(said.at(-1)!.text).toBe(INTRO.trampoline.text);
    d.onStunt({ kind: 'bigBounce', stars: 1 });
    expect(d.step).toBe('choose');
    expect(said.at(-1)!.callout).toContain('compass');
    tick(d, INTRO_TIMEOUT.choose + 0.1);
    expect(d.step).toBe('done');
    expect(store.flags.intro).toBe(true);
    expect(leads.at(-1)).toBeNull();
  });

  it('never stalls: every step times out, the whole tour fits in about 45 s', () => {
    const { d } = setup();
    d.begin(true);
    tick(d, 46);
    expect(d.step).toBe('done');
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
    expect(said.at(-1)!.text).toBe('Press E to drive!');
    said.length = 0;
    d.update(0.1, view({ nearAttraction: 'garage' }));
    expect(said).toEqual([]);
  });

  it('chest hints repeat with a cooldown, at tip priority', () => {
    const { d, said } = setup();
    d.begin(false);
    said.length = 0;
    d.update(0.1, view({ chestHint: 'findKey', busy: true }));
    expect(said.at(-1)!.text).toBe('Find the key!');
    expect(said.at(-1)!.priority).toBe(PRIORITY.tip);
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
    expect(s?.text).toBe('Try the big trampoline!');
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
    expect(said.at(-1)!.text).toBe('Press Space for the parachute!');
  });
});
