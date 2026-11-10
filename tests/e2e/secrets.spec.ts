/**
 * Secret paths, weak-eye arrows and two-eye vault doors in the real game: the stones are solid and
 * chime/light when stood on, pedestals pay out once, the vault opens only in the weak eye's order,
 * and every layer part stays in its own channel for all 4 lens/eye combinations (canvas readback).
 * Screenshots (full, R-only, G-only) go to test-results/secrets/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, canvasShot, channelDiff } from './helpers';
import type { EyeSettings } from '../../src/types';
import type { SecretsInfo } from '../../src/activities/secrets';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/secrets';
let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

const info = (): Promise<SecretsInfo> => page.evaluate(() => window.__rgSecrets!.info());

type V3 = [number, number, number];

/** Teleport the player (feet) and simulate `n` frames without rendering. */
async function put(p: V3, yaw = 0, n = 20): Promise<void> {
  await page.evaluate(
    ({ p, yaw, n }) => {
      const rg = window.__rg!;
      rg.teleport(p[0], p[1], p[2], yaw);
      rg.step(1 / 60, n, false);
    },
    { p, yaw, n },
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

const player = (): Promise<{ p: V3; grounded: boolean; mode: string }> =>
  page.evaluate(() => {
    const pl = window.__rg!.ctx.player;
    return { p: pl.position.toArray() as V3, grounded: pl.grounded, mode: pl.mode };
  });

/** Free camera for a frame: placed after the last step, the frozen state is rendered again. */
async function cam(from: V3, at: V3, fov = 60): Promise<void> {
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

async function render(): Promise<PNG> {
  await page.evaluate(() => window.__rg!.render());
  return canvasShot(page);
}

type Part = 'stones' | 'arrows' | 'sign' | 'buttons';
async function show(parts: Partial<Record<Part, boolean>>): Promise<void> {
  await page.evaluate((parts) => {
    for (const [k, v] of Object.entries(parts)) window.__rgSecrets!.setVisible(k as Part, v as boolean);
  }, parts);
}

function splitChannel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(name: string): Promise<void> {
  if (!SHOTS) return; // human-only screenshots are opt-in (RG_SHOTS=1)
  const png = await render();
  writeFileSync(`${OUT}/${name}-full.png`, PNG.sync.write(png));
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  ({ consoleErrors } = await boot(page, '&quality=low'));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

test('four paths, arrow trails and two vaults, clear of the world', async () => {
  const s = await info();
  expect(s.paths.map((p) => p.id)).toEqual(['rooftops', 'trampoline', 'lake', 'lighthouse']);
  for (const p of s.paths) expect(p.stones.length).toBeGreaterThan(8);
  expect(s.doors).toHaveLength(2);
  // A trail to every path start and every chest key.
  expect(s.trails.filter((t) => t.target.startsWith('path-'))).toHaveLength(4);
  expect(s.trails.filter((t) => t.target.startsWith('key-'))).toHaveLength(6);
  for (const t of s.trails) expect(t.count, t.target).toBeGreaterThanOrEqual(2);
  expect(s.arrows).toBeGreaterThan(30);
  // No stone, pedestal or vault wall inside any other collider (houses, props, trees, the lighthouse).
  expect(await page.evaluate(() => window.__rgSecrets!.overlaps())).toEqual([]);
  // Stones sit above the ground and the water.
  const low = await page.evaluate(() => {
    const w = window.__rg!.ctx.world;
    return window.__rgSecrets!
      .info()
      .paths.flatMap((p) => p.stones.map((st) => st[1] - 0.42 - Math.max(w.waterLevel, w.heightAt(st[0], st[2]))))
      .filter((c) => c < 0.05);
  });
  expect(low).toEqual([]);
});

test('stones are solid, chime and light up; a real jump reaches the next stone', async () => {
  const s = await info();
  const chimes = await page.evaluate(() => {
    const a = window.__rg!.ctx.audio;
    const log: string[] = [];
    const orig = a.play.bind(a);
    a.play = (name, opts) => {
      log.push(name);
      orig(name, opts);
    };
    (window as unknown as { __snd: string[] }).__snd = log;
    return log.length;
  });
  expect(chimes).toBe(0);
  for (const p of s.paths) {
    for (const i of [0, Math.floor(p.stones.length / 2), p.stones.length - 1]) {
      const [x, y, z] = p.stones[i];
      await put([x, y + 0.05, z], 0, 30);
      const pl = await player();
      expect(pl.p[1], `${p.id}#${i}`).toBeGreaterThan(y - 0.12);
      expect(pl.p[1], `${p.id}#${i}`).toBeLessThan(y + 0.12);
      expect(pl.grounded, `${p.id}#${i}`).toBe(true);
      expect((await info()).paths.find((q) => q.id === p.id)!.lit, `${p.id}#${i}`).toBe(i);
    }
  }
  expect(await page.evaluate(() => (window as unknown as { __snd: string[] }).__snd.filter((n) => n === 'gemNear').length)).toBeGreaterThanOrEqual(12);

  // Walk + jump from a stone to the next one on the trampoline spiral.
  const tr = s.paths.find((p) => p.id === 'trampoline')!;
  const [ax, ay, az] = tr.stones[4];
  const [bx, , bz] = tr.stones[5];
  await put([ax, ay + 0.05, az], Math.atan2(bx - ax, bz - az), 20);
  const hop = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ moveY: 1, jump: true, jumpPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject({ moveY: 1, jump: true });
    rg.step(1 / 60, 16, false);
    rg.inject({ moveY: 0, jump: false });
    rg.step(1 / 60, 40, false);
    rg.inject(null);
    return { lit: window.__rgSecrets!.info().paths[1].lit, y: rg.ctx.player.position.y };
  });
  expect(hop.lit).toBeGreaterThanOrEqual(5);
  expect(hop.y).toBeGreaterThan(ay + 0.3);
});

test('a pedestal pays out once: confetti, stars and fanfare', async () => {
  const s = await info();
  await page.evaluate(() => {
    const log: string[] = [];
    window.__rg!.ctx.events.on('stunt', (e) => log.push(`${e.kind}:${e.stars}`));
    (window as unknown as { __stunts: string[] }).__stunts = log;
  });
  const stunts = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __stunts: string[] }).__stunts.slice());
  const lake = s.paths.find((p) => p.id === 'lake')!;
  const [x, y, z] = lake.pedestal;
  await put([x, y + 0.05, z], 0, 20);
  expect(await stunts()).toEqual(['bigAir:3']);
  expect((await info()).paths.find((p) => p.id === 'lake')!.claimed).toBe(true);
  await put([x + 0.3, y + 0.05, z], 0, 20);
  expect(await stunts()).toHaveLength(1);
  // Screenshot while the confetti flies.
  await cam([x + 7, y + 3.5, z + 6], [x, y + 1.2, z], 55);
  await save('lake-pedestal');
});

