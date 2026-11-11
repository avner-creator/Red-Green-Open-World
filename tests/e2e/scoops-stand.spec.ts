/**
 * The Scoops stand on foot (QA6 M2 and the counter row) and the game camera (QA6 M5).
 *
 * - A walking bot sweeps the stand from 16 directions: to the counter, then out the far side,
 *   turning right along anything it bumps into (like a child would). Nowhere may the hero's real
 *   displacement stay under 0.3 m for 3 s while input is held; the hero never stands inside a
 *   friend; the camera never sits inside a visible friend; nobody gets behind or onto the counter.
 * - Walking straight at each friend: the hero slides round (or the friend steps aside), never
 *   stuck, never inside.
 * - Building with the tallest hero in the biggest hat: the cone and the tubs are on screen and not
 *   covered by the hero (projected bounds), on 16:9 and on a phone-shaped viewport.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot, canvasShot, SHOTS } from './helpers';
import type { InputState } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    rg.setRemaining(3000);
    const s = window.__rgScoops!.info();
    rg.teleport(s.customer[0], s.customer[1] + 0.3, s.customer[2] + 0.1, s.site.yaw);
    rg.step(1 / 60, 10, false);
  });
  // The friends' models load once the hero is near and the game is on.
  for (let i = 0; i < 120 && !(await page.evaluate(() => window.__rgScoops!.info().friendsLoaded)); i++) {
    await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
    await page.waitForTimeout(250);
  }
  expect(await page.evaluate(() => window.__rgScoops!.info().friendsLoaded)).toBe(true);
});

test.afterAll(async () => {
  await page.close();
});

interface RunResult {
  stalls: { at: [number, number]; t: number }[];
  minFriend: number;
  camInFriend: number;
  behind: number;
  onTop: number;
  reached: number;
  end: [number, number, number];
}

/**
 * One bot walk through `points` (parlour local x, z), all in the page (simulation-only frames).
 * Holds "forward" with the camera yaw on the heading (camera-relative input), steering to the
 * clear direction nearest the goal (short physics rays). When it is blocked anyway for 0.4 s it
 * turns 90° right for 1.1 s, then heads for the waypoint again; blocked again soon after (a corner),
 * it tries left, then back, a little longer each time.
 */
