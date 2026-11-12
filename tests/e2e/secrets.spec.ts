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

test('a miss past a rest stone puts the hero back on it with a boing; stones are bigger (QA r7 m10)', async () => {
  const s = await info();
  const tr = s.paths.find((p) => p.id === 'trampoline')!;
  expect(tr.checkpoints.length).toBeGreaterThanOrEqual(2);
  const cp = tr.checkpoints[0];
  // The rest stone is wider than the stones beside it.
  expect(tr.stones[cp][3]).toBeGreaterThan(tr.stones[cp + 1][3] + 0.2);
  const before = tr.returns;
  // Stand on the rest stone, then two stones on, then walk off the side and fall.
  for (const i of [cp, cp + 1, cp + 2]) {
    const [x, y, z] = tr.stones[i];
    await put([x, y + 0.05, z], 0, 20);
  }
  const r = await page.evaluate(
    ({ a, b }) => {
      const rg = window.__rg!;
      const pl = rg.ctx.player;
      // Walk off sideways (perpendicular to the path, camera-relative).
      const yaw = rg.ctx.cameraRig.yaw;
      const dx = -(b[2] - a[2]);
      const dz = b[0] - a[0];
      const l = Math.hypot(dx, dz);
      rg.inject({ moveY: (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / l, moveX: (-dx * Math.cos(yaw) + dz * Math.sin(yaw)) / l });
      let minY = pl.position.y;
      for (let i = 0; i < 240; i++) {
        rg.step(1 / 60, 1, false);
        minY = Math.min(minY, pl.position.y);
        if (i === 40) rg.inject(null);
      }
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      return { p: pl.position.toArray(), minY, grounded: pl.grounded };
    },
    { a: tr.stones[cp + 2], b: tr.stones[cp + 3] },
  );
  const after = (await info()).paths.find((p) => p.id === 'trampoline')!;
  const [cx, cy, cz] = tr.stones[cp];
  expect(after.returns, JSON.stringify(r)).toBe(before + 1);
  expect(r.minY).toBeLessThan(tr.stones[cp + 2][1] - 2);
  expect(Math.hypot(r.p[0] - cx, r.p[2] - cz), JSON.stringify(r)).toBeLessThan(1.3);
  expect(Math.abs(r.p[1] - cy)).toBeLessThan(0.15);
  expect(r.grounded).toBe(true);
  expect(after.checkpoint).toBe(cp);
});

test('a pedestal pays out once: confetti, stars and fanfare', async () => {
  const s = await info();
  await page.evaluate(() => {
    const log: string[] = [];
    window.__rg!.ctx.events.on('stunt', (e) => log.push(`${e.kind}:${e.stars}`));
    window.__rg!.ctx.events.on('glasses:result', (e) => {
      if (e.mechanic === 'secretPath') log.push(`glasses:${e.mechanic}:${e.tier}:${e.hit}`);
    });
    (window as unknown as { __stunts: string[] }).__stunts = log;
  });
  const stunts = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __stunts: string[] }).__stunts.slice());
  const lake = s.paths.find((p) => p.id === 'lake')!;
  const [x, y, z] = lake.pedestal;
  await put([x, y + 0.05, z], 0, 20);
  expect(await stunts()).toEqual(['bigAir:3', 'glasses:secretPath:2:true']);
  expect((await info()).paths.find((p) => p.id === 'lake')!.claimed).toBe(true);
  await put([x + 0.3, y + 0.05, z], 0, 20);
  expect(await stunts()).toHaveLength(2);
  // Screenshot while the confetti flies.
  await cam([x + 7, y + 3.5, z + 6], [x, y + 1.2, z], 55);
  await save('lake-pedestal');
});

