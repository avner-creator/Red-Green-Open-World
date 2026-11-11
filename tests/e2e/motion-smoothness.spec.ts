/**
 * Motion smoothness at real display rates. The live loop calls `update(dt)` once per rendered
 * frame with a variable dt (60/90/120/144 Hz, or a jittery 45-75 fps trace) while physics runs in
 * fixed 1/60 s steps. Here we replay those dt sequences through `__rg.step(dt, 1, false)` and
 * record, per frame: the car's visual position, the camera, the car in camera space and the
 * body's pitch/roll. A car that stutters against the camera shows up as a big frame-to-frame
 * change in its camera-space velocity.
 *
 * Metrics (all per rendered frame):
 * - `jerk`: max |v_i - v_{i-1}| (m/s) of the car's (or walker's) camera-space position, where
 *   v_i = Δp_i / dt_i. Real accelerations give < ~0.5 m/s per frame; fixed-step aliasing gives
 *   several m/s (the visual moves 0 or 2 physics steps in a frame).
 * - `mm`: max distance (mm) the subject lands from a constant-velocity prediction, in camera
 *   space. This is what the eye sees as stutter: ~1 px at 1080p is ~4-5 mm at the chase distance.
 * - `angJerk`: max frame-to-frame change of the visual body pitch/roll rate (deg/s).
 * - at rest: max drift of the parked car's visual (mm, deg) over 2 s.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

// Not serial: a failing rate in one test must not hide the others (each test sets up its own state).
test.describe.configure({ mode: 'default' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await boot(page);
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

/** Seeded dt traces (seconds per rendered frame). */
function trace(name: string, n: number): number[] {
  let s = 12345;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (name === 'jitter45-75') out.push(1 / (45 + rnd() * 30));
    else if (name === 'jitter20-40') out.push(1 / (20 + rnd() * 20));
    else if (name === '60jit') out.push(1 / 60 + (rnd() - 0.5) * 0.0012); // a real 60 Hz rAF: ±0.6 ms
    else if (name === 'alt16-33') out.push(i % 2 ? 1 / 30 : 1 / 60);
    else if (name === 'hitch') out.push(i === Math.min(Math.floor(n / 2), 60) ? 0.15 : 1 / 60); // one 150 ms stall
    else out.push(1 / Number(name));
  }
  // The live loop clamps every frame to MAX_FRAME_DT (1/20 s).
  return out.map((d) => Math.min(d, 1 / 20));
}

/** deg/s per frame; real lean/heave changes stay well under this, step aliasing does not. */
const ANG_JERK_MAX = 30;
/**
 * Max camera-space velocity change per frame (m/s). Real driving changes stay ≲ 0.3 m/s per frame
 * even at 20 fps; fixed-step aliasing produced 17-160 m/s (the visual moving 0 or 2 steps).
 */
const JERK_MAX = 0.6;

const RATES = ['60', '60jit', '90', '120', '144', 'jitter45-75', '30', 'jitter20-40', 'alt16-33', 'hitch'];
/** Frames in `seconds` of the named trace (roughly). */
const framesFor = (rate: string, seconds: number): number => Math.round(seconds * (Number(rate) || (rate === 'jitter20-40' ? 30 : rate === 'alt16-33' ? 40 : 60)));

interface Metrics {
  /** Camera-space prediction error (mm): the visible stutter. */
  mm: number;
  worldMm: number;
  jerk: number;
  /** World-space jerk of the horizontal motion only (m/s per frame). */
  hJerk: number;
  worldJerk: number;
  angJerk: number;
  speed: number;
  /** Lowest car up-vector Y seen (1 = level). */
  minUp: number;
  maxSpeed: number;
}