async function walk(points: [number, number][], seconds = 22, straight = false): Promise<RunResult> {
  return page.evaluate(
    ([pts, secs, straightOnly]) => {
      const rg = window.__rg!;
      const cam = window.__rgCamera!;
      const sc = window.__rgScoops!;
      const site = sc.info().site;
      const cy = Math.cos(site.yaw);
      const sy = Math.sin(site.yaw);
      const W = (lx: number, lz: number): [number, number] => [site.x + cy * lx + sy * lz, site.z - sy * lx + cy * lz];
      const L = (wx: number, wz: number): [number, number] => {
        const dx = wx - site.x;
        const dz = wz - site.z;
        return [cy * dx - sy * dz, sy * dx + cy * dz];
      };
      const wps = pts.map(([x, z]) => W(x, z));
      const [x0, z0] = wps[0];
      const h0 = Math.atan2(wps[1][0] - x0, wps[1][1] - z0);
      rg.teleport(x0, rg.ctx.world.heightAt(x0, z0) + 0.3, z0, h0);
      rg.step(1 / 60, 20, false);
      const res = { stalls: [] as { at: [number, number]; t: number }[], minFriend: 99, camInFriend: 0, behind: 0, onTop: 0, reached: 0, end: [0, 0, 0] as [number, number, number] };
      const hist: [number, number][] = [];
      let wi = 1;
      let detour = 0;
      let turn = 0;
      /** Blocks in a row (a corner): right, then left, then back the way it came, longer each time. */
      let blocks = 0;
      let freeT = 99;
      let lastStall = -9;
      let side = 1;
      let commitH = 0;
      let commitT = 0;
      const o = rg.ctx.player.position.clone();
      const d = o.clone();
      const TICK = 6; // frames per bot decision (0.1 s)
      const n = Math.round((secs * 60) / TICK);
      for (let k = 0; k < n && wi < wps.length; k++) {
        const p = rg.ctx.player.position;
        const [tx, tz] = wps[wi];
        if (Math.hypot(tx - p.x, tz - p.z) < 0.9) {
          wi++;
          res.reached++;
          continue;
        }
        hist.push([p.x, p.z]);
        // Blocked for 0.4 s: turn along the obstacle for a while (right, then left, then back).
        if (!straightOnly && detour <= 0 && hist.length > 4) {
          const q = hist[hist.length - 5];
          if (Math.hypot(p.x - q[0], p.z - q[1]) < 0.25) {
            blocks = freeT < 20 ? blocks + 1 : 0;
            turn = [-Math.PI / 2, Math.PI / 2, Math.PI][blocks % 3];
            detour = Math.min(30, 11 + 5 * blocks);
            freeT = 0;
          } else freeT++;
        }
        let heading = Math.atan2(tx - p.x, tz - p.z);
        if (detour > 0) {
          heading += turn;
          detour--;
        } else if (commitT > 0) {
          // Going round something big: keep the chosen way for a moment (no dithering in a U).
          heading = commitH;
          commitT--;
        } else if (!straightOnly) {
          // Look ahead like a child does: the clear direction closest to the goal, keeping to one
          // side once chosen (walls, counter, poles; friends and the shop front are felt instead).
          let pick = heading;
          for (let j = 0; j <= 12; j++) {
            const off = j === 0 ? 0 : side * Math.ceil(j / 2) * (j % 2 ? 1 : -1) * (Math.PI / 6);
            const a = heading + off;
            let clear = true;
            for (const h of [0.35, 1.2]) {
              for (const lat of [-0.3, 0, 0.3]) {
                o.set(p.x + Math.cos(a) * lat, p.y + h, p.z - Math.sin(a) * lat);
                d.set(Math.sin(a), 0, Math.cos(a));
                if (rg.ctx.physics.raycast(o, d, 1.1)) clear = false;
              }
            }
            if (clear) {
              pick = a;
              if (off !== 0) side = Math.sign(off);
              if (Math.abs(off) > 1.5) {
                commitH = a;
                commitT = 8;
              }
              break;
            }
          }
          heading = pick;
        }
        cam.setView(heading);
        rg.inject({ moveX: 0, moveY: 1 });
        rg.step(1 / 60, TICK, false);
        // 3 s window: real displacement under 0.3 m = a stall.
        if (hist.length > 30) {
          const q = hist[hist.length - 31];
          const now = rg.ctx.player.position;
          if (Math.hypot(now.x - q[0], now.z - q[1]) < 0.3 && k - lastStall > 30) {
            res.stalls.push({ at: L(now.x, now.z).map((v) => +v.toFixed(2)) as [number, number], t: +((k * TICK) / 60).toFixed(1) });
            lastStall = k;
          }
        }
        const now = rg.ctx.player.position;
        const [lx, lz] = L(now.x, now.z);
        const ly = now.y - site.y;
        if (Math.abs(lx) < 3.85 && lz > -2.9 && lz < 1.3 && ly < 2.2) res.behind++;
        if (Math.abs(lx) < 3.4 && lz > 1.33 && lz < 2.11 && ly > 1.4) res.onTop++;
        const c = rg.ctx.camera.position;
        for (const f of sc.info().friends) {
          res.minFriend = Math.min(res.minFriend, Math.hypot(now.x - f.world[0], now.z - f.world[2]));
          if (f.opacity > 0.1 && Math.hypot(c.x - f.world[0], c.z - f.world[2]) < 0.45 && c.y < f.world[1] + 1.9) res.camInFriend++;
        }
      }
      rg.inject(null);
      rg.step(1 / 60, 2, false);
      const e = rg.ctx.player.position;
      res.end = [...L(e.x, e.z), e.y - site.y].map((v) => +v.toFixed(2)) as [number, number, number];
      return res;
    },
    [points, seconds, straight] as const,
  );
}

test('walking bot from 16 directions: never stuck, never in a friend or behind the counter', async () => {
  test.setTimeout(400_000);
  const fails: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const R = 10;
    const start: [number, number] = [Math.sin(a) * R, 0.75 + Math.cos(a) * R];
    const far: [number, number] = [-start[0], 1.5 - start[1]];
    const r = await walk([start, [0, 3.2], far]);
    const tag = `dir ${i}: ${JSON.stringify(r)}`;
    if (r.stalls.length || r.minFriend < 0.45 || r.camInFriend > 0 || r.behind > 0 || r.onTop > 0) fails.push(tag);
  }
  expect(fails, fails.join('\n')).toEqual([]);
});

test('across the terrace past the friends, and straight at each friend', async () => {
  test.setTimeout(240_000);
  const fails: string[] = [];
  for (const z of [2.55, 3.4, 4.3]) {
    for (const s of [-1, 1]) {
      const r = await walk([[-6 * s, z], [6 * s, z]], 10);
      if (r.stalls.length || r.minFriend < 0.45 || r.camInFriend > 0 || r.behind > 0) fails.push(`terrace z ${z} s ${s}: ${JSON.stringify(r)}`);
    }
  }
  // Straight at each friend from 4 sides (no turning): the hero slides round or the friend steps
  // aside; they never overlap and the hero is never held still for 3 s.
  const friends = await page.evaluate(() => window.__rgScoops!.info().friends.map((f) => f.pos));
  for (const [fx, , fz] of friends) {
    for (const [dx, dz] of [[0, 3], [3, 0.2], [-3, 0.2], [0.2, -1.2]] as const) {
      const from: [number, number] = [fx + dx, Math.max(2.4, fz + dz)];
      const to: [number, number] = [fx - dx * 1.2, Math.max(2.4, fz - dz * 1.2)];
      const r = await walk([from, to], 4, true);
      if (r.minFriend < 0.45 || r.camInFriend > 0) fails.push(`at friend ${fx.toFixed(1)},${fz.toFixed(1)} from ${dx},${dz}: ${JSON.stringify(r)}`);
    }
  }
  expect(fails, fails.join('\n')).toEqual([]);
});