test('vault: wrong order wobbles and starts over, the weak eye order opens it, treasure inside', async () => {
  await page.evaluate(() => {
    const log: string[] = [];
    const ev = window.__rg!.ctx.events;
    ev.on('stunt', (e) => log.push(`${e.kind}:${e.stars}`));
    ev.on('ui:toast', (e) => log.push(`toast:${e.icon}`));
    (window as unknown as { __vlog: string[] }).__vlog = log;
  });
  const vlog = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __vlog: string[] }).__vlog.slice());
  const door = (await info()).doors[0];
  const seq = door.sequence;
  expect(new Set(seq).size).toBe(3);
  const press = async (button: number): Promise<void> => {
    const [x, z] = await page.evaluate(([b]) => window.__rgSecrets!.standPoint(0, b), [button]);
    const yaw = await page.evaluate(() => window.__rgSecrets!.info().doors[0].yaw + Math.PI);
    await page.evaluate(({ x, z, yaw }) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, yaw);
      rg.step(1 / 60, 12, false);
    }, { x, z, yaw });
    expect((await info()).doors[0].selected).toBe(button);
    await use();
  };

  // The closed door blocks the way in.
  const [ix, iz] = await page.evaluate(() => window.__rgSecrets!.insidePoint(0));
  const [sx, sz] = await page.evaluate(() => window.__rgSecrets!.standPoint(0, 1, 2.5));
  await page.evaluate(({ sx, sz, ix, iz }) => {
    const rg = window.__rg!;
    rg.teleport(sx, rg.ctx.world.heightAt(sx, sz) + 0.1, sz, Math.atan2(ix - sx, iz - sz));
    rg.step(1 / 60, 5, false);
    rg.inject({ moveY: 1 });
    rg.step(1 / 60, 90, false);
    rg.inject(null);
    rg.step(1 / 60, 5, false);
  }, { sx, sz, ix, iz });
  const blocked = await page.evaluate(() => {
    const d = window.__rgSecrets!.info().doors[0];
    const p = window.__rg!.ctx.player.position;
    // Door-local z of the player (out of the door is +).
    return Math.sin(d.yaw) * (p.x - d.x) + Math.cos(d.yaw) * (p.z - d.z);
  });
  expect(blocked).toBeGreaterThan(0.2);

  // A wrong button first (any that is not the first of the sequence).
  const wrong = [0, 1, 2, 3].find((b) => b !== seq[0])!;
  await press(seq[0]);
  expect((await info()).doors[0].progress).toBe(1);
  await press(wrong === seq[1] ? [0, 1, 2, 3].find((b) => b !== seq[1] && b !== seq[0])! : wrong);
  let d = (await info()).doors[0];
  expect(d.progress).toBe(0);
  expect(d.misses).toBe(1);
  expect(d.open).toBe(false);

  for (const b of seq) await press(b);
  d = (await info()).doors[0];
  expect(d.open).toBe(true);
  expect(d.progress).toBe(3);
  // Let the door slide, then walk in: treasure.
  await page.evaluate(() => window.__rg!.step(1 / 60, 100, false));
  await put([ix, d.y + 0.1, iz], 0, 20);
  d = (await info()).doors[0];
  expect(d.treasure).toBe(true);
  const log = await vlog();
  expect(log).toContain('bullseye:3');
  expect(log).toContain('toast:chest');
  // Treasure screenshot from the doorway.
  const [fx, fz] = await page.evaluate(() => window.__rgSecrets!.standPoint(0, 1, 6));
  await put([fx, d.y + 0.1, fz], 0, 3);
  await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
  const at: V3 = [ix, d.y + 1.2, iz];
  await cam([(fx + ix) / 2 + (fx - ix) * 0.6, d.y + 2.2, (fz + iz) / 2 + (fz - iz) * 0.6], at, 60);
  await save('vault-open');

  // Restart: closed again with a fresh sequence.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.uiRoot.style.display = '';
    rg.start();
    rg.step(1 / 60, 3, false);
  });
  const again = (await info()).doors[0];
  expect(again.open).toBe(false);
  expect(again.treasure).toBe(false);
  expect(again.progress).toBe(0);
  expect((await info()).paths.every((p) => !p.claimed)).toBe(true);
});

