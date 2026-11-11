/**
 * Carnival games row (Stream J): E at a booth starts a round, every playable booth plays a full
 * round to a result (autopilot), R leaves safely, and every booth's weak-eye-only objects change
 * only the weak channel (all 4 lens/eye combinations, canvas read-back like vision.spec.ts).
 */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';
import type { GameId } from '../../src/activities/carnival/layout';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/carnival-games';
let page: Page;
let consoleErrors: string[] = [];
let playable: GameId[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

const info = () => page.evaluate(() => window.__rgCarnival!.info());

/** Step simulation-only frames until the round shows its result (or give up). */
async function playToResult(maxSeconds = 70): Promise<void> {
  await page.evaluate((max) => {
    const rg = window.__rg!;
    const c = window.__rgCarnival!;
    for (let t = 0; t < max && c.info().phase !== 'result'; t += 1) rg.step(1 / 30, 30, false);
  }, maxSeconds);
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
  });
  playable = (await info()).booths.filter((b) => b.playable).map((b) => b.id);
});

test.afterAll(async () => {
  await page.close();
});

test('the row stands on dry land with all five booths, at least three playable', async () => {
  const i = await info();
  expect(i.booths).toHaveLength(5);
  expect(playable.length).toBeGreaterThanOrEqual(3);
  const land = await page.evaluate(() => {
    const w = window.__rg!.ctx.world;
    return window.__rgCarnival!.info().booths.every((b) => w.isLand(b.stand[0], b.stand[2]));
  });
  expect(land).toBe(true);
});

test('E at a booth starts a round (first play free); R leaves safely', async () => {
  const id = playable[0];
  const r = await page.evaluate((id) => {
    const rg = window.__rg!;
    const c = window.__rgCarnival!;
    const b = c.info().booths.find((x) => x.id === id)!;
    rg.teleport(b.stand[0], b.stand[1], b.stand[2], b.yaw);
    rg.step(1 / 30, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 30, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 10, false);
    const started = c.info();
    rg.inject({ respawnPressed: true });
    rg.step(1 / 30, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 5, false);
    const p = rg.state();
    return { started, after: c.info(), mode: p.playerMode, pos: p.playerPosition, stand: b.stand };
  }, id);
  expect(r.started.active).toBe(id);
  expect(r.started.phase).toBe('count');
  expect(r.started.freeUsed).toContain(id);
  expect(r.after.active).toBeNull();
  expect(r.mode).toBe('walk');
  expect(Math.hypot(r.pos[0] - r.stand[0], r.pos[2] - r.stand[2])).toBeLessThan(1.5);
});

test('every playable booth plays a full round to a result', async () => {
  test.setTimeout(240_000);
  const glassesSeen: string[] = [];
  for (const id of playable) {
    const before = await info();
    const r = await page.evaluate((id) => {
      const c = window.__rgCarnival!;
      const rg = window.__rg!;
      const seen = { stunts: 0, toasts: 0, glasses: [] as string[] };
      const offs = [
        rg.ctx.events.on('stunt', () => seen.stunts++),
        rg.ctx.events.on('ui:toast', () => seen.toasts++),
        rg.ctx.events.on('glasses:result', (e) => seen.glasses.push(`${e.mechanic}:${e.hit}`)),
      ];
      (window as unknown as { __cvSeen: typeof seen; __cvOffs: (() => void)[] }).__cvSeen = seen;
      (window as unknown as { __cvOffs: (() => void)[] }).__cvOffs = offs;
      c.autopilot(true);
      const out = c.start(id);
      rg.step(1 / 30, 100, false); // 3-2-1 + a moment of play
      return { out, phase: c.info().phase };
    }, id);
    expect(r.out, id).not.toBe('busy');
    // The first play of EVERY booth is free (QA: only the first booth was); playable[0] had its
    // free play in the test above.
    if (id !== playable[0]) expect(r.out, id).toBe('free');
    expect(r.phase, id).toBe('play');
    await playToResult();
    const res = await page.evaluate(() => {
      const w = window as unknown as { __cvSeen: { stunts: number; toasts: number; glasses: string[] }; __cvOffs: (() => void)[] };
      for (const off of w.__cvOffs) off();
      return { info: window.__rgCarnival!.info(), seen: w.__cvSeen, hud: !!document.querySelector('[data-testid="carnival-replay"]') };
    });
    expect(res.info.phase, id).toBe('result');
    expect(res.info.scores[0], id).toBeGreaterThan(0);
    expect(res.info.result?.won, `${id} ${JSON.stringify(res.info.scores)}`).toBe(true);
    expect(res.info.result?.stars, id).toBeGreaterThanOrEqual(2);
    expect(res.info.plush, id).toBe(before.plush + 1);
    expect(res.seen.stunts, id).toBeGreaterThanOrEqual(1);
    expect(res.seen.toasts, id).toBeGreaterThanOrEqual(1);
    expect(res.hud, id).toBe(true);
    glassesSeen.push(...res.seen.glasses);
    // Replay goes straight back to the countdown; exit hands the player back on foot.
    const after = await page.evaluate(() => {
      const c = window.__rgCarnival!;
      c.replay();
      const replay = c.info().phase;
      c.exit();
      window.__rg!.step(1 / 30, 3, false);
      return { replay, active: c.info().active, mode: window.__rg!.state().playerMode };
    });
    expect(after.replay, id).toBe('count');
    expect(after.active, id).toBeNull();
    expect(after.mode, id).toBe('walk');
  }
  await page.evaluate(() => window.__rgCarnival!.autopilot(false));
  // The booths' weak-eye bonuses report to the glasses tally (only known booth ids; at least one hit).
  const booth = ['balloonPrize', 'ringStar', 'bellSweet', 'luckyDuck', 'glowDodge'];
  for (const g of glassesSeen) expect(booth).toContain(g.split(':')[0]);
  expect(glassesSeen.some((g) => g.endsWith(':true'))).toBe(true);
});

