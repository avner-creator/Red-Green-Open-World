/**
 * Glasses play: "Odd one out" pedestals and "Line-up" magic-ring bubbles, on one shared page.
 * For each: the layers touch only their own channel (all 4 lens/eye combos), the answer is
 * invisible without the weak eye (bit-identical frames), a full round to a hit and to a miss
 * through the real input/interaction path, the draw budget, far-idle, and default-camera R/G
 * screenshots (640×360 and 1280×720).
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

/** Full / R-only / G-only of the current frame; `big` also at 1280×720. */
async function save(dir: string, name: string, big = false): Promise<void> {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
  const write = (img: PNG, tag: string): void => {
    writeFileSync(`${OUT}/${dir}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${dir}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  write(await canvasShot(page, `${OUT}/${dir}/${name}-full.png`), name);
  if (big) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
    write(await canvasShot(page, `${OUT}/${dir}/${name}-720p-full.png`), `${name}-720p`);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    await page.evaluate(() => window.__rg!.render());
  }
}

/** Press Use once through the input system; returns the id of the prompt that was focused. */
async function pressUse(): Promise<string | null> {
  return page.evaluate(() => {
    const rg = window.__rg!;
    const f = rg.ctx.interactions.focused;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    return f?.id ?? null;
  });
}

/** Stand where a child presses the middle button, facing the pedestals, default camera. */
async function standAtButtons(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    const d = window.__rgGlasses!.debug('oddone') as { stand: number[]; facing: number };
    rg.teleport(d.stand[0], d.stand[1] + 0.05, d.stand[2], d.facing + Math.PI);
    rg.step(1 / 60, 40, false);
    rg.step(1 / 60, 1);
  });
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
    window.__rg!.step(1 / 60, 30, false);
    window.__rgGlasses!.force('oddone', { level: 0, answer: 2 });
    window.__rg!.step(1 / 60, 1);
  });
  expect(await page.evaluate(() => window.__rgGlasses!.active('oddone'))).toBe(true);
  await save('oddone', 'approach-level0', true);
  await standAtButtons();
  await page.evaluate(() => {
    window.__rgGlasses!.force('oddone', { level: 0, answer: 1 });
    window.__rg!.render();
  });
  await save('oddone', 'buttons-level0', true);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'weak', label: 'oddone' });

  const answer = (a: number) => async (): Promise<void> => {
    await page.evaluate((x) => window.__rgGlasses!.force('oddone', { answer: x }), a);
  };
  for (const level of [0, 6]) {
    await page.evaluate((l) => window.__rgGlasses!.force('oddone', { level: l, answer: 0 }), level);
    await expectAnswerBlindWithoutWeakEye(page, { setA: answer(0), setB: answer(2), label: `oddone level ${level}` });
  }
  await page.evaluate(() => {
    window.__rgGlasses!.force('oddone', { level: 7, answer: 2 });
    window.__rg!.render();
  });
  await save('oddone', 'buttons-level7', true);
});

test('odd one out: a hit and a miss through the button prompts; the staircase moves; a nap after the miss', async () => {
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { level: 2, answer: 1 }));
  await standAtButtons();
  await events();
  expect(await pressUse()).toBe('glasses-oddone-1');
  let dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'feedback', pressed: 1, lastHit: true, level: 3, hits: 1 });
  let ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  await page.evaluate(() => window.__rg!.step(1 / 60, 12));
  await expectDrawBudget(page, 'oddone', 5);
  await save('oddone', 'hit');

  // Next round after the feedback, then a miss (answer forced away from the middle).
  await page.evaluate(() => window.__rg!.step(1 / 60, 110, false));
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'ask', level: 3 });
  await page.evaluate(() => window.__rgGlasses!.force('oddone', { answer: 0 }));
  expect(await pressUse()).toBe('glasses-oddone-1');
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'feedback', lastHit: false, level: 2, misses: 1 });
  ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'oddone', kind: 'tellApart', tier: 2, hit: false }]);
  expect(ev.some((e) => e.type === 'toast')).toBe(false);
  // After the feedback the pedestals nap: no prompt for 5 s, then they wake up.
  await page.evaluate(() => window.__rg!.step(1 / 60, 110));
  await save('oddone', 'nap');
  dbg = await page.evaluate(() => window.__rgGlasses!.debug('oddone'));
  expect(dbg).toMatchObject({ phase: 'ask' });
  expect(dbg.nap as number).toBeGreaterThan(3);
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? null)).toBeNull();
  await page.evaluate(() => window.__rg!.step(1 / 60, 300, false));
  expect(await page.evaluate(() => window.__rg!.ctx.interactions.focused?.id ?? null)).toBe('glasses-oddone-1');
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

test('line-up: ring only in the weak channel, bubbles only in the strong; ring offset hidden from the strong eye', async () => {
  await standOnPad();
  const dbg = await page.evaluate(() => window.__rgGlasses!.debug('lineup'));
  expect(dbg).toMatchObject({ onPad: true, active: true, wanted: 1 });
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'reticle', target: 0 });
    window.__rg!.render();
  });
  await save('lineup', 'ring', true);
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'lineup' });

  await page.evaluate(() => window.__rgGlasses!.force('lineup', { aim: 'none' }));
  const at = (theta: number, phi: number) => async (): Promise<void> => {
    await page.evaluate((o) => window.__rgGlasses!.force('lineup', { offset: o }), [theta, phi]);
  };
  await expectAnswerBlindWithoutWeakEye(page, { setA: at(6, 40), setB: at(11, 150), label: 'lineup offset' });
});

test('line-up: press with the ring on the bubble → pop; press off it → miss, recharge, new offset', async () => {
  await events();
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'reticle', target: 0, live: true });
    window.__rg!.step(1 / 60, 2, false);
  });
  const before = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as { offset: { thetaDeg: number }; inside: number };
  expect(before.inside).toBe(0);
  expect(await pressUse()).toBe('glasses-lineup-pad');
  await page.evaluate(() => window.__rg!.step(1 / 60, 6));
  await save('lineup', 'pop');
  let dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as { pops: number; misses: number; presses: number; cooldown: number; offset: { thetaDeg: number } };
  expect(dbg.pops).toBe(1);
  expect(dbg.offset.thetaDeg).not.toBeCloseTo(before.offset.thetaDeg, 3);
  await expectDrawBudget(page, 'lineup', 5);
  let ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);

  // The next bubble, parked in the screen centre (never inside the ring): a press misses.
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'centre', live: true });
    window.__rg!.step(1 / 60, 2, false);
  });
  expect(await pressUse()).toBe('glasses-lineup-pad');
  dbg = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg;
  expect(dbg.misses).toBe(1);
  expect(dbg.cooldown).toBeGreaterThan(5);
  ev = await events();
  expect(ev.filter((e) => e.type === 'result')).toEqual([{ type: 'result', mechanic: 'lineup', kind: 'lineUp', tier: 1, hit: false }]);
  // Recharging: a press now does nothing.
  await page.evaluate(() => window.__rg!.step(1 / 60, 150, false));
  await pressUse();
  const after = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg;
  expect(after.presses).toBe(dbg.presses);
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { aim: 'reticle' });
    window.__rg!.step(1 / 60, 1);
  });
  await save('lineup', 'recharge');

  // Off the pad: nothing shows and no time-outs are counted.
  await page.evaluate(() => {
    window.__rgGlasses!.force('lineup', { onPad: false, aim: 'none', age: 14.9 });
    window.__rg!.step(1 / 60, 60, false);
  });
  const off = (await page.evaluate(() => window.__rgGlasses!.debug('lineup'))) as typeof dbg & { onPad: boolean };
  expect(off.misses).toBe(after.misses);
  expect(off.onPad).toBe(false);
  await page.evaluate(() => window.__rgGlasses!.force('lineup', { onPad: null }));
});

test('both mechanics stay within the draw budget and go idle when the player is far', async () => {
  await expectDrawBudget(page, 'oddone', 5);
  await expectDrawBudget(page, 'lineup', 5);
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
