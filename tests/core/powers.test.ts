import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '../../src/core/characters/catalog';
import { EXTRA, ExtraPowerMachine, type ExtraAction } from '../../src/core/skills-extra';
import { setExtraPowerHook, SkillMachine, type SkillFrame } from '../../src/core/skills';
import {
  choosePower,
  chosenPower,
  freePowers,
  getPower,
  isNativePower,
  POWERS,
  powersFor,
  powerState,
  setPowerStore,
} from '../../src/core/skills-powers';

const DT = 1 / 60;
const frame = (p: Partial<SkillFrame> = {}): SkillFrame => ({
  dt: DT,
  pressed: false,
  held: false,
  jumpPressed: false,
  grounded: true,
  airTime: 0,
  vy: 0,
  canUse: true,
  ...p,
});
const kinds = (a: ExtraAction[]): string[] => a.map((x) => x.kind);
const memory = (): { data: Record<string, string> } => {
  const box = { data: {} as Record<string, string> };
  setPowerStore({ load: () => ({ ...box.data }), save: (all) => (box.data = { ...all }) });
  return box;
};

afterEach(() => setPowerStore(null));

describe('power pool', () => {
  it('has at least 8 different powers with names and cooldowns', () => {
    expect(POWERS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(POWERS.map((p) => p.id)).size).toBe(POWERS.length);
    for (const p of POWERS) {
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.cooldown).toBeGreaterThan(0);
      // Earned early: within ~10 minutes of gem hunting.
      expect(p.earnAt).toBeLessThanOrEqual(30);
    }
  });

  it('every hero has 3 different free powers (signature first) and can earn the rest', () => {
    for (const c of CHARACTERS) {
      const free = freePowers(c);
      expect(free).toHaveLength(3);
      expect(new Set(free).size).toBe(3);
      expect(free[0]).toBe(c.signature);
      const all = powersFor(c);
      expect(new Set(all).size).toBe(POWERS.length);
      for (const p of free) expect(powerState(c, p, 0)).toBe('free');
      const others = all.filter((p) => !free.includes(p));
      for (const p of others) {
        expect(powerState(c, p, 0)).toBe('locked');
        expect(powerState(c, p, getPower(p).earnAt)).toBe('earned');
      }
    }
  });

  it('remembers the pick per hero and the classic skill follows it', () => {
    const box = memory();
    const frog = getCharacter('frog');
    expect(chosenPower(frog)).toBe('superBounce');
    expect(frog.skill).toBe('superBounce');
    choosePower('frog', 'doubleJump');
    expect(chosenPower(frog)).toBe('doubleJump');
    expect(frog.skill).toBe('doubleJump');
    expect(box.data.frog).toBe('doubleJump');
    // An extra power keeps the signature as the classic skill underneath.
    choosePower('frog', 'bounceBall');
    expect(isNativePower(chosenPower(frog))).toBe(false);
    expect(frog.skill).toBe('superBounce');
    // Another hero is untouched.
    expect(getCharacter('robot').skill).toBe('doubleJump');
  });

  it('ignores a saved id that is not a power', () => {
    setPowerStore({ load: () => ({ frog: 'laser' }), save: () => undefined });
    expect(chosenPower(getCharacter('frog'))).toBe('superBounce');
  });
});

describe('extra powers', () => {
  it('rocket boots: holding thrusts up until the fuel runs out, refuels on the ground', () => {
    const m = new ExtraPowerMachine('rocketBoots');
    const first = m.frame(frame({ held: true }));
    expect(kinds(first)).toEqual(['start', 'up', 'thrust']);
    let vy = 0;
    let n = 0;
    while (m.fuel > 0 && n < 200) {
      const a = m.frame(frame({ held: true, grounded: false, vy }));
      const up = a.find((x) => x.kind === 'up');
      if (up && up.kind === 'up') vy = up.vy;
      n++;
    }
    expect(vy).toBeCloseTo(EXTRA.rocketBoots.maxUp, 1);
    expect(n).toBeLessThanOrEqual(Math.ceil(EXTRA.rocketBoots.fuel / DT) + 1);
    expect(m.cooldown).toBeGreaterThan(0);
    expect(m.frame(frame({ held: true, grounded: false })).some((x) => x.kind === 'up')).toBe(false);
    for (let i = 0; i < 120; i++) m.frame(frame());
    expect(m.fuel).toBe(EXTRA.rocketBoots.fuel);
  });

  it('bounce ball: landings bounce back up while it lasts, then a cooldown', () => {
    const m = new ExtraPowerMachine('bounceBall');
    expect(kinds(m.frame(frame({ pressed: true })))).toContain('start');
    m.frame(frame({ grounded: false, vy: -10 }));
    const land = m.frame(frame({ grounded: true }));
    const up = land.find((x) => x.kind === 'up');
    expect(up && up.kind === 'up' ? up.vy : 0).toBeCloseTo(10 * EXTRA.bounceBall.keep, 3);
    expect(kinds(land)).toContain('boing');
    let ended = false;
    for (let i = 0; i < (EXTRA.bounceBall.time + 1) / DT; i++) if (kinds(m.frame(frame())).includes('end')) ended = true;
    expect(ended).toBe(true);
    expect(m.cooldown).toBeGreaterThan(0);
  });

  it('giant: press grows, press again shrinks', () => {
    const m = new ExtraPowerMachine('giant');
    expect(kinds(m.frame(frame({ pressed: true })))).toEqual(['start']);
    expect(m.running).toBe(true);
    expect(kinds(m.frame(frame({ pressed: true })))).toEqual(['end']);
    expect(m.running).toBe(false);
    expect(kinds(m.frame(frame({ pressed: true })))).toEqual([]); // cooldown
  });

  it('rainbow slide: starts only on the ground and ends by itself', () => {
    const m = new ExtraPowerMachine('rainbowSlide');
    expect(m.frame(frame({ pressed: true, grounded: false }))).toEqual([]);
    expect(kinds(m.frame(frame({ pressed: true })))).toEqual(['start']);
    let ended = false;
    for (let i = 0; i < (EXTRA.rainbowSlide.time + 0.5) / DT; i++) if (kinds(m.frame(frame())).includes('end')) ended = true;
    expect(ended).toBe(true);
  });

  it('bubble shield: bumping into things and hard landings boing you up', () => {
    const m = new ExtraPowerMachine('bubbleShield');
    m.frame(frame({ pressed: true }));
    expect(kinds(m.frame(frame(), { blocked: true }))).toEqual(['up', 'boing']);
    expect(m.frame(frame(), { blocked: true })).toEqual([]); // short gap between bumps
    m.frame(frame({ grounded: false, vy: -20 }));
    expect(kinds(m.frame(frame()))).toEqual(['up', 'boing']);
  });

  it('ends at once when the power cannot be used (ride, menu)', () => {
    const m = new ExtraPowerMachine('giant');
    m.frame(frame({ pressed: true }));
    expect(kinds(m.frame(frame({ canUse: false })))).toEqual(['end']);
  });
});

describe('SkillMachine hand-off', () => {
  afterEach(() => setExtraPowerHook(null));
  it('forwards frames to an active extra power and shows its cooldown', () => {
    const seen: SkillFrame[] = [];
    setExtraPowerHook({ active: () => true, frame: (f) => seen.push(f), cooldown: 2 });
    const s = new SkillMachine('superBounce');
    expect(s.update(frame({ pressed: true }))).toBeNull();
    expect(s.phase).toBe('idle');
    expect(seen).toHaveLength(1);
    expect(s.cooldown).toBe(2);
  });
});
