/**
 * Glasses play: "Odd one out" pedestals and "Line-up" bubble targets, on one shared page.
 * For each: the layers touch only their own channel (all 4 lens/eye combos), the answer is
 * invisible without the weak eye (bit-identical frames), a full round to a hit and to a miss
 * through the real input/interaction path, the draw budget, far-idle, and R/G screenshots.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses';
let page: Page;
let consoleErrors: string[] = [];

interface Ev {
  type: string;
  mechanic?: string;
  kind?: string;
  tier?: number;
  hit?: boolean;
  icon?: string;
}

async function events(): Promise<Ev[]> {
  return page.evaluate(() => (window as unknown as { __tellEvents: Ev[] }).__tellEvents.splice(0));
}

async function save(dir: string, name: string): Promise<void> {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  const img = await canvasShot(page, `${OUT}/${dir}/${name}-full.png`);
  writeFileSync(`${OUT}/${dir}/${name}-R.png`, PNG.sync.write(channelOnly(img, 0)));
  writeFileSync(`${OUT}/${dir}/${name}-G.png`, PNG.sync.write(channelOnly(img, 1)));
}

/** Stand `dist` metres in front of the middle pedestal (approach side), facing it. */
async function standAtOddOne(dist: number, lookUp = 0): Promise<void> {
  await page.evaluate(([d, up]) => {
    const rg = window.__rg!;
    const dbg = window.__rgGlasses!.debug('oddone') as { buttons: number[][]; facing: number };
    const [bx, , bz] = dbg.buttons[1];
    const x = bx + Math.sin(dbg.facing) * d;
    const z = bz + Math.cos(dbg.facing) * d;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.05, z, dbg.facing + Math.PI);
    rg.step(1 / 60, 20, false);
    if (up) {
      rg.inject({ lookY: -up / 10 });
      rg.step(1 / 60, 10, false);
      rg.inject(null);
      rg.step(1 / 60, 20, false);
    }
    rg.step(1 / 60, 1);
  }, [dist, lookUp]);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    const w = window as unknown as { __tellEvents: Ev[] };
    w.__tellEvents = [];
    rg.ctx.events.on('glasses:result', (e) => w.__tellEvents.push({ type: 'result', ...e }));
    rg.ctx.events.on('ui:toast', (e) => w.__tellEvents.push({ type: 'toast', icon: e.icon }));
  });
});

test.afterAll(async () => {
  await page.close();
});

// ───────────────────────────── Odd one out ─────────────────────────────

test('odd one out: weak shapes touch only the weak channel; answer hidden from the strong eye', async () => {
  await page.evaluate(() => {
    window.__rgGlasses!.goto('oddone');
    window.__rg!.step(1 / 60, 2, false);
  });
  expect(await page.evaluate(() => window.__rgGlasses!.active('oddone'))).toBe(true);
  await standAtOddOne(1.9, 0.12);
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { level: 0, answer: 1 }));
  await page.evaluate(() => window.__rg!.render());
  await save('oddone', 'level0');
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: 'oddone' });

  const answer = (a: number) => async (): Promise<void> => {
    await page.evaluate((x) => window.__rgGlasses!.force('oddone', { answer: x }), a);
  };
  for (const level of [0, 6]) {
    await page.evaluate((l) => window.__rgGlasses!.force('oddone', { level: l, answer: 0 }), level);
    await expectAnswerBlindWithoutWeakEye(page, { setA: answer(0), setB: answer(2), label: `oddone level ${level}` });
  }
  await page.evaluate(() => {
    window.__rgGlasses!.force('oddone', { level: 6, answer: 2 });
    window.__rg!.render();
  });
  await save('oddone', 'level6');
  await page.evaluate(() => {
    window.__rgGlasses!.force('oddone', { level: 2, answer: 0 });
    window.__rg!.render();
  });
  await save('oddone', 'level2');
});

test('odd one out: a hit and a miss through the button prompts; the staircase moves', async () => {
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { level: 2, answer: 1 }));
  await standAtOddOne(1.05);
  await events();
  const pressMiddle = async (): Promise<void> => {
    await page.evaluate(() => {
      const rg = window.__rg!;
      const f = rg.ctx.interactions.focused;
      if (!f || f.id !== 'glasses-oddone-1') throw new Error(`focused: ${f?.id ?? 'none'}`);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
    });
  };
  // All three prompts behave alike: every one enabled while a round asks.
  await pressMiddle();
  let dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'feedback', pressed: 1, lastHit: true, level: 3, hits: 1 });
  let ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  // Celebration in view (confetti counts against the budget while it flies).
  await page.evaluate(() => window.__rg!.step(1 / 60, 12));
  await expectDrawBudget(page, 'oddone', 6);
  await save('oddone', 'hit');

  // Next round after the feedback, then a miss (answer forced away from the middle).
  await page.evaluate(() => window.__rg!.step(1 / 60, 110, false));
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'ask', level: 3 });
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { answer: 0 }));
  await pressMiddle();
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'feedback', lastHit: false, level: 2, misses: 1 });
  ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: false }]);
  expect(ev.some((e) => e.type === 'toast')).toBe(false);
  await page.evaluate(() => window.__rg!.step(1 / 60, 110, false));
});