test('vault: stepping on pads; wrong order wobbles and starts over, the weak eye order opens it, the prize flies out', async () => {
  await page.evaluate(() => {
    const log: string[] = [];
    const ev = window.__rg!.ctx.events;
    ev.on('stunt', (e) => log.push(`${e.kind}:${e.stars}`));
    ev.on('ui:toast', (e) => log.push(`toast:${e.icon}`));
    ev.on('glasses:result', (e) => log.push(`glasses:${e.mechanic}:${e.tier}:${e.hit}`));
    ev.on('stamp:earned', (e) => log.push(`stamp:${e.id}`));
    (window as unknown as { __vlog: string[] }).__vlog = log;
  });
  const vlog = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __vlog: string[] }).__vlog.slice());
  const door = (await info()).doors[0];
  const seq = door.sequence;
  expect(new Set(seq).size).toBe(3);
  // A step onto floor pad `button` (from off the pads) presses it; E on the same pad is a no-op.
  const press = async (button: number): Promise<void> => {
    const [x, z] = await page.evaluate(([b]) => window.__rgSecrets!.standPoint(0, b), [button]);
    const yaw = await page.evaluate(() => window.__rgSecrets!.info().doors[0].yaw + Math.PI);
    const [ox, oz] = await page.evaluate(() => window.__rgSecrets!.standPoint(0, 1, 6));
    await page.evaluate(({ x, z, ox, oz, yaw }) => {
      const rg = window.__rg!;
      rg.teleport(ox, rg.ctx.world.heightAt(ox, oz) + 0.1, oz, yaw);
      rg.step(1 / 60, 3, false);
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, yaw);
      rg.step(1 / 60, 12, false);
    }, { x, z, ox, oz, yaw });
    const before = (await info()).doors[0];
    // Standing on the pad selects it (once the door opens, no pad is selectable any more).
    expect(before.open ? -1 : button).toBe(before.selected);
    if (before.progress > 0 && !before.open) {
      // After a right step, an extra E on the same pad changes nothing.
      await use();
      const after = (await info()).doors[0];
      expect([after.progress, after.misses, after.open]).toEqual([before.progress, before.misses, before.open]);
    }
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
  // A wrong step darkens every pad for a moment, then they come back.
  expect(d.padLooks).toEqual(['dark', 'dark', 'dark', 'dark']);
  await page.evaluate(() => window.__rg!.step(1 / 60, 40, false));
  expect((await info()).doors[0].padLooks).toEqual(['idle', 'idle', 'idle', 'idle']);

  for (const [k, b] of seq.entries()) {
    await press(b);
    // Each right step lights its pad (and stays lit).
    const looks = (await info()).doors[0].padLooks;
    for (const lit of seq.slice(0, k + 1)) expect(looks[lit]).toBe('lit');
  }
  d = (await info()).doors[0];
  expect(d.open).toBe(true);
  expect(d.progress).toBe(3);
  // The door sinks and the treasure star flies out to the hero: the prize, without walking in.
  await page.evaluate(() => window.__rg!.step(1 / 60, 90, false));
  expect((await info()).doors[0].starFly).toBeGreaterThan(0);
  await page.evaluate(() => window.__rg!.step(1 / 60, 90, false));
  d = (await info()).doors[0];
  expect(d.starFly).toBe(1);
  expect(d.treasure).toBe(true);
  expect(await page.evaluate(() => window.__rgChests!.hud().picto)).toBe('gem>hat+balloon');
  // The open vault can still be walked into (the gems inside).
  await put([ix, d.y + 0.1, iz], 0, 20);
  const log = await vlog();
  expect(log).toContain('bullseye:3');
  expect(log).toContain('toast:chest');
  expect(log.filter((l) => l === 'stamp:secrets')).toHaveLength(1);
  expect(log.filter((l) => l.startsWith('glasses:vaultDoor'))).toEqual(['glasses:vaultDoor:1:true', 'glasses:vaultDoor:1:false', 'glasses:vaultDoor:1:true', 'glasses:vaultDoor:1:true', 'glasses:vaultDoor:3:true']);
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

