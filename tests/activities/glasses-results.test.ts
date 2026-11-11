/**
 * Guards the one-line `glasses:result` reports in the older attractions: each listed mechanic id must
 * still be emitted (with a valid kind and tier) from its file and have a readable summary name.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIND_ORDER, KNOWN_NAMES } from '../../src/ui/glasses/summaryModel';

const EXPECTED: ReadonlyArray<{ file: string; mechanic: string; kind: string; hit: boolean; miss: boolean }> = [
  { file: 'carnival/games/balloonPop.ts', mechanic: 'balloonPrize', kind: 'find', hit: true, miss: false },
  { file: 'carnival/games/ringToss.ts', mechanic: 'ringStar', kind: 'find', hit: true, miss: false },
  { file: 'carnival/games/strengthBell.ts', mechanic: 'bellSweet', kind: 'timeIt', hit: true, miss: true },
  { file: 'carnival/games/duckPond.ts', mechanic: 'luckyDuck', kind: 'find', hit: true, miss: false },
  { file: 'carnival/games/glowDodge.ts', mechanic: 'glowDodge', kind: 'follow', hit: true, miss: true },
  { file: 'skyrides/contestScene.ts', mechanic: 'skyBonusHoop', kind: 'lineUp', hit: true, miss: false },
  { file: 'skyrides/contestScene.ts', mechanic: 'skyGolden', kind: 'find', hit: true, miss: false },
  { file: 'skyrides/dragon.ts', mechanic: 'dragonTreasure', kind: 'follow', hit: true, miss: false },
  { file: 'skyrides/dragon.ts', mechanic: 'dragonGolden', kind: 'find', hit: true, miss: false },
  { file: 'foamlava/index.ts', mechanic: 'foamSecret', kind: 'find', hit: true, miss: false },
  { file: 'scoops/index.ts', mechanic: 'scoopsSecret', kind: 'read', hit: true, miss: true },
  { file: 'bubbleball/index.ts', mechanic: 'bubbleRing', kind: 'follow', hit: true, miss: false },
  { file: 'dinosumo/index.ts', mechanic: 'sumoBalloon', kind: 'find', hit: true, miss: false },
  { file: 'dinosumo/index.ts', mechanic: 'sumoBeat', kind: 'timeIt', hit: true, miss: false },
  { file: 'secrets/index.ts', mechanic: 'secretPath', kind: 'follow', hit: true, miss: false },
  { file: 'secrets/index.ts', mechanic: 'vaultDoor', kind: 'lineUp', hit: true, miss: true },
];

const EMIT = /ctx\.events\.emit\('glasses:result', \{ mechanic: '(\w+)', kind: '(\w+)', tier: ([^,]+), hit: (true|false) \}\)/g;

function emitsIn(file: string): Array<{ mechanic: string; kind: string; tier: string; hit: boolean }> {
  const src = readFileSync(resolve(__dirname, '../../src/activities', file), 'utf8');
  return [...src.matchAll(EMIT)].map((m) => ({ mechanic: m[1]!, kind: m[2]!, tier: m[3]!, hit: m[4] === 'true' }));
}

describe('glasses results from existing attractions', () => {
  for (const row of EXPECTED) {
    it(`${row.mechanic} is reported from ${row.file}`, () => {
      const found = emitsIn(row.file).filter((e) => e.mechanic === row.mechanic);
      expect(found.length).toBeGreaterThan(0);
      for (const e of found) {
        expect(e.kind).toBe(row.kind);
        expect(KIND_ORDER).toContain(e.kind);
        // A literal 1|2|3, or a ternary that picks only from those.
        const tiers = e.tier.match(/\d+/g) ?? [];
        expect(tiers.length).toBeGreaterThan(0);
        for (const t of tiers) expect(['1', '2', '3']).toContain(t);
      }
      expect(found.some((e) => e.hit)).toBe(row.hit);
      expect(found.some((e) => !e.hit)).toBe(row.miss);
      expect(KNOWN_NAMES[row.mechanic.toLowerCase()]).toBeTruthy();
    });
  }
});