/** Replay `dts` with `inject` held; measure the car (or the walker) against the camera. */
async function measure(p: Page, dts: number[], inject: Record<string, number | boolean>, subject: 'car' | 'player'): Promise<Metrics> {
  return p.evaluate(
    ([dts, inject, subject]) => {
      const rg = window.__rg!;
      const car = rg.ctx.vehicles.all[0];
      const cam = rg.ctx.camera;
      const body = car.object.getObjectByName('buggy-body')!;
      const pos = car.object.position.clone();
      const rows: { cs: number[]; w: number[]; pitch: number; roll: number; dt: number; spd: number }[] = [];
      const e = body.matrixWorld.elements;
      let minUp = 1;
      let maxSpeed = 0;
      rg.inject(inject);
      for (const dt of dts) {
        rg.step(dt, 1, false);
        cam.updateMatrixWorld();
        car.object.updateMatrixWorld(true);
        if (subject === 'car') car.object.getWorldPosition(pos);
        else pos.copy(rg.ctx.player.object.position);
        const w = [pos.x, pos.y, pos.z];
        pos.applyMatrix4(cam.matrixWorldInverse);
        // Body axes: forward = column 2, left = column 0.
        const fl = Math.hypot(e[8], e[9], e[10]);
        const ll = Math.hypot(e[0], e[1], e[2]);
        minUp = Math.min(minUp, 1 - 2 * (car.object.quaternion.x ** 2 + car.object.quaternion.z ** 2));
        maxSpeed = Math.max(maxSpeed, car.speed);
        rows.push({ cs: [pos.x, pos.y, pos.z], w, pitch: (Math.asin(e[9] / fl) * 180) / Math.PI, roll: (Math.asin(e[1] / ll) * 180) / Math.PI, dt, spd: car.speed });
      }
      rg.inject(null);
      const jerkOf = (k: 'cs' | 'w', axes = [0, 1, 2]): number => {
        let m = 0;
        for (let i = 2; i < rows.length; i++) {
          let d = 0;
          for (const c of axes) {
            const v1 = (rows[i][k][c] - rows[i - 1][k][c]) / rows[i].dt;
            const v0 = (rows[i - 1][k][c] - rows[i - 2][k][c]) / rows[i - 1].dt;
            d += (v1 - v0) ** 2;
          }
          m = Math.max(m, Math.sqrt(d));
        }
        return m;
      };
      let ang = 0;
      for (let i = 2; i < rows.length; i++) {
        for (const k of ['pitch', 'roll'] as const) {
          const w1 = (rows[i][k] - rows[i - 1][k]) / rows[i].dt;
          const w0 = (rows[i - 1][k] - rows[i - 2][k]) / rows[i - 1].dt;
          ang = Math.max(ang, Math.abs(w1 - w0));
        }
      }
      /** Max distance (mm) a frame lands from where constant velocity would have put it. */
      const predErr = (k: 'cs' | 'w'): number => {
        let m = 0;
        for (let i = 2; i < rows.length; i++) {
          let d = 0;
          for (let c = 0; c < 3; c++) {
            const guess = rows[i - 1][k][c] + ((rows[i - 1][k][c] - rows[i - 2][k][c]) * rows[i].dt) / rows[i - 1].dt;
            d += (rows[i][k][c] - guess) ** 2;
          }
          m = Math.max(m, Math.sqrt(d) * 1000);
        }
        return m;
      };
      return { mm: predErr('cs'), worldMm: predErr('w'), jerk: jerkOf('cs'), worldJerk: jerkOf('w'), hJerk: jerkOf('w', [0, 2]), angJerk: ang, speed: rows[rows.length - 1].spd, minUp, maxSpeed };
    },
    [dts, inject, subject] as const,
  );
}

async function getIn(p: Page): Promise<void> {
  await p.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0] as unknown as { teleport(p: { x: number; y: number; z: number }, yaw: number): void; object: { position: { x: number; z: number } } };
    car.teleport({ x: 1, y: rg.ctx.world.heightAt(1, 20), z: 20 }, 0);
    rg.step(1 / 60, 10, false);
    rg.teleport(1 + 1.9, rg.ctx.world.heightAt(2.9, 20) + 0.3, 20, 0);
    rg.step(1 / 60, 20, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 40, false);
  });
}

