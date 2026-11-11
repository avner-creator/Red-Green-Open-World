import { describe, expect, it } from 'vitest';
import { wordCount } from '../../src/buddy/dialogue';
import { currentGoal, missionGoal } from '../../src/buddy/goals';
import { ATTRACTIONS, CHEST, CHUTE, COUNT, EXPLAIN, IDLE, INTRO, REACT, RESCUE, RETURNING, TIPS, follow, needGems, skillTip, suggest } from '../../src/buddy/script';
import type { ScriptLine } from '../../src/buddy/script';
import type { MissionKind, MissionState } from '../../src/types';

const keys = { use: 'E', jump: 'Space', skill: 'Q' };
const all: ScriptLine[] = [
  ...Object.values(INTRO),
  RETURNING,
  ...Object.values(TIPS),
  ...Object.values(EXPLAIN).filter((x): x is ScriptLine => !!x),
  ...Object.values(ATTRACTIONS).map((a) => a.howTo(keys)),
  ...Object.keys(ATTRACTIONS).map((a) => suggest(a as keyof typeof ATTRACTIONS)),
  ...Object.values(CHEST),
  RESCUE,
  ...Object.keys(ATTRACTIONS).map((a) => follow(a as keyof typeof ATTRACTIONS)),
  CHUTE(keys),
  needGems(12),
  skillTip('LB'),
  ...IDLE,
  ...Object.values(REACT),
  ...COUNT.map((text) => ({ text, icon: 'wTrampoline' as const })),
];

const kinds: MissionKind[] = ['collectGems', 'megaGems', 'combo', 'bounceHeight', 'openChest', 'driveGems', 'landRings', 'stars'];
const missions = kinds.map((kind, i): MissionState => ({ id: `m${i}`, kind, icon: 'mission', target: 10, reward: 5, progress: 0, done: false }));

describe("Pip's script", () => {
  it('every line has at most six words', () => {
    const lines = [...all, ...missions.map((m) => missionGoal(m).line)];
    for (const l of lines) expect(wordCount(l.text), l.text).toBeLessThanOrEqual(6);
  });

  it('no health, medical or scary words', () => {
    const banned = /\b(health|healthy|medical|medicine|therapy|treat|treatment|patient|doctor|eye care|amblyopia|lazy|hurt|injur|pain|blood|die|dead|kill|weapon|fight)/i;
    for (const l of all) expect(banned.test(l.text), l.text).toBe(false);
  });

  it('every line has a pictogram', () => {
    for (const l of all) expect(l.icon).toBeTruthy();
  });

  it('no reading needed: the text never names a key; button lines carry an action glyph', () => {
    for (const l of all) expect(/\bpress\b|\btap\b|\bspace\b|\bhold the button/i.test(l.text), l.text).toBe(false);
    for (const l of [INTRO.move, INTRO.look, INTRO.jump, CHUTE(keys), skillTip('Q'), ATTRACTIONS.garage.howTo(keys), ATTRACTIONS.ranch.howTo(keys)]) {
      expect(l.action, l.text).toBeTruthy();
    }
  });

  it('the chest hint shows the key first', () => {
    expect(CHEST.findKey.icon).toBe('key');
  });
});

describe('goals', () => {
  it('uses the first unfinished mission', () => {
    const g = currentGoal({ missions: [{ ...missions[0], done: true }, missions[2]], visited: new Set(), attractions: ['trampoline'], chestsOpened: 0, earned: 0 });
    expect(g.line.text).toBe('Get a x10 combo!');
  });

  it('falls back to trying attractions, then a chest, then earning gems', () => {
    const base = { missions: [], attractions: ['trampoline', 'balloon'] as const, chestsOpened: 0, earned: 0 };
    expect(currentGoal({ ...base, visited: new Set() }).line.text).toBe('Try the big trampoline!');
    expect(currentGoal({ ...base, visited: new Set(['trampoline', 'balloon'] as const) }).line.text).toBe('Open a treasure chest!');
    expect(currentGoal({ ...base, chestsOpened: 1, visited: new Set(['trampoline', 'balloon'] as const) }).line.icon).toBe('gem');
  });
});
