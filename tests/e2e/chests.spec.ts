/**
 * Chests: the both-eye lock plays through the real game (key = weak eye, keyhole side = strong eye),
 * the layers stay in their channels, and the outfits show on the robot.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, canvasShot, channelDiff, shot } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';
import type { ChestInfo } from '../../src/activities/chests';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/chests';
let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

const info = (): Promise<ChestInfo[]> => page.evaluate(() => window.__rgChests!.info());

/** Put the player on the ground at x,z facing `yaw`, let the world settle, render. */
async function stand(x: number, z: number, yaw: number, render = true): Promise<void> {
  await page.evaluate(
    ({ x, z, yaw, render }) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, yaw);
      rg.step(1 / 60, 24, false);
      rg.step(1 / 60, 1, render);
    },
    { x, z, yaw, render },
  );
}

async function use(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 2, false);
  });
}

const yawToward = (fx: number, fz: number, tx: number, tz: number): number => Math.atan2(tx - fx, tz - fz);

function splitChannel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(name: string): Promise<void> {
  if (!SHOTS) return;
  const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const png = PNG.sync.read(buf);
  writeFileSync(`${OUT}/${name}-full.png`, buf);
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

async function frame(layers: { weak: boolean; strong: boolean }): Promise<PNG> {
  await page.evaluate(
    ({ weak, strong, W, S }) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, weak);
      rg.setLayerVisible(S, strong);
      rg.render();
    },
    { ...layers, W: VisionLayer.WeakOnly, S: VisionLayer.StrongOnly },
  );
  return canvasShot(page);
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  ({ consoleErrors } = await boot(page, '&quality=low'));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('six chests, keys on land 6.5-11.5 m away with a clear spot', async () => {
  const chests = await info();
  expect(chests).toHaveLength(6);
  expect(await page.evaluate(() => window.__rg!.state().chestsTotal)).toBe(6);
  const checks = await page.evaluate(() => {
    const w = window.__rg!.ctx.world;
    return window.__rgChests!.info().map((c) => ({
      dist: Math.hypot(c.key[0] - c.position[0], c.key[2] - c.position[2]),
      land: w.isLand(c.key[0], c.key[2]),
      above: c.key[1] - w.heightAt(c.key[0], c.key[2]),
    }));
  });
  for (const c of checks) {
    expect(c.land).toBe(true);
    expect(c.dist).toBeGreaterThan(6.3);
    expect(c.dist).toBeLessThan(11.7);
    expect(c.above).toBeGreaterThan(0.8);
  }
  expect(new Set(chests.map((c) => c.keyholeSide)).size).toBeGreaterThan(2);
});