/** Car back on the south road heading +Z, at rest, player in it. */
async function resetDrive(p: Page): Promise<void> {
  await p.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0] as unknown as { teleport(p: { x: number; y: number; z: number }, yaw: number): void };
    car.teleport({ x: 1, y: rg.ctx.world.heightAt(1, 20), z: 20 }, 0);
    rg.step(1 / 60, 30, false);
  });
}

test('the buggy moves smoothly against the chase camera at every display rate', async () => {
  test.setTimeout(240_000);
  await getIn(page);
  expect(await page.evaluate(() => window.__rg!.state().playerMode)).toBe('driving');
  const results: Record<string, Metrics> = {};
  for (const rate of RATES) {
    await resetDrive(page);
    // Accelerate up the road for 1.5 s (60 Hz), then measure 1.5 s at the target rate at speed.
    await measure(page, trace('60', 90), { moveY: 1 }, 'car');
    results[rate] = await measure(page, trace(rate, framesFor(rate, 1.5)), { moveY: 1, moveX: 0.25 }, 'car');
  }
  console.log('[smooth] driving', JSON.stringify(results, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  for (const rate of RATES) {
    expect.soft(results[rate].speed, rate).toBeGreaterThan(12);
    expect.soft(results[rate].maxSpeed, rate).toBeLessThan(17.5);
    // Not flipped: the south road now has kerbs and footpath junctions (outer areas, sites), and the
    // gentle right steer rides up on one (about 20° of roll at most).
    expect.soft(results[rate].minUp, rate).toBeGreaterThan(0.92);
    expect.soft(results[rate].jerk, `camera-space jerk @${rate}`).toBeLessThan(JERK_MAX);
    expect.soft(results[rate].angJerk, `pitch/roll rate change @${rate}`).toBeLessThan(ANG_JERK_MAX);
  }
});

test('the buggy feels the same at every display rate (launch, hop, real-time)', async () => {
  test.setTimeout(240_000);
  if ((await page.evaluate(() => window.__rg!.state().playerMode)) !== 'driving') await getIn(page);
  const results: Record<string, { to14: number; hop: number; dist2s: number }> = {};
  for (const rate of RATES) {
    await resetDrive(page);
    const dts = trace(rate, 600);
    results[rate] = await page.evaluate((dts) => {
      const rg = window.__rg!;
      const car = rg.ctx.vehicles.all[0];
      const z0 = car.position.z;
      let t = 0;
      let to14 = -1;
      let i = 0;
      rg.inject({ moveY: 1 });
      let zPrev = z0;
      let tPrev = 0;
      while (t < 2 && i < dts.length) {
        zPrev = car.position.z;
        tPrev = t;
        rg.step(dts[i], 1, false);
        t += dts[i++];
        if (to14 < 0 && car.speed >= 14) to14 = t;
      }
      // Distance at exactly 2 s of game time (the last frame can overshoot by up to one frame).
      const dist2s = zPrev + ((car.position.z - zPrev) * (2 - tPrev)) / Math.max(1e-6, t - tPrev) - z0;
      // Hop at speed: one press, peak height above the start over the next second.
      const y0 = car.position.y;
      rg.inject({ moveY: 1, jumpPressed: true });
      rg.step(dts[i], 1, false);
      t = dts[i++];
      rg.inject({ moveY: 1 });
      let hop = 0;
      while (t < 1 && i < dts.length) {
        rg.step(dts[i], 1, false);
        t += dts[i++];
        hop = Math.max(hop, car.position.y - y0);
      }
      rg.inject(null);
      return { to14, hop, dist2s };
    }, dts);
  }
  console.log('[smooth] feel', JSON.stringify(results, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  const ref = results['60'];
  for (const rate of RATES) {
    const r = results[rate];
    expect.soft(r.to14, `0→14 m/s @${rate}`).toBeGreaterThan(0.9);
    expect.soft(r.to14, `0→14 m/s @${rate}`).toBeLessThan(2);
    expect.soft(Math.abs(r.to14 - ref.to14), `0→14 vs 60 Hz @${rate}`).toBeLessThan(0.08);
    // Same distance in the same game time: no slow motion, no time warp (hitch frame clamped).
    expect.soft(Math.abs(r.dist2s - ref.dist2s), `2 s distance vs 60 Hz @${rate}`).toBeLessThan(rate === 'hitch' ? 2 : 0.6);
    expect.soft(r.hop, `hop height @${rate}`).toBeGreaterThan(0.6);
    expect.soft(Math.abs(r.hop - ref.hop), `hop vs 60 Hz @${rate}`).toBeLessThan(0.15);
  }
});

test('a stopped buggy rests dead still at every display rate', async () => {
  test.setTimeout(240_000);
  if ((await page.evaluate(() => window.__rg!.state().playerMode)) !== 'driving') await getIn(page);
  const results: Record<string, { mm: number; deg: number; d: number[]; v: number }> = {};
  for (const rate of RATES) {
    await resetDrive(page);
    await measure(page, trace('60', 60), { moveY: 1 }, 'car');
    await measure(page, trace('60', 60), { moveY: -1 }, 'car');
    await measure(page, trace('60', 150), {}, 'car');
    results[rate] = await page.evaluate((dts) => {
      const rg = window.__rg!;
      const car = rg.ctx.vehicles.all[0];
      const body = car.object.getObjectByName('buggy-body')!;
      car.object.updateMatrixWorld(true);
      const p0 = body.getWorldPosition(car.object.position.clone());
      const q0 = body.getWorldQuaternion(car.object.quaternion.clone());
      const p = p0.clone();
      const q = q0.clone();
      let mm = 0;
      let deg = 0;
      for (const dt of dts) {
        rg.step(dt, 1, false);
        car.object.updateMatrixWorld(true);
        body.getWorldPosition(p);
        body.getWorldQuaternion(q);
        mm = Math.max(mm, p.distanceTo(p0) * 1000);
        deg = Math.max(deg, (q.angleTo(q0) * 180) / Math.PI);
      }
      return { mm, deg, d: [p.x - p0.x, p.y - p0.y, p.z - p0.z].map((v) => v * 1000), v: car.speed };
    }, trace(rate, framesFor(rate, 2)));
  }
  console.log('[smooth] at rest', JSON.stringify(results, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  for (const rate of RATES) {
    expect.soft(results[rate].mm, `rest drift mm @${rate}`).toBeLessThan(1);
    expect.soft(results[rate].deg, `rest drift deg @${rate}`).toBeLessThan(0.05);
  }
});

test('walking is smooth against the camera at every display rate', async () => {
  test.setTimeout(240_000);
  await page.evaluate(() => {
    const rg = window.__rg!;
    if (rg.state().playerMode !== 'driving') return;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 60, false);
  });
  expect(await page.evaluate(() => window.__rg!.state().playerMode)).toBe('walk');
  const results: Record<string, Metrics> = {};
  for (const rate of RATES) {
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.teleport(-3, rg.ctx.world.heightAt(-3, 20) + 0.2, 20, 0);
      rg.step(1 / 60, 30, false);
    });
    await measure(page, trace('60', 40), { moveY: 1 }, 'player');
    results[rate] = await measure(page, trace(rate, framesFor(rate, 1.3)), { moveY: 1 }, 'player');
  }
  console.log('[smooth] walking', JSON.stringify(results, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  for (const rate of RATES) {
    // Vertical kinks are the ground's (terrain facets, curbs: the same at every rate and inside
    // one frame); the loop must add nothing: smooth horizontally, and the camera adds no jerk.
    expect.soft(results[rate].hJerk, `walk horizontal jerk @${rate}`).toBeLessThan(JERK_MAX);
    expect.soft(results[rate].jerk - results[rate].worldJerk, `walk camera-added jerk @${rate}`).toBeLessThan(0.2);
  }
});

test('a boosted buggy (race pad / workshop rocket) stays smooth at every display rate', async () => {
  test.setTimeout(240_000);
  if ((await page.evaluate(() => window.__rg!.state().playerMode)) !== 'driving') await getIn(page);
  const results: Record<string, Metrics> = {};
  for (const rate of RATES) {
    await resetDrive(page);
    await measure(page, trace('60', 60), { moveY: 1 }, 'car');
    // Boost: +5 m/s top speed for 3 s with a one-shot 3 m/s kick (what a race pad gives).
    await page.evaluate(() => {
      const car = window.__rg!.ctx.vehicles.all[0] as unknown as { buggy?: { boost(extra: number, s: number, kick?: number): void } };
      car.buggy?.boost(5, 3, 3);
    });
    // Skip the kick frame itself (a deliberate shove), then measure while boosted.
    await measure(page, trace('60', 6), { moveY: 1 }, 'car');
    results[rate] = await measure(page, trace(rate, framesFor(rate, 1.2)), { moveY: 1 }, 'car');
  }
  console.log('[smooth] boosted', JSON.stringify(results, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  for (const rate of RATES) {
    expect.soft(results[rate].maxSpeed, `boosted top speed @${rate}`).toBeGreaterThan(15);
    expect.soft(results[rate].jerk, `boosted camera-space jerk @${rate}`).toBeLessThan(JERK_MAX * 1.5);
    expect.soft(results[rate].angJerk, `boosted pitch/roll rate change @${rate}`).toBeLessThan(ANG_JERK_MAX);
  }
});

test('rival buggies in a race move smoothly at every display rate', async () => {
  test.setTimeout(240_000);
  const started = await page.evaluate(() => {
    const rg = window.__rg!;
    // Out of the car, then start a race from the grid (the race seats the player itself).
    if (rg.ctx.player.vehicle) {
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 60, false);
    }
    const race = window.__rgRace;
    if (!race) return false;
    const ok = race.start();
    rg.step(1 / 60, 400, false); // lights, then the friends get going
    return ok;
  });
  expect(started).toBe(true);
  const results: Record<string, { jerk: number; speed: number }> = {};
  for (const rate of RATES) {
    const dts = trace(rate, framesFor(rate, 1.2));
    results[rate] = await page.evaluate((dts) => {
      const rg = window.__rg!;
      const own = rg.ctx.vehicles.all[0].object;
      const rivals = rg.ctx.scene.children.filter((o) => o.name === 'buggy' && o !== own);
      const rows: number[][][] = rivals.map(() => []);
      for (const dt of dts) {
        rg.step(dt, 1, false);
        rivals.forEach((r, i) => rows[i].push([r.position.x, r.position.y, r.position.z, dt]));
      }
      let jerk = 0;
      let speed = 0;
      for (const rr of rows) {
        for (let i = 2; i < rr.length; i++) {
          let d = 0;
          for (let c = 0; c < 3; c += 2) {
            const v1 = (rr[i][c] - rr[i - 1][c]) / rr[i][3];
            const v0 = (rr[i - 1][c] - rr[i - 2][c]) / rr[i - 1][3];
            d += (v1 - v0) ** 2;
          }
          jerk = Math.max(jerk, Math.sqrt(d));
          speed = Math.max(speed, Math.hypot(rr[i][0] - rr[i - 1][0], rr[i][2] - rr[i - 1][2]) / rr[i][3]);
        }
      }
      return { jerk, speed, n: rivals.length };
    }, dts);
  }
  console.log('[smooth] rivals', JSON.stringify(results, (_, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  for (const rate of RATES) {
    expect.soft(results[rate].speed, `rivals moving @${rate}`).toBeGreaterThan(4);
    // Rivals are posed every rendered frame from their lap position (no fixed-step aliasing): their
    // horizontal velocity changes only as much as real cornering / rubber-banding does.
    expect.soft(results[rate].jerk, `rival horizontal jerk @${rate}`).toBeLessThan(JERK_MAX * 2);
  }
  await page.evaluate(() => {
    window.__rgRace?.exit();
    window.__rg!.step(1 / 60, 60, false);
  });
});
