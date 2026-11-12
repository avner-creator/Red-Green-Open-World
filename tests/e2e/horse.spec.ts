/**
 * The rideable horse on the real island: two horses idle in the ranch paddock; E mounts (riding
 * mode, the rider follows the saddle so gem pickup works), the horse gallops at ~13 m/s with
 * Shift, jumps ~1.6 m on Space, R puts the horse on a safe spot and lets the rider go, E
 * dismounts to the side. Screenshots (full / R-only / G-only) in test-results/horse/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, canvasShot } from './helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/horse';
let page: Page;
let consoleErrors: string[] = [];

function splitChannel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

async function save(name: string): Promise<void> {
  if (!SHOTS) return; // human-only screenshots are opt-in (RG_SHOTS=1)
  await page.evaluate(() => window.__rg!.render());
  const png = await canvasShot(page);
  writeFileSync(`${OUT}/${name}-full.png`, PNG.sync.write(png));
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

interface HorseState {
  mode: string;
  riding: boolean;
  x: number;
  y: number;
  z: number;
  speed: number;
  gait: string;
  grounded: boolean;
  playerDist: number;
  playerAbove: number;
  onLand: boolean;
}

async function horseState(): Promise<HorseState> {
  return page.evaluate(() => {
    const rg = window.__rg!;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse') as unknown as {
      position: { x: number; y: number; z: number };
      speed: number;
      gait: string;
      grounded: boolean;
    };
    const pl = rg.ctx.player;
    return {
      mode: rg.state().playerMode,
      riding: pl.vehicle === (h as unknown),
      x: h.position.x,
      y: h.position.y,
      z: h.position.z,
      speed: h.speed,
      gait: h.gait,
      grounded: h.grounded,
      playerDist: Math.hypot(pl.position.x - h.position.x, pl.position.z - h.position.z),
      playerAbove: pl.position.y - h.position.y,
      onLand: rg.ctx.world.isLand(h.position.x, h.position.z),
    };
  });
}

async function steps(n: number, inject: Record<string, number | boolean> | null = null): Promise<void> {
  await page.evaluate(
    ([n, inject]) => {
      const rg = window.__rg!;
      rg.inject(inject);
      rg.step(1 / 60, n, false);
      rg.inject(null);
    },
    [n, inject] as const,
  );
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
  // The horse model streams in after boot.
  await page.waitForFunction(() => window.__rg!.ctx.vehicles.all.filter((v) => v.kind === 'horse').every((h) => (h as unknown as { ready: boolean }).ready), undefined, {
    timeout: 30_000,
  });
});

test.afterAll(async () => {
  await page.close();
});

test('two friendly horses idle in the ranch paddock', async () => {
  const info = await page.evaluate(() => {
    const rg = window.__rg!;
    const ranch = rg.ctx.world.anchors.ranch;
    const horses = rg.ctx.vehicles.all.filter((v) => v.kind === 'horse');
    return {
      count: horses.length,
      car: rg.ctx.vehicles.all[0].kind,
      dists: horses.map((h) => Math.hypot(h.position.x - ranch.position.x, h.position.z - ranch.position.z)),
      ground: horses.map((h) => h.position.y - rg.ctx.world.heightAt(h.position.x, h.position.z)),
      visible: horses.map((h) => h.object.visible),
    };
  });
  expect(info.count).toBe(2);
  expect(info.car).toBe('car'); // the buggy stays vehicles.all[0]
  for (const d of info.dists) expect(d).toBeLessThan(12);
  for (const g of info.ground) expect(Math.abs(g)).toBeLessThan(0.3);
  expect(info.visible).toEqual([true, true]);
});

test('E mounts: riding mode, the rider sits on the saddle', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse')!;
    const q = h.object.quaternion;
    const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const x = h.position.x + Math.cos(yaw) * 1.8;
    const z = h.position.z - Math.sin(yaw) * 1.8;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, yaw);
    rg.step(1 / 60, 20, false);
  });
  await steps(1, { usePressed: true });
  await steps(150); // hop in, friendly whinny and rear-up
  const s = await horseState();
  expect(s.mode).toBe('riding');
  expect(s.riding).toBe(true);
  expect(s.playerDist).toBeLessThan(0.8);
  // The rider's feet (root) hang below the saddle (~1.7 m) and above the ground.
  expect(s.playerAbove).toBeGreaterThan(0.6);
  expect(s.playerAbove).toBeLessThan(1.7);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.cameraRig.setOverride({ yawOffset: 1.1, distance: 4.2 });
    rg.step(1 / 60, 60, false);
  });
  await save('mounted');
  await page.evaluate(() => window.__rg!.ctx.cameraRig.setOverride(null));
});

test('gallops with Shift at ~13 m/s and the rider rides along', async () => {
  const before = await horseState();
  await steps(150, { moveY: 1, sprint: true });
  const s = await horseState();
  expect(s.gait).toBe('gallop');
  expect(s.speed).toBeGreaterThan(11);
  expect(s.speed).toBeLessThan(13.5);
  expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeGreaterThan(15);
  expect(s.playerDist).toBeLessThan(0.8);
  expect(s.mode).toBe('riding');
  await save('gallop');
});

test('Space jumps about 1.6 m', async () => {
  const s0 = await horseState();
  const rise = await page.evaluate(() => {
    const rg = window.__rg!;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse')!;
    const y0 = h.position.y;
    let max = y0;
    rg.inject({ moveY: 1, sprint: true, jump: true, jumpPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject({ moveY: 1, sprint: true });
    for (let i = 0; i < 60; i++) {
      rg.step(1 / 60, 1, false);
      max = Math.max(max, h.position.y);
    }
    rg.inject(null);
    return max - y0;
  });
  expect(s0.grounded).toBe(true);
  expect(rise).toBeGreaterThan(1.4);
  expect(rise).toBeLessThan(2.4);
  await steps(30);
  expect((await horseState()).grounded).toBe(true);
});

test('R puts the horse on a safe spot and the rider down beside it (R always lets go)', async () => {
  await steps(1, { respawnPressed: true });
  await steps(10);
  const s = await horseState();
  expect(s.mode).toBe('walk');
  expect(s.riding).toBe(false);
  expect(s.onLand).toBe(true);
  expect(s.playerDist).toBeLessThan(3.5);
});

test('E dismounts to a free side', async () => {
  // Back in the saddle first (R let go above).
  await page.evaluate(() => {
    const rg = window.__rg!;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse')!;
    const q = h.object.quaternion;
    const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const x = h.position.x + Math.cos(yaw) * 1.8;
    const z = h.position.z - Math.sin(yaw) * 1.8;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, yaw);
    rg.step(1 / 60, 20, false);
  });
  await steps(1, { usePressed: true });
  await steps(150);
  expect((await horseState()).mode).toBe('riding');
  await steps(60);
  await steps(1, { usePressed: true });
  await steps(60);
  const s = await horseState();
  expect(s.mode).toBe('walk');
  expect(s.riding).toBe(false);
  expect(s.playerDist).toBeGreaterThan(1);
  expect(s.playerDist).toBeLessThan(3.5);
  expect(consoleErrors).toEqual([]);
});

test('QA8 m11: ridden at the Foam Lava course from 8 directions, the horse is turned away and never stalls 3 s', async () => {
  test.setTimeout(240_000);
  const rows = await page.evaluate(() => {
    const rg = window.__rg!;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse')! as unknown as {
      id: string;
      position: { x: number; y: number; z: number };
      object: { quaternion: { x: number; y: number; z: number; w: number } };
      teleport(p: { x: number; y: number; z: number }, yaw: number): void;
    };
    // The course pad (src/world/layout.ts PADS 'foamCourse'): centre and half extents.
    const C = { x: -25.5, z: -38.75, hx: 7.5, hz: 26.5 };
    const yawOf = (): number => {
      const q = h.object.quaternion;
      return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    };
    const out: { dir: number; stillest: number; deepest: number; travelled: number; mode: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      // Out of the pad along this direction, then 8 m more, on a lane with nothing else in the way
      // (the village's fences and posts line the east side: this is about the course, not them):
      // shifted sideways up to 12 m to find one.
      const t0 = Math.min(dx !== 0 ? C.hx / Math.abs(dx) : Infinity, dz !== 0 ? C.hz / Math.abs(dz) : Infinity);
      let sx = C.x + dx * (t0 + 8);
      let sz = C.z + dz * (t0 + 8);
      for (const off of [0, 4, -4, 8, -8, 12, -12]) {
        const ex = C.x + dx * t0 - dz * off;
        const ez = C.z + dz * t0 + dx * off;
        const eye = rg.ctx.player.position.clone().set(ex, rg.ctx.world.heightAt(ex, ez) + 1.2, ez);
        if (!rg.ctx.physics.raycast(eye, eye.clone().set(dx, 0, dz), 9)) {
          sx = ex + dx * 8;
          sz = ez + dz * 8;
          break;
        }
      }
      if (rg.ctx.player.mode !== 'walk') {
        rg.inject({ respawnPressed: true });
        rg.step(1 / 60, 1, false);
        rg.inject(null);
        rg.step(1 / 60, 20, false);
      }
      const face = Math.atan2(C.x - sx, C.z - sz);
      h.teleport({ x: sx, y: rg.ctx.world.heightAt(sx, sz), z: sz }, face);
      rg.step(1 / 60, 5, false);
      const px = sx + Math.cos(face) * 1.8;
      const pz = sz - Math.sin(face) * 1.8;
      rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.2, pz, face);
      rg.step(1 / 60, 10, false);
      // Straight into the saddle (an E here could pick a nearby booth's prompt instead).
      (rg.ctx.vehicles as unknown as { board(id: string): boolean }).board(h.id);
      rg.step(1 / 60, 120, false);
      const mode = rg.state().playerMode;
      const pts: [number, number][] = [];
      let deepest = -99;
      for (let k = 0; k < 44; k++) {
        // Steer at the course centre, W held (a child who wants to ride in).
        const p = h.position;
        let d = Math.atan2(C.x - p.x, C.z - p.z) - yawOf();
        d = Math.atan2(Math.sin(d), Math.cos(d));
        rg.inject({ moveY: 1, moveX: Math.max(-1, Math.min(1, -d * 2)) });
        rg.step(1 / 60, 15, false);
        pts.push([p.x, p.z]);
        // How far inside the pad the horse's middle got (m; negative = outside).
        const ex = Math.abs(p.x - C.x) - C.hx;
        const ez = Math.abs(p.z - C.z) - C.hz;
        deepest = Math.max(deepest, ex < 0 && ez < 0 ? -Math.max(ex, ez) : -Math.hypot(Math.max(ex, 0), Math.max(ez, 0)));
      }
      rg.inject(null);
      let stillest = 0;
      let travelled = 0;
      for (let k = 0; k < pts.length; k++) {
        let j = k;
        while (j + 1 < pts.length && Math.hypot(pts[j + 1][0] - pts[k][0], pts[j + 1][1] - pts[k][1]) < 1) j++;
        stillest = Math.max(stillest, (j - k) * 0.25);
        if (k > 0) travelled += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      }
      out.push({ dir: i, stillest, deepest, travelled, mode });
    }
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 20, false);
    return out;
  });
  console.log(rows.map((r) => JSON.stringify(r)).join('\n'));
  for (const r of rows) {
    const msg = JSON.stringify(r);
    expect(r.mode, msg).toBe('riding');
    expect(r.stillest, msg).toBeLessThanOrEqual(3);
    expect(r.deepest, msg).toBeLessThan(0.5);
  }
});
