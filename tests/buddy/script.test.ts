import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bubbleMode, wordCount } from '../../src/buddy/dialogue';
import { currentGoal, missionGoal } from '../../src/buddy/goals';
import {
  ATTRACTIONS, BOOTHS, CHEST, CHUTE, COUNT, ECON, EXPLAIN, FOLLOW_AGAIN, HOWTO, INTRO, POOLS, RESCUE, RETURNING, STORY, TIPS, follow, needGems, skillTip,
  suggest,
} from '../../src/buddy/script';
import type { HowToTopic, ScriptLine } from '../../src/buddy/script';
import { clipId } from '../../src/buddy/voiceLines';
import { GLASSES_ATTRACTIONS } from '../../src/buddy/types';
import type { Attraction } from '../../src/buddy/types';
import { topicOfPrompt } from '../../src/buddy/topics';
import type { MissionKind, MissionState } from '../../src/types';

const keys = { use: 'E', jump: 'Space', skill: 'Q' };
const names = Object.keys(ATTRACTIONS) as Attraction[];
const all: ScriptLine[] = [
  ...STORY,
  ...Object.values(INTRO),
  RETURNING,
  ...Object.values(TIPS),
  ...Object.values(EXPLAIN).filter((x): x is ScriptLine => !!x),
  ...Object.values(HOWTO).flat(),
  ...Object.values(ECON),
  ...names.map((a) => suggest(a)),
  ...Object.values(CHEST),
  RESCUE,
  ...names.map((a) => follow(a)),
  ...FOLLOW_AGAIN.map((text) => ({ text, icon: 'paw' as const })),
  CHUTE(keys),
  needGems(12),
  skillTip('LB'),
  ...Object.values(POOLS).flat(),
  ...COUNT.map((text) => ({ text, icon: 'wTrampoline' as const })),
];

const kinds: MissionKind[] = ['collectGems', 'megaGems', 'combo', 'bounceHeight', 'openChest', 'driveGems', 'landRings', 'stars'];
const missions = kinds.map((kind, i): MissionState => ({ id: `m${i}`, kind, icon: 'mission', target: 10, reward: 5, progress: 0, done: false }));

describe("Pip's script", () => {
  it('every line has at most twelve words', () => {
    const lines = [...all, ...missions.map((m) => missionGoal(m).line)];
    for (const l of lines) expect(wordCount(l.text), l.text).toBeLessThanOrEqual(12);
  });

  it('no health, medical or scary words', () => {
    const banned = /\b(health|healthy|medical|medicine|therapy|treat|treatment|patient|doctor|eye care|amblyopia|lazy|weak|strong|hurt|injur|pain|blood|die|dead|kill|weapon|fight|exercise)/i;
    for (const l of all) expect(banned.test(l.text), l.text).toBe(false);
  });

  it('every line has a pictogram', () => {
    for (const l of all) expect(l.icon).toBeTruthy();
  });

  it('no reading needed: the text never names a key; button lines carry an action glyph', () => {
    for (const l of all) expect(/\bpress\b|\btap\b|\bspace\b|\bhold the button/i.test(l.text), l.text).toBe(false);
    for (const l of [INTRO.jump, CHUTE(keys), skillTip('Q'), HOWTO.garage[0], HOWTO.ranch[0], HOWTO.dinoRing[1], HOWTO.bubbleArena[1]]) {
      expect(l.action, l.text).toBeTruthy();
    }
  });

  it('the welcome story is 4–6 beats, about 25–35 s, and tells the Fun Pass goal', () => {
    expect(STORY.length).toBeGreaterThanOrEqual(4);
    expect(STORY.length).toBeLessThanOrEqual(6);
    const words = STORY.reduce((n, l) => n + wordCount(l.text), 0);
    // About 2.4 spoken words per second with the puppy speed-up.
    expect(words / 2.4).toBeGreaterThan(22);
    expect(words / 2.4).toBeLessThan(36);
    expect(STORY.some((l) => /Fun Pass/.test(l.text))).toBe(true);
    expect(STORY.some((l) => /balloon/i.test(l.text))).toBe(true);
    expect(STORY.at(-1)!.text).toMatch(/Follow me/);
  });

  it('every attraction, mini-game, booth and secret has a spoken how-to', () => {
    const topics: HowToTopic[] = [...names, ...BOOTHS.map((b) => `booth:${b}` as const), 'vault', 'chest', 'workshop', 'secrets'];
    for (const t of topics) {
      const h = HOWTO[t];
      expect(h, t).toBeTruthy();
      expect(h.length, t).toBeGreaterThanOrEqual(1);
      expect(h.length, t).toBeLessThanOrEqual(3);
    }
    for (const g of GLASSES_ATTRACTIONS) expect(HOWTO[g].length).toBeGreaterThanOrEqual(1);
  });

  it('every how-to, story and pool line has a recorded clip', () => {
    const manifest = JSON.parse(readFileSync('public/assets/voice/manifest.json', 'utf8')) as { clips: Record<string, { file: string }> };
    const lines = [...STORY, ...Object.values(HOWTO).flat(), ...Object.values(ECON), ...Object.values(POOLS).flat()];
    for (const l of lines) {
      const c = manifest.clips[clipId(l.text)];
      expect(c, l.text).toBeTruthy();
      expect(existsSync(join('public/assets/voice', c.file)), c.file).toBe(true);
    }
  });

  it('reaction pools have at least eight different lines each', () => {
    for (const [id, pool] of Object.entries(POOLS)) {
      expect(pool.length, id).toBeGreaterThanOrEqual(8);
      expect(new Set(pool.map((l) => l.text)).size, id).toBe(pool.length);
    }
    // The owner heard these too often: gone.
    expect(all.some((l) => /wowee|wowie|great job|good job/i.test(l.text))).toBe(false);
  });

  it('praise lines are bubble-less while Pip talks; text bubbles only without his voice', () => {
    expect(bubbleMode({ praise: true }, true)).toBe('none');
    expect(bubbleMode({}, true)).toBe('compact');
    expect(bubbleMode({}, false)).toBe('full');
    expect(bubbleMode({ praise: true }, false)).toBe('full');
    for (const [id, pool] of Object.entries(POOLS) as [string, readonly ScriptLine[]][]) {
      if (id === 'idle') continue;
      for (const l of pool) expect(l.praise, l.text).toBe(true);
    }
  });

  it('use prompts map to the right how-to', () => {
    expect(topicOfPrompt('carnival-ringToss')).toBe('booth:ringToss');
    expect(topicOfPrompt('vault-cliff')).toBe('vault');
    expect(topicOfPrompt('chest2-key')).toBe('chest');
    expect(topicOfPrompt('vehicle:horse1', true)).toBe('ranch');
    expect(topicOfPrompt('vehicle:buggy')).toBe('garage');
    expect(topicOfPrompt('glasses-oddone-1')).toBe('oddone');
    expect(topicOfPrompt('sky-dragon')).toBe('dragonRoost');
    expect(topicOfPrompt('balloon')).toBe('balloon');
    expect(topicOfPrompt('something-else')).toBeNull();
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