test('a key-masher (Space every 0.5 s, A/D wiggle) gets at most 1 star at every booth; the card equals the wallet gain', async () => {
  test.setTimeout(300_000);
  const rows: string[] = [];
  for (const id of playable) {
    const r = await page.evaluate(
      async ({ id }) => {
        const c = window.__rgCarnival!;
        const rg = window.__rg!;
        c.autopilot(false);
        rg.setRemaining(240); // keep the session clock from ending mid-round
        rg.ctx.profile.earn(10, 'test');
        const out = c.start(id);
        const walletStart = rg.ctx.profile.wallet;
        let k = 0;
        const trail: string[] = [];
        for (; k < 30 * 80 && c.info().phase !== 'result' && c.info().phase !== null; k++) {
          if (k % 30 === 0) trail.push(`${k}:${c.info().phase}:${rg.state().playerMode}`);
          const press = k % 15 === 0;
          rg.inject({
            moveX: Math.floor(k / 15) % 2 ? 1 : -1,
            moveY: ((Math.floor(k / 40) % 3) - 1) * 0.6,
            jumpPressed: press,
            jump: k % 15 < 8,
          });
          rg.step(1 / 30, 1, false);
        }
        rg.inject(null);
        rg.step(1 / 30, 2, false);
        const num = (sel: string): number => {
          const e = document.querySelector<HTMLElement>(sel);
          return e && e.style.display !== 'none' ? Number((e.textContent ?? '').replace(/[^0-9]/g, '') || 0) : 0;
        };
        const info = c.info();
        const card = num('[data-testid="carnival-prize"] .t') + num('[data-testid="carnival-bonus"] .t');
        const res = { trail: `${trail.slice(-2).join(' ')} end ${k}:${info.phase}:${rg.state().playerMode} ${JSON.stringify(rg.errors.slice(-2))}`, out, phase: info.phase, scores: info.scores, stars: info.result?.stars ?? -1, card, gained: rg.ctx.profile.wallet - walletStart };
        c.exit();
        rg.step(1 / 30, 3, false);
        return res;
      },
      { id },
    );
    rows.push(`${id}: ${JSON.stringify(r.scores)} stars ${r.stars} card +${r.card} wallet +${r.gained} (${r.out})`);
    expect(r.phase, `${id} ${r.trail}`).toBe('result');
    expect(r.stars, `${id} ${JSON.stringify(r.scores)}`).toBeLessThanOrEqual(1);
    expect(r.card, id).toBe(r.gained);
  }
  console.log(`carnival masher:\n${rows.join('\n')}`);
});

test('mashing makes the hero dizzy and says so (player:dizzy, for the guide)', async () => {
  const id = playable[0];
  const r = await page.evaluate(
    ({ id }) => {
      const c = window.__rgCarnival!;
      const rg = window.__rg!;
      const got: string[] = [];
      const off = rg.ctx.events.on('player:dizzy', (e) => got.push(`${e.source}:${e.game}:${e.seconds}`));
      c.autopilot(false);
      rg.setRemaining(240);
      rg.ctx.profile.earn(10, 'test');
      c.start(id);
      for (let k = 0; k < 30 * 20 && c.info().phase !== 'play'; k++) rg.step(1 / 30, 1, false);
      const phase = c.info().phase;
      // Six presses in a fifth of a second.
      for (let k = 0; k < 12; k++) {
        rg.inject({ jumpPressed: k % 2 === 0, usePressed: false });
        rg.step(1 / 30, 1, false);
      }
      rg.inject(null);
      rg.step(1 / 30, 2, false);
      off();
      c.exit();
      rg.step(1 / 30, 3, false);
      return { phase, got };
    },
    { id },
  );
  expect(r.phase).toBe('play');
  expect(r.got.length).toBe(1);
  expect(r.got[0]).toMatch(new RegExp(`^carnival:${id}:`));
});

test('weak-eye-only booth objects touch only the weak channel, all 4 combos', async () => {
  test.setTimeout(240_000);
  for (const id of playable) {
    // Start a round and stop mid-play with the booth in view and the weak-eye things showing.
    await page.evaluate((id) => {
      const c = window.__rgCarnival!;
      const rg = window.__rg!;
      c.autopilot(true);
      c.start(id);
      rg.step(1 / 30, 150, false);
    }, id);
    for (const combo of COMBOS) {
      await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
      const frame = async (weak: boolean): Promise<PNG> => {
        await page.evaluate(
          ({ weak, W }) => {
            const rg = window.__rg!;
            rg.setLayerVisible(W, weak);
            rg.render();
          },
          { weak, W: VisionLayer.WeakOnly },
        );
        return canvasShot(page, weak && combo.weak === 'r' && combo.eye.leftLens === 'red' ? `${OUT}/e2e-${id}-weak.png` : undefined);
      };
      const on = await frame(true);
      const off = await frame(false);
      const d = channelDiff(on, off);
      const tag = `${id} ${combo.eye.leftLens}/${combo.eye.weakEye}`;
      expect(d[combo.weak], tag).toBeGreaterThan(40);
      expect(maxOf(d, combo.strong), tag).toBe(0);
      expect(d.maxB, tag).toBe(0);
    }
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.setLayerVisible(1, true);
      window.__rgCarnival!.exit();
      rg.step(1 / 30, 3, false);
    });
  }
  await page.evaluate(() => {
    window.__rgCarnival!.autopilot(false);
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
  });
});

test('no console errors while playing the carnival', () => {
  expect(consoleErrors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});
