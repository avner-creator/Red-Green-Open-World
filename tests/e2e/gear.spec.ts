/**
 * Gear: buy a hat, a paint and a trail with gems -> they show on the robot, the buggy and behind
 * the player; they stay on across a new session and come off when the profile is reset. Also
 * saves screenshots (full / R-only / G-only) of the robot wearing gear and of each trail.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/gear';
let page: Page;
let consoleErrors: string[] = [];

function splitChannel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(name: string): Promise<void> {
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-full.png`, buf);
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

async function cam(from: [number, number, number], at: [number, number, number], fov = 45): Promise<void> {
  await page.evaluate(
    ({ from, at, fov }) => {
      const rg = window.__rg!;
      const c = rg.ctx.camera;
      rg.ctx.uiRoot.style.display = 'none';
      c.position.set(...from);
      c.fov = fov;
      c.updateProjectionMatrix();
      c.lookAt(...at);
      rg.render();
    },
    { from, at, fov },
  );
}

async function attached(): Promise<Record<'head' | 'back' | 'face', string | null>> {
  return page.evaluate(() => window.__rgGear!.attached());
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  ({ consoleErrors } = await boot(page, '&quality=low'));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('buy a hat, a paint and a trail: worn, painted, particles; persists; reset takes it all off', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    ctx.profile.reset();
    ctx.profile.earn(200, 'test');
    const defaultColor = window.__rgGear!.carColor();
    const res = [ctx.economy.buy('hat-propeller'), ctx.economy.buy('paint-ruby'), ctx.economy.buy('trail-sparkle')];
    rg.step(1 / 60, 40, false);
    return { res, defaultColor, wallet: ctx.profile.wallet };
  });
  expect(r.res).toEqual(['ok', 'ok', 'ok']);
  expect(r.wallet).toBe(200 - 12 - 55 - 20);
  expect((await attached()).head).toBe('hat-propeller');
  expect(await page.evaluate(() => window.__rgGear!.carColor())).toBe(0xbf4d52);
  expect(await page.evaluate(() => window.__rgGear!.trail())).toBe('sparkle');

  // Walk: the trail leaves particles (never more than 60).
  const counts = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ moveY: 1 });
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      rg.step(1 / 60, 20, false);
      peak = Math.max(peak, window.__rgGear!.particles());
    }
    rg.inject(null);
    return peak;
  });
  expect(counts).toBeGreaterThan(2);
  expect(counts).toBeLessThanOrEqual(60);

  // A new session keeps everything on.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 10, false);
  });
  expect((await attached()).head).toBe('hat-propeller');
  expect(await page.evaluate(() => window.__rgGear!.carColor())).toBe(0xbf4d52);
  expect(await page.evaluate(() => window.__rgGear!.trail())).toBe('sparkle');

  // Reset: everything off, buggy back to its own colour.
  const after = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.profile.reset();
    rg.step(1 / 60, 10, false);
    return { att: window.__rgGear!.attached(), car: window.__rgGear!.carColor(), trail: window.__rgGear!.trail() };
  });
  expect(after.att).toEqual({ head: null, back: null, face: null });
  expect(after.trail).toBeNull();
  expect(after.car).not.toBe(0xbf4d52);
  expect(after.car).toBe(r.defaultColor);
});

test('emotes: G plays the equipped emote, moving cancels it, it ends by itself', async () => {
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    ctx.profile.earn(50, 'test');
    ctx.economy.buy('emote-dance');
    rg.step(1 / 60, 30, false);
    const g = window.__rgGear!;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' }));
    const started = g.emote();
    rg.step(1 / 60, 30, false);
    const mid = g.emote();
    rg.step(1 / 60, 120, false);
    const ended = g.emote();
    // Cancel by moving.
    g.playEmote();
    rg.step(1 / 60, 10, false);
    const again = g.emote();
    rg.inject({ moveY: 1 });
    rg.step(1 / 60, 4, false);
    rg.inject(null);
    return { started, mid, ended, again, cancelled: g.emote(), mode: ctx.player.mode };
  });
  expect(r.started).toBe('dance');
  expect(r.mid).toBe('dance');
  expect(r.ended).toBeNull();
  expect(r.again).toBe('dance');
  expect(r.cancelled).toBeNull();
  expect(r.mode).toBe('walk');
});

test('screenshots: gear on the robot and every trail (full / R / G)', async () => {
  const looks: Array<[string, 'front' | 'back']> = [
    ['hat-propeller', 'front'],
    ['hat-crown', 'front'],
    ['hat-wizard', 'front'],
    ['glasses-shades', 'front'],
    ['glasses-goggles', 'front'],
    ['cape-star', 'back'],
    ['cape-flame', 'back'],
    ['pack-explorer', 'back'],
    ['pack-rocket', 'back'],
  ];
  const pose = async (): Promise<{ p: [number, number, number]; fx: number; fz: number }> =>
    page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.profile.reset();
      const sp = rg.ctx.world.anchors.spawn;
      rg.teleport(sp.position.x, sp.position.y, sp.position.z, sp.yaw);
      rg.step(1 / 60, 5, false);
      const pl = rg.ctx.player;
      return { p: pl.position.toArray() as [number, number, number], fx: Math.sin(pl.yaw), fz: Math.cos(pl.yaw) };
    });
  for (const [id, side] of looks) {
    const { p, fx, fz } = await pose();
    await page.evaluate((id) => {
      const rg = window.__rg!;
      const ctx = rg.ctx;
      ctx.profile.unlock(id, 'shop');
      const item = ctx.economy.item(id)!;
      ctx.economy.equip(item.slot, id);
      rg.step(1 / 60, 40, false);
    }, id);
    if (side === 'front') await cam([p[0] + fx * 2.1, p[1] + 1.6, p[2] + fz * 2.1], [p[0], p[1] + 1.4, p[2]], 40);
    else await cam([p[0] - fx * 2.8 + fz * 0.7, p[1] + 1.5, p[2] - fz * 2.8 - fx * 0.7], [p[0], p[1] + 1.0, p[2]], 45);
    await save(`wear-${id}`);
  }
  // Trails: run forward, then look back at the ribbon.
  for (const id of ['trail-sparkle', 'trail-bubbles', 'trail-rainbow']) {
    await pose();
    const info = await page.evaluate((id) => {
      const rg = window.__rg!;
      const ctx = rg.ctx;
      ctx.profile.unlock(id, 'shop');
      ctx.economy.equip('trail', id);
      rg.step(1 / 60, 5, false);
      rg.inject({ moveY: 1 });
      rg.step(1 / 60, 70, false);
      const pl = ctx.player;
      const out = { p: pl.position.toArray() as [number, number, number], fx: Math.sin(pl.yaw), fz: Math.cos(pl.yaw), n: window.__rgGear!.particles(), ribbon: window.__rgGear!.ribbonSamples() };
      return out;
    }, id);
    if (id === 'trail-rainbow') expect(info.ribbon).toBeGreaterThan(5);
    else expect(info.n).toBeGreaterThan(3);
    const { p, fx, fz } = info;
    await cam([p[0] - fx * 3.2 + fz * 1.6, p[1] + 1.6, p[2] - fz * 3.2 - fx * 1.6], [p[0] - fx * 1.2, p[1] + 0.3, p[2] - fz * 1.2], 55);
    await save(id);
    await page.evaluate(() => window.__rg!.inject(null));
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.profile.reset();
    rg.ctx.uiRoot.style.display = '';
  });
});

test('shop previews: hats give distinct PNG pictures; contact sheet of all of them (full / R / G)', async () => {
  const r = await page.evaluate(async () => {
    window.__rgGear!.enablePreviews(true);
    const eco = window.__rg!.ctx.economy;
    const t0 = performance.now();
    const a = eco.item('hat-propeller')!.preview!();
    const first = performance.now() - t0;
    const b = eco.item('hat-crown')!.preview!();
    const again = eco.item('hat-propeller')!.preview!();
    const items = eco.catalog.filter((i) => i.preview);
    const t1 = performance.now();
    const urls: Array<string | null> = items.map((i) => i.preview!());
    const rest = (performance.now() - t1) / items.length;
    const cols = 7;
    const cell = 200;
    const rows = Math.ceil(items.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * cell;
    c.height = rows * cell;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b2030';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      if (!u) continue;
      const img = new Image();
      img.src = u;
      await img.decode();
      g.drawImage(img, (i % cols) * cell + 4, Math.floor(i / cols) * cell + 4);
    }
    return { a, b, same: a === again, first, rest, n: items.length, nulls: urls.filter((u) => !u).length, sheet: c.toDataURL('image/png') };
  });
  expect(r.a).toMatch(/^data:image\/png/);
  expect(r.b).toMatch(/^data:image\/png/);
  expect(r.a).not.toBe(r.b);
  expect(r.same).toBe(true);
  expect(r.nulls).toBe(0);
  expect(r.n).toBeGreaterThanOrEqual(22);
  await page.evaluate(() => window.__rgGear!.enablePreviews(false));
  console.log(`preview: first ${r.first.toFixed(0)} ms, then ${r.rest.toFixed(0)} ms each (${r.n} items)`);
  const buf = Buffer.from(r.sheet.slice(r.sheet.indexOf(',') + 1), 'base64');
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/previews.png`, buf);
  writeFileSync(`${OUT}/previews-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/previews-G.png`, splitChannel(png, 1));
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