test('key, wrong side stays closed, right side opens with the outfit; restart resets', async () => {
  const events = await page.evaluate(() => {
    const ctx = window.__rg!.ctx;
    const log: string[] = [];
    ctx.events.on('chest:key', (e) => log.push(`key:${e.chestId}`));
    ctx.events.on('chest:opened', (e) => log.push(`opened:${e.chestId}:${e.outfitId}`));
    ctx.events.on('outfit:unlocked', (e) => log.push(`unlocked:${e.outfitId}`));
    ctx.events.on('outfit:equipped', (e) => log.push(`equipped:${e.outfitId}:${e.slot}`));
    (window as unknown as { __log: string[] }).__log = log;
    return log;
  });
  expect(events).toEqual([]);
  const log = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __log: string[] }).__log.slice());

  const c = (await info())[0];
  // Using the chest without the key does nothing.
  const side = c.keyholeSide;
  const [rx, rz] = await page.evaluate(([i, s]) => window.__rgChests!.sidePoint(i, s), [0, side]);
  await stand(rx, rz, 0, false);
  await use();
  expect(await page.evaluate(() => window.__rg!.state().chests)).toBe(0);

  // Walk into the key.
  await stand(c.key[0], c.key[2], 0, false);
  expect((await info())[0].keyState).toBe('carried');
  expect(await log()).toContain('key:chest0');

  // Wrong side (the opposite one): friendly no.
  const [wx, wz] = await page.evaluate(([i, s]) => window.__rgChests!.sidePoint(i, s), [0, (side + 2) % 4]);
  await stand(wx, wz, 0, false);
  await use();
  await use();
  expect(await page.evaluate(() => window.__rg!.state().chests)).toBe(0);
  expect((await info())[0].open).toBe(false);
  expect((await info())[0].keyState).toBe('carried');

  // Right side: opens, the outfit is unlocked and equipped.
  await stand(rx, rz, 0, false);
  await use();
  const st = await page.evaluate(() => window.__rg!.state());
  expect(st.chests).toBe(1);
  expect(st.outfits).toEqual(['hat-explorer']);
  expect((await info())[0].open).toBe(true);
  expect(await log()).toEqual(['key:chest0', 'opened:chest0:hat-explorer', 'unlocked:hat-explorer', 'equipped:hat-explorer:head']);

  // Restart: closed again, key back, nothing worn.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 3, false);
  });
  const again = await page.evaluate(() => ({ s: window.__rg!.state(), c: window.__rgChests!.info()[0] }));
  expect(again.s.chests).toBe(0);
  expect(again.s.outfits).toEqual([]);
  expect(again.c.open).toBe(false);
  expect(again.c.keyState).toBe('ground');
  expect(await page.evaluate(() => window.__rg!.state().chestsTotal)).toBe(6);
});

test('the key lives only in the weak channel and the lock only in the strong channel', async () => {
  const chests = await info();
  // A view with the key in front of us, and one at the keyhole side of the chest.
  const c = chests[0];
  for (const combo of COMBOS) {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);

    // Key view: stand 3.5 m short of the key, looking at it.
    const dx = c.key[0] - c.position[0];
    const dz = c.key[2] - c.position[2];
    const len = Math.hypot(dx, dz);
    const px = c.key[0] + (dx / len) * 3.5;
    const pz = c.key[2] + (dz / len) * 3.5;
    await stand(px, pz, yawToward(px, pz, c.key[0], c.key[2]), false); // frame() renders
    const all = await frame({ weak: true, strong: true });
    const noWeak = await frame({ weak: false, strong: true });
    const dw = channelDiff(all, noWeak);
    expect(dw[combo.weak], `key ${combo.eye.weakEye}`).toBeGreaterThan(150);
    expect(maxOf(dw, combo.strong)).toBe(0);
    expect(dw.maxB).toBe(0);

    // Lock view: at the keyhole side, 3 m out, looking at the chest.
    const [lx, lz] = await page.evaluate(([i, s]) => window.__rgChests!.sidePoint(i, s, 3.2), [0, c.keyholeSide]);
    await stand(lx, lz, yawToward(lx, lz, c.position[0], c.position[2]), false);
    const withLock = await frame({ weak: true, strong: true });
    const noStrong = await frame({ weak: true, strong: false });
    const ds = channelDiff(withLock, noStrong);
    expect(ds[combo.strong], `lock ${combo.eye.weakEye}`).toBeGreaterThan(150);
    expect(maxOf(ds, combo.weak)).toBe(0);
    expect(ds.maxB).toBe(0);
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.setLayerVisible(1, true);
    rg.setLayerVisible(2, true);
  });
});

