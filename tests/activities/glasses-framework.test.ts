import { describe, expect, it } from 'vitest';
import { GLASSES } from '../../src/activities/glasses/constants';
import { FarIdle, hashString, seededRng } from '../../src/activities/glasses/idle';
import { GLASSES_PICTOS, glassesPictoUv, swatchUv } from '../../src/activities/glasses/pictos';
import { pay, result } from '../../src/activities/glasses/rewards';
import type { RewardCtx } from '../../src/activities/glasses/rewards';
import type { GameEvents } from '../../src/types';

function fakeCtx(profile?: unknown): RewardCtx & { emitted: [string, unknown][]; sounds: string[] } {
  const emitted: [string, unknown][] = [];
  const sounds: string[] = [];
  const ctx = {
    emitted,
    sounds,
    events: {
      on: () => () => {},
      emit: <K extends keyof GameEvents>(type: K, e: GameEvents[K]) => {
        emitted.push([type, e]);
      },
    },
    audio: { play: (name: string) => void sounds.push(name) },
  } as RewardCtx & { emitted: [string, unknown][]; sounds: string[] };
  if (profile !== undefined) (ctx as unknown as { profile: unknown }).profile = profile;
  return ctx;
}

describe('glasses rewards', () => {
  it('pays through the profile when it exists, with toast and sound', () => {
    const calls: [number, string][] = [];
    const ctx = fakeCtx({ earn: (n: number, r: string) => calls.push([n, r]) });
    expect(pay(ctx, 3)).toBe(true);
    expect(calls).toEqual([[3, 'mission']]);
    expect(ctx.emitted).toEqual([['ui:toast', { icon: 'gem', text: '+3' }]]);
    expect(ctx.sounds).toEqual(['star']);
  });

  it('without a profile gives only the feedback; zero pays nothing', () => {
    const ctx = fakeCtx();
    expect(pay(ctx, 2.4)).toBe(false);
    expect(ctx.emitted).toEqual([['ui:toast', { icon: 'gem', text: '+2' }]]);
    const broken = fakeCtx({
      earn: () => {
        throw new Error('full');
      },
    });
    expect(pay(broken, 1)).toBe(false);
    const zero = fakeCtx({ earn: () => {} });
    expect(pay(zero, 0)).toBe(false);
    expect(zero.emitted).toEqual([]);
  });

  it('result emits glasses:result', () => {
    const ctx = fakeCtx();
    result(ctx.events, 'oddone', 'tellApart', 2, true);
    expect(ctx.emitted).toEqual([['glasses:result', { mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: true }]]);
  });
});

describe('far-idle', () => {
  it('switches on inside 60 m, off beyond 70 m (hysteresis)', () => {
    const f = new FarIdle(60, 70);
    expect(f.update(100)).toBe(false);
    expect(f.active).toBe(false);
    expect(f.update(65)).toBe(false); // in the band: stays off
    expect(f.update(59)).toBe(true);
    expect(f.active).toBe(true);
    expect(f.update(65)).toBe(false); // in the band: stays on
    expect(f.update(69.9)).toBe(false);
    expect(f.update(71)).toBe(true);
    expect(f.active).toBe(false);
    f.update(10);
    f.reset();
    expect(f.active).toBe(false);
  });

  it('the mini-games default to on inside 40 m, off beyond 48 m (layer content unreadable farther out)', () => {
    expect(GLASSES.activateRadius).toBe(40);
    expect(GLASSES.deactivateRadius).toBe(48);
    const f = new FarIdle();
    expect(f.update(45)).toBe(false); // the plaza → a mini-game 45 m away: stays off
    expect(f.update(39)).toBe(true);
    expect(f.update(47.5)).toBe(false); // hysteresis band: stays on
    expect(f.update(49)).toBe(true);
    expect(f.active).toBe(false);
  });
});

describe('glasses helpers', () => {
  it('seeded rng is deterministic per id', () => {
    const a = seededRng(hashString('glowflies'));
    const b = seededRng(hashString('glowflies'));
    const c = seededRng(hashString('toys'));
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect(c()).not.toEqual(sa[0]);
    for (const v of sa) expect(v >= 0 && v < 1).toBe(true);
  });

  it('atlas cells do not overlap and stay inside the texture', () => {
    const rects = [...GLASSES_PICTOS.map(glassesPictoUv), ...(['wood', 'woodDark', 'ink', 'cream'] as const).map(swatchUv)];
    expect(GLASSES_PICTOS.length).toBeLessThanOrEqual(15);
    for (const [u, v, du, dv] of rects) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(u + du).toBeLessThanOrEqual(1);
      expect(v + dv).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i], rects[j]];
        const overlap = a[0] < b[0] + b[2] - 1e-9 && b[0] < a[0] + a[2] - 1e-9 && a[1] < b[1] + b[3] - 1e-9 && b[1] < a[1] + a[3] - 1e-9;
        expect(overlap).toBe(false);
      }
  });
});