test('stones and arrows touch only the weak channel, vault buttons only the strong one (4 combos)', async () => {
  const s = await info();
  // Park the player out of every view.
  await put([0, 30, 9], 0, 2);
  const lake = s.paths.find((p) => p.id === 'lake')!;
  const first = lake.stones[2];
  const last = lake.stones[lake.stones.length - 4];
  const keyTrail = s.trails.find((t) => t.target.startsWith('key-') && t.count >= 6)!;
  const door = s.doors[1];
  const out = (yawOff: number, d: number): [number, number] => [door.x + Math.sin(door.yaw) * d + Math.cos(door.yaw) * yawOff, door.z + Math.cos(door.yaw) * d - Math.sin(door.yaw) * yawOff];
  const [dx, dz] = out(0.6, 9);

  const views: { name: string; from: V3; at: V3; part: Part; layer: 'weak' | 'strong' }[] = [
    { name: 'stones', from: [first[0] + (first[0] - last[0]) * 0.25, first[1] + 3, first[2] + (first[2] - last[2]) * 0.25], at: [last[0], last[1], last[2]], part: 'stones', layer: 'weak' },
    {
      name: 'arrows',
      from: [keyTrail.first![0] + (keyTrail.first![0] - keyTrail.last![0]) * 0.3, keyTrail.first![1] + 4, keyTrail.first![2] + (keyTrail.first![2] - keyTrail.last![2]) * 0.3],
      at: keyTrail.last!,
      part: 'arrows',
      layer: 'weak',
    },
    { name: 'sign', from: [dx, door.y + 3, dz], at: [door.x, door.y + 3.4, door.z], part: 'sign', layer: 'weak' },
    { name: 'buttons', from: [dx, door.y + 3, dz], at: [door.x, door.y + 2.2, door.z], part: 'buttons', layer: 'strong' },
  ];
  for (const v of views) {
    await cam(v.from, v.at, 60);
    for (const combo of COMBOS) {
      await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
      await show({ [v.part]: true });
      const on = await render();
      await show({ [v.part]: false });
      const off = await render();
      await show({ [v.part]: true });
      const d = channelDiff(on, off);
      const own = v.layer === 'weak' ? combo.weak : combo.strong;
      const other = v.layer === 'weak' ? combo.strong : combo.weak;
      const tag = `${v.name} ${combo.eye.leftLens}/${combo.eye.weakEye}`;
      expect(d[own], tag).toBeGreaterThan(150);
      expect(maxOf(d, other), tag).toBe(0);
      expect(d.maxB, tag).toBe(0);
    }
  }
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' }));
});