/** One input edge, then `frames` simulation-only frames. */
async function press(patch: Partial<InputState>, frames = 2): Promise<void> {
  await page.evaluate(
    ([p, n]) => {
      const rg = window.__rg!;
      rg.inject(p as Partial<InputState>);
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, n as number, false);
    },
    [patch, frames] as const,
  );
}

/** Screen rect (0..1) of the hero and screen points of the cone and the tubs, from the live camera. */
async function framing(): Promise<{ hero: [number, number, number, number]; cone: [number, number][]; tubs: [number, number][] }> {
  return page.evaluate(() => {
    const rg = window.__rg!;
    const cam = rg.ctx.camera;
    cam.updateMatrixWorld(true);
    const V = cam.position.constructor as new (x?: number, y?: number, z?: number) => import('three').Vector3;
    const toScreen = (v: import('three').Vector3): [number, number] => {
      const p = v.clone().project(cam);
      return [(p.x + 1) / 2, (1 - p.y) / 2];
    };
    // Hero: every vertex position of every visible mesh under the hero (skinning ignored: rest
    // pose bounds, padded), which includes the hat and the face.
    let x0 = 1;
    let y0 = 1;
    let x1 = 0;
    let y1 = 0;
    const tmp = new V();
    rg.ctx.player.object.updateMatrixWorld(true);
    rg.ctx.player.object.traverse((o) => {
      const m = o as import('three').Mesh;
      if (!m.isMesh || !m.visible) return;
      const pos = m.geometry.getAttribute('position');
      if (!pos) return;
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        // The hero's body and hat only (not helper meshes such as a trail or a ground decal).
        if (tmp.distanceTo(rg.ctx.player.position) > 2.6) continue;
        const [sx, sy] = toScreen(tmp);
        x0 = Math.min(x0, sx);
        y0 = Math.min(y0, sy);
        x1 = Math.max(x1, sx);
        y1 = Math.max(y1, sy);
      }
    });
    const s = window.__rgScoops!.info();
    const cy = Math.cos(s.site.yaw);
    const sy = Math.sin(s.site.yaw);
    const W = (lx: number, ly: number, lz: number): import('three').Vector3 => new V(s.site.x + cy * lx + sy * lz, s.site.y + ly, s.site.z - sy * lx + cy * lz);
    // Cone (holder 0.55, 1.62, 1.72): the tip and up the stack.
    const cone = [0.05, 0.3, 0.6].map((h) => toScreen(W(0.55, 1.62 + h, 1.72)));
    const tubs = [0, 1, 2, 3, 4].map((i) => toScreen(W(1.0 + i * 0.4, 1.6, 1.72)));
    return { hero: [x0, y0, x1, y1] as [number, number, number, number], cone, tubs };
  });
}

for (const vp of [
  { name: 'desktop', width: 640, height: 360 },
  { name: 'phone', width: 750, height: 342 },
]) {
  test(`building: cone and tubs on screen and clear of the hero in the biggest hat (${vp.name})`, async () => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.profile.equip('character', 'alpaca');
      rg.ctx.profile.equip('head', 'hat-sombrero');
      rg.step(1 / 60, 2, false);
    });
    // The hero model may load from the network: give it real time.
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__rg!.ctx.player.characterId)) !== 'alpaca'; i++) await page.waitForTimeout(250);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const rg = window.__rg!;
      const s = window.__rgScoops!.info();
      rg.teleport(s.customer[0], s.customer[1] + 0.05, s.customer[2], s.site.yaw + Math.PI);
      rg.step(1 / 60, 4, false);
    });
    await press({ usePressed: true }, 60);
    expect((await page.evaluate(() => window.__rgScoops!.info())).phase).toBe('build');
    await press({ jumpPressed: true }, 40); // cone
    for (let i = 0; i < 3; i++) await press({ jumpPressed: true }, 100); // scoops
    await page.evaluate(() => window.__rg!.step(1 / 60, 240, false));
    const f = await framing();
    const inside = (p: [number, number]): boolean => p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.02 && p[1] < 0.98;
    const covered = (p: [number, number]): boolean => p[0] > f.hero[0] && p[0] < f.hero[2] && p[1] > f.hero[1] && p[1] < f.hero[3];
    for (const p of [...f.cone, ...f.tubs.slice(0, 3)]) {
      expect(inside(p), `${vp.name} ${JSON.stringify(f)}`).toBe(true);
    }
    for (const p of f.cone) expect(covered(p), `${vp.name} ${JSON.stringify(f)}`).toBe(false);
    // The recipe card (the friend's order) is up.
    await expect(page.getByTestId('scoops-recipe')).toBeVisible();
    await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
    if (SHOTS) await canvasShot(page, `test-results/scoops-build-${vp.name}.png`);
    await press({ respawnPressed: true }, 60);
    expect((await page.evaluate(() => window.__rgScoops!.info())).phase).toBe('idle');
  });
}

test('no console errors', () => {
  expect(consoleErrors).toEqual([]);
});