/** Free camera for screenshots: placed after the last step, then the same state is re-rendered. */
async function cam(from: [number, number, number], at: [number, number, number], fov = 60): Promise<void> {
  if (!SHOTS) return; // only frames screenshots (and a render costs seconds on SwiftShader)
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

test('every chest opens and its wearable goes on (screenshots with RG_SHOTS=1)', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 3, false);
  });
  const chests = await info();
  // Chest whose keyhole faces the key best, so one view shows both.
  let best = 0;
  let bestDot = -2;
  chests.forEach((c, i) => {
    const kx = c.key[0] - c.position[0];
    const kz = c.key[2] - c.position[2];
    const l = Math.hypot(kx, kz);
    const sx = Math.sin(c.yaw + (c.keyholeSide * Math.PI) / 2);
    const sz = Math.cos(c.yaw + (c.keyholeSide * Math.PI) / 2);
    const dot = (kx * sx + kz * sz) / l;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  });
  const c = chests[best];
  const gy = (x: number, z: number): Promise<number> => page.evaluate(([x, z]) => window.__rg!.ctx.world.heightAt(x, z), [x, z]);
  const sx = Math.sin(c.yaw + (c.keyholeSide * Math.PI) / 2);
  const sz = Math.cos(c.yaw + (c.keyholeSide * Math.PI) / 2);
  // Park the player out of the picture, then hero shot from above the keyhole side.
  await stand(c.position[0] - sx * 30, c.position[2] - sz * 30, 0, false);
  const mid: [number, number, number] = [(c.position[0] * 2 + c.key[0]) / 3, c.position[1] + 0.9, (c.position[2] * 2 + c.key[2]) / 3];
  await cam([c.position[0] + sx * 4.8, c.position[1] + 2.4, c.position[2] + sz * 4.8], mid, 66);
  await save('key-and-lock');
  // Closer on the lock (ring, plate, arrow).
  await cam([c.position[0] + sx * 2.5, c.position[1] + 1.15, c.position[2] + sz * 2.5], [c.position[0], c.position[1] + 0.45, c.position[2]], 55);
  await save('lock-close');
  // The key alone, close.
  const kg = await gy(c.key[0], c.key[2]);
  void kg;
  await cam([c.key[0] + 2.2, c.key[1] + 0.3, c.key[2] + 0.4], c.key, 50);
  await save('key-close');

  // Open every chest in turn; after each, look at the robot from the front and the back.
  const ids = ['hat-explorer', 'cape-hero', 'paint-flame', 'glasses-star', 'hat-party', 'paint-sky'];
  for (let i = 0; i < 6; i++) {
    const ci = (await info())[i];
    await page.evaluate((k) => {
      const rg = window.__rg!;
      rg.teleport(k[0], rg.ctx.world.heightAt(k[0], k[2]) + 0.1, k[2]);
      rg.step(1 / 60, 3, false);
    }, ci.key);
    const [ox, oz] = await page.evaluate(([n, s]) => window.__rgChests!.sidePoint(n, s), [i, ci.keyholeSide]);
    await stand(ox, oz, 0, false);
    await use();
    // Settle the pop-in, then a cloth-friendly standing pose.
    await page.evaluate(() => window.__rg!.step(1 / 60, 50, false));
    const pw = await page.evaluate(() => {
      const pl = window.__rg!.ctx.player;
      return { p: pl.position.toArray() as [number, number, number], yaw: pl.yaw };
    });
    const [p0, p1, p2] = pw.p;
    const fx = Math.sin(pw.yaw);
    const fz = Math.cos(pw.yaw);
    if (!ids[i].startsWith('paint')) {
      await cam([p0 + fx * 2.3, p1 + 1.45, p2 + fz * 2.3], [p0, p1 + 1.2, p2], 45);
      await save(`wear-${ids[i]}-front`);
      await cam([p0 - fx * 2.6 + fz * 0.6, p1 + 1.4, p2 - fz * 2.6 - fx * 0.6], [p0, p1 + 1.0, p2], 45);
      await save(`wear-${ids[i]}-back`);
    }
  }
  const state = await page.evaluate(() => window.__rg!.state());
  expect(state.chests).toBe(6);
  expect([...state.outfits].sort()).toEqual([...ids].sort());
  const p = await page.evaluate(() => window.__rg!.ctx.player.position.toArray() as [number, number, number]);
  await cam([p[0] + 1.1, p[1] + 1.5, p[2] + 3.2], [p[0], p[1] + 1.15, p[2]], 45);
  await save('robot-all');
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.uiRoot.style.display = '';
  });
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
  void shot;
});