test('vault: walking over a pad on the way does not count; stopping on a pad edge does (QA5 M5)', async () => {
  const door = 1;
  const seq = (await info()).doors[door].sequence;
  /** Door-local → world x,z. */
  const world = (lx: number, lz: number): Promise<[number, number]> =>
    page.evaluate(([d, x, z]) => {
      const dd = window.__rgSecrets!.info().doors[d];
      const c = Math.cos(dd.yaw);
      const s = Math.sin(dd.yaw);
      return [dd.x + c * x + s * z, dd.z - s * x + c * z] as [number, number];
    }, [door, lx, lz] as const);
  const local = (b: number): Promise<[number, number]> =>
    page.evaluate(([d, bb]) => {
      const dd = window.__rgSecrets!.info().doors[d];
      const [wx, wz] = window.__rgSecrets!.standPoint(d, bb);
      const c = Math.cos(dd.yaw);
      const s = Math.sin(dd.yaw);
      return [c * (wx - dd.x) - s * (wz - dd.z), s * (wx - dd.x) + c * (wz - dd.z)] as [number, number];
    }, [door, b] as const);
  /** Start at door-local `from`, walk forward toward `to` for `frames` frames, then stop. */
  const walk = async (from: [number, number], to: [number, number], frames: number): Promise<void> => {
    const [fx, fz] = await world(...from);
    const [tx, tz] = await world(...to);
    await page.evaluate(({ fx, fz, tx, tz, frames }) => {
      const rg = window.__rg!;
      rg.teleport(fx, rg.ctx.world.heightAt(fx, fz) + 0.1, fz, Math.atan2(tx - fx, tz - fz));
      rg.step(1 / 60, 4, false);
      rg.inject({ moveY: 1 });
      rg.step(1 / 60, frames, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
    }, { fx, fz, tx, tz, frames });
  };
  // First step: right onto the first pad's middle (counts at once).
  const [p0x, p0z] = await local(seq[0]);
  await walk([p0x, p0z + 3], [p0x, p0z], 1);
  const [wx, wz] = await world(p0x, p0z);
  await page.evaluate(({ wx, wz }) => {
    const rg = window.__rg!;
    rg.teleport(wx, rg.ctx.world.heightAt(wx, wz) + 0.1, wz, 0);
    rg.step(1 / 60, 30, false);
  }, { wx, wz });
  expect((await info()).doors[door].progress).toBe(1);
  // Walk briskly across a wrong pad toward the door, 0.45 m off its middle, and on past it: nothing happens.
  const wrong = [0, 1, 2, 3].find((b) => b !== seq[0] && b !== seq[1])!;
  const [qx, qz] = await local(wrong);
  await walk([qx + 0.45, qz + 2.2], [qx + 0.45, qz - 3], 40);
  let d = (await info()).doors[door];
  expect([d.progress, d.misses]).toEqual([1, 0]);
  // Stop on the right pad's edge (0.45 m off its middle): the dwell counts it.
  const [rx, rz] = await local(seq[1]);
  const [ex, ez] = await world(rx, rz + 0.45);
  await page.evaluate(({ ex, ez }) => {
    const rg = window.__rg!;
    rg.teleport(ex, rg.ctx.world.heightAt(ex, ez) + 0.1, ez, 0);
    rg.step(1 / 60, 10, false);
  }, { ex, ez });
  expect((await info()).doors[door].progress).toBe(1);
  await page.evaluate(() => window.__rg!.step(1 / 60, 30, false));
  d = (await info()).doors[door];
  expect([d.progress, d.misses]).toEqual([2, 0]);
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
    { name: 'sign', from: [dx, door.y + 3, dz], at: [door.x, door.y + 2.6, door.z], part: 'sign', layer: 'weak' },
    { name: 'buttons', from: [dx, door.y + 3, dz], at: [door.x, door.y + 1, door.z], part: 'buttons', layer: 'strong' },
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

test('clear without words: start rings and signs at every path, a rule board that plays', async () => {
  const s = await info();
  expect(s.starts).toHaveLength(4);
  for (const [i, p] of s.paths.entries()) {
    // The ring is where the path's arrow trail ends, on the ground (not on a stone).
    expect(Math.hypot(s.starts[i][0] - p.start[0], s.starts[i][2] - p.start[1])).toBeLessThan(0.01);
    const ground = await page.evaluate(([x, z]) => window.__rg!.ctx.world.heightAt(x, z), [p.start[0], p.start[1]]);
    expect(s.starts[i][1]).toBeGreaterThan(ground - 0.6);
    expect(Math.abs(s.starts[i][1] - p.stones[0][1])).toBeLessThan(3);
  }
  const names = await page.evaluate(() => window.__rg!.ctx.scene.children.map((o) => o.name));
  expect(names.filter((n) => n === 'secret-start')).toHaveLength(4);
  expect(names.filter((n) => n === 'vault-board')).toHaveLength(2);
  // The board is a both-eye object in the main scene, never on a vision layer.
  expect(await page.evaluate(() => window.__rg!.layerObjects().filter((o) => o.name.startsWith('vault-board') || o.name.startsWith('secret-start')).length)).toBe(0);
  const phases = new Set<string>();
  // Sample every 0.4 s (shorter than any step) for over a full loop, whatever the clock is now.
  for (let k = 0; k < 16; k++) {
    phases.add((await info()).doors[0].board);
    await page.evaluate(() => window.__rg!.step(1 / 60, 25, false));
  }
  for (const ph of ['show', 'step1', 'step2', 'step3', 'open']) expect([...phases], ph).toContain(ph);
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
  await cam([fx, d.y + 3, fz], [d.x, d.y + 2.4, d.z], 60);
  await save('vault-door');
  const st = s.paths[1];
  await cam([st.start[0] + 6, s.starts[1][1] + 3, st.start[1] + 6], [st.start[0], s.starts[1][1] + 1.5, st.start[1]], 60);
  await save('path-start');
  await page.evaluate(() => (window.__rg!.ctx.uiRoot.style.display = ''));
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