// ───────────────────────────── Line-up ─────────────────────────────

async function standOnPad(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgGlasses!.goto('lineup');
    rg.step(1 / 60, 2, false);
    const d = window.__rgGlasses!.debug('lineup') as { pad: number[]; padYaw: number };
    rg.teleport(d.pad[0], d.pad[1] + 0.05, d.pad[2], d.padYaw);
    rg.step(1 / 60, 10, false);
    // Look up a little (as a player would, to see the bubbles).
    rg.inject({ lookY: -0.03 });
    rg.step(1 / 60, 12, false);
    rg.inject(null);
    rg.step(1 / 60, 30, false);
    window.__rgGlasses!.force('lineup', { live: true, tier: 1 });
    rg.step(1 / 60, 1);
  });
}

test('line-up: reticle only in the weak channel, bubbles only in the strong; offset hidden from the strong eye', async () => {
  await standOnPad();
  const dbg = await page.evaluate(() => window.__rgGlasses!.debug('lineup'));
  expect(dbg).toMatchObject({ onPad: true, active: true });
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'reticle', target: 0 });
    window.__rg!.render();
  });
  await save('lineup', 'aim');
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'lineup' });

  await page.evaluate(() => window.__rgGlasses!.force('lineup', { aim: 'none' }));
  const at = (theta: number, phi: number) => async (): Promise<void> => {
    await page.evaluate((o) => window.__rgGlasses!.force('lineup', { offset: o }), [theta, phi]);
  };
  await expectAnswerBlindWithoutWeakEye(page, { setA: at(5, 40), setB: at(6.5, 140), label: 'lineup offset' });
  await page.evaluate(() => window.__rgGlasses!.force('lineup', { offset: null }));
});

test('line-up: hold the reticle on a bubble → pop; a bubble left alone → drifts away (miss)', async () => {
  await events();
  // The test aimer keeps the BUBBLE in the screen centre: never pops (the reticle is off it).
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'centre', target: 0 });
    window.__rg!.step(1 / 60, 150, false);
  });
  let dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as { pops: number; misses: number; hold: number };
  expect(dbg.pops).toBe(0);
  expect(dbg.hold).toBe(0);

  // The test aimer puts the reticle on the bubble: pops after ~1 s.
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'reticle', target: 0 });
    window.__rg!.step(1 / 60, 40);
  });
  dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg;
  expect(dbg.pops).toBe(0);
  expect(dbg.hold).toBeGreaterThan(0.5);
  await save('lineup', 'hold');
  await page.evaluate(() => window.__rg!.step(1 / 60, 26));
  dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg;
  expect(dbg.pops).toBe(1);
  await save('lineup', 'pop');
  await expectDrawBudget(page, 'lineup', 6);
  let ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);

  // Leave the bubbles alone: after 15 s on the pad they drift away (misses).
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'none', age: 14.7 });
    window.__rg!.step(1 / 60, 30, false);
  });
  dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg;
  expect(dbg.misses).toBeGreaterThanOrEqual(1);
  ev = await events();
  const res = ev.filter((e) => e.type === 'result');
  expect(res.length).toBeGreaterThanOrEqual(1);
  for (const r of res) expect(r).toMatchObject({ mechanic: 'lineup', kind: 'lineUp', hit: false, tier: 1 });

  // Off the pad: nothing shows and no misses are counted.
  const before = dbg.misses;
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { onPad: false, age: 14.9 });
    window.__rg!.step(1 / 60, 60, false);
  });
  dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg;
  expect(dbg.misses).toBe(before);
  expect(await page.evaluate(() => window.__rgGlasses!.debug('lineup').onPad)).toBe(false);
  await page.evaluate(() => window.__rgGlasses!.force('lineup', { onPad: null }));
});

test('both mechanics stay within the draw budget and go idle when the player is far', async () => {
  await expectDrawBudget(page, 'oddone', 6);
  await expectDrawBudget(page, 'lineup', 6);
  // For each: walk off 85 m (any direction with land under it), beyond the far-idle radius.
  for (const id of ['oddone', 'lineup']) {
    const far = await page.evaluate((me) => {
      const rg = window.__rg!;
      const w = rg.ctx.world;
      const m = window.__rgGlasses!.sites().find((s) => s.id === me)!;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const x = m.x + Math.sin(a) * 85;
        const z = m.z + Math.cos(a) * 85;
        if (!w.isLand(x, z) || w.heightAt(x, z) < w.waterLevel + 1) continue;
        rg.teleport(x, w.heightAt(x, z) + 0.1, z);
        break;
      }
      rg.step(1 / 60, 2, false);
      const p = rg.ctx.player.position;
      return Math.hypot(p.x - m.x, p.z - m.z);
    }, id);
    expect(far, id).toBeGreaterThan(70);
    expect(await page.evaluate((me) => window.__rgGlasses!.active(me), id), id).toBe(false);
  }
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
