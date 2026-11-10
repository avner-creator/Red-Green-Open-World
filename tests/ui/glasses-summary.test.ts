import { describe, expect, it } from 'vitest';
import type { GlassesSummary, GlassesTally } from '../../src/types';
import { buildSummary, formatChallenge, formatTime, makeCell, mechanicName } from '../../src/ui/glasses/summaryModel';

const t = (mechanic: string, kind: GlassesTally['kind'], tier: 1 | 2 | 3, hits: number, misses: number): GlassesTally => ({ mechanic, kind, tier, hits, misses });
const off = { enabled: false, level: 0, maxLevel: 6, stepsUp: 0, stepsDown: 0 };

describe('glasses summary model', () => {
  it('formats names', () => {
    expect(mechanicName('glowflies')).toBe('Glow-flies');
    expect(mechanicName('oddone')).toBe('Odd one out');
    expect(mechanicName('oddOneOut')).toBe('Odd one out');
    const table: Record<string, string> = { gems: 'Glow gems', chestKeys: 'Chest keys', chests: 'Chests', toys: "Pip's lost toys", lineup: 'Line-up bubbles', gates: 'Half-symbol gates', dotsigns: 'Dot pictures' };
    for (const [id, name] of Object.entries(table)) expect(mechanicName(id)).toBe(name);
    expect(mechanicName('some_new-thing')).toBe('Some New Thing');
    expect(mechanicName('chestKey')).toBe('Chest Key');
    expect(mechanicName('')).toBe('Other');
  });

  it('formats time and challenge', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(305.4)).toBe('5:05');
    expect(formatTime(-3)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatChallenge(off)).toBe('Off');
    expect(formatChallenge(undefined)).toBe('Off');
    expect(formatChallenge({ enabled: true, level: 2, maxLevel: 6, stepsUp: 3, stepsDown: 1 })).toBe('On · step 2 of 6 · 3 up, 1 down');
  });

  it('computes cells and rounds rates', () => {
    expect(makeCell(1, 2)).toMatchObject({ tries: 3, rate: 33, counts: '1 / 3', rateText: '33%' });
    expect(makeCell(2, 1).rate).toBe(67);
    expect(makeCell(0, 0)).toMatchObject({ rate: null, rateText: '–', counts: '0 / 0' });
    expect(makeCell(5, 0).rate).toBe(100);
  });

  it('groups by kind in the fixed order, one line per mechanic, with totals', () => {
    const s: GlassesSummary = {
      rows: [
        t('oddone', 'tellApart', 2, 1, 1),
        t('glowflies', 'find', 1, 3, 1),
        t('glowflies', 'find', 3, 0, 2),
        t('gems', 'find', 1, 4, 0),
        t('hatTrick', 'onHero', 1, 1, 0),
        t('weird', 'mystery' as GlassesTally['kind'], 1, 1, 1),
        t('oddone', 'tellApart', 2, 1, 0), // same mechanic and tier: merged
      ],
      seconds: 125,
      challenge: { enabled: true, level: 1, maxLevel: 6, stepsUp: 2, stepsDown: 1 },
    };
    const m = buildSummary(s);
    expect(m.empty).toBe(false);
    expect(m.groups.map((g) => g.label)).toEqual(['Find', 'Tell apart', 'On the hero', 'Mystery']);
    const find = m.groups[0]!;
    expect(find.rows.map((r) => r.name)).toEqual(['Glow gems', 'Glow-flies']);
    const fly = find.rows[1]!;
    expect(fly.tiers.map((c) => c.counts)).toEqual(['3 / 4', '0 / 0', '0 / 2']);
    expect(fly.tiers[0]!.rateText).toBe('75%');
    expect(fly.tiers[1]!.rateText).toBe('–');
    expect(fly.total.counts).toBe('3 / 6');
    expect(m.groups[1]!.rows[0]!.tiers[1]!.counts).toBe('2 / 3');
    expect(m.tiers.map((c) => c.counts)).toEqual(['9 / 11', '2 / 3', '0 / 2']);
    expect(m.total.counts).toBe('11 / 16');
    expect(m.total.rateText).toBe('69%');
    expect(m.time).toBe('2:05');
    expect(m.challenge).toBe('On · step 1 of 6 · 2 up, 1 down');
  });

  it('handles empty and missing input', () => {
    for (const input of [undefined, null, { rows: [], seconds: 0, challenge: off }]) {
      const m = buildSummary(input);
      expect(m.empty).toBe(true);
      expect(m.groups).toEqual([]);
      expect(m.total.rateText).toBe('–');
    }
    expect(buildSummary(undefined).challenge).toBe('Off');
  });

  it('never uses advice or health words in its labels', () => {
    const text = JSON.stringify(buildSummary({ rows: [t('gems', 'find', 1, 1, 1)], seconds: 60, challenge: off }));
    expect(text).not.toMatch(/good|poor|better|improv|training|exercise|therap|treatment|vision|amblyop|lazy|health|patient|score/i);
  });
});