test('screenshots of every path and the vault (full, R-only, G-only)', async () => {
  const s = await info();
  await put([0, 30, 9], 0, 2);
  const by = (id: string): SecretsInfo['paths'][number] => s.paths.find((p) => p.id === id)!;
  const lh = by('lighthouse');
  await cam([lh.pedestal[0] + 26, lh.pedestal[1] - 8, lh.pedestal[2] + 14], [lh.pedestal[0], lh.pedestal[1] - 9, lh.pedestal[2]], 60);
  await save('lighthouse');
  const tr = by('trampoline');
  await cam([tr.pedestal[0] + 4, tr.pedestal[1] - 4, tr.pedestal[2] + 16], [tr.pedestal[0], tr.pedestal[1] - 6, tr.pedestal[2]], 60);
  await save('trampoline');
  const rt = by('rooftops');
  await cam([rt.pedestal[0] + 8, rt.pedestal[1] + 6, rt.pedestal[2] + 16], [rt.stones[12][0], rt.stones[12][1] - 2, rt.stones[12][2]], 60);
  await save('rooftops');
  const lk = by('lake');
  const a = lk.stones[0];
  const b = lk.stones[lk.stones.length - 1];
  await cam([a[0] + (a[0] - b[0]) * 0.15, a[1] + 4, a[2] + (a[2] - b[2]) * 0.15], [b[0], b[1], b[2]], 55);
  await save('lake');
  const d = s.doors[1];
  const fx = d.x + Math.sin(d.yaw) * 10;
  const fz = d.z + Math.cos(d.yaw) * 10;
  await cam([fx, d.y + 3, fz], [d.x, d.y + 3.2, d.z], 60);
  await save('vault-door');
  await page.evaluate(() => (window.__rg!.ctx.uiRoot.style.display = ''));
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
