/**
 * Glasses weave parts `bounce` (perfect-bounce ring on the trampoline) and `hero` (skill ring and
 * combo number over the hero), on one shared page. For each: the part's own layer objects change
 * only the weak channel (all 4 lens/eye combinations), the answer is invisible without the weak
 * eye (bit-identical frames, with a positive control), a hit and a miss through real input (a real
 * trampoline flight; a real skill and real gem pickups), the draw budget (0 when not in use, ≤ 3
 * when active), and default-camera full / R-only / G-only screenshots (640×360 and 1280×720).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { COMBOS, channelOnly, expectAnswerBlindWithoutWeakEye, maxOf, setEye } from './glasses-helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses/weave';
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
  return page.evaluate(() => (window as unknown as { __weaveEvents: Ev[] }).__weaveEvents.splice(0));
}

const results = (ev: Ev[]): Ev[] => ev.filter((e) => e.type === 'result');

async function dbg(id: string): Promise<Record<string, unknown>> {
  return page.evaluate((i) => window.__rgGlasses!.weave!.debug(i), id);
}

async function draws(id: string): Promise<number> {
  return page.evaluate((i) => window.__rgGlasses!.weave!.draws(i), id);
}

async function force(id: string, params: Record<string, unknown>): Promise<void> {
  await page.evaluate(({ i, p }) => window.__rgGlasses!.weave!.force(i, p), { i: id, p: params });
}

/** Full / R-only / G-only of the current frame; `big` also at 1280×720. */
async function save(name: string, big = true): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const write = (img: PNG, tag: string): void => {
    writeFileSync(`${OUT}/${tag}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${tag}-G.png`, PNG.sync.write(channelOnly(img, 1)));
  };
  await page.evaluate(() => window.__rg!.render());
  write(await canvasShot(page, `${OUT}/${name}-full.png`), name);
  if (!big) return;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.evaluate(() => window.__rg!.render());
  write(await canvasShot(page, `${OUT}/${name}-720p-full.png`), `${name}-720p`);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await page.evaluate(() => window.__rg!.render());
}

/**
 * For all 4 lens/eye combinations: hiding the part's own layer objects (names starting with
 * `prefix`) changes ≥ `minPixels` pixels of the weak channel and leaves the strong channel and blue
 * bit-identical.
 */
async function expectOwnObjectsOnlyTouchWeak(prefix: string, minPixels = 30): Promise<void> {
  const frame = async (show: boolean): Promise<PNG> => {
    await page.evaluate(
      ({ p, s }) => {
        window.__rg!.setLayerObjectsVisible(p, s);
        window.__rg!.render();
      },
      { p: prefix, s: show },
    );
    return canvasShot(page);
  };
  for (const combo of COMBOS) {
    const tag = `${prefix} ${combo.eye.leftLens}-left, weak ${combo.eye.weakEye}`;
    await setEye(page, combo.eye);
    const withIt = await frame(true);
    const without = await frame(false);
    const d = channelDiff(withIt, without);
    expect(d[combo.weak], `${tag}: weak channel changes`).toBeGreaterThanOrEqual(minPixels);
    expect(maxOf(d, combo.strong), `${tag}: strong channel untouched`).toBe(0);
    expect(d.maxB, `${tag}: blue untouched`).toBe(0);
  }
  await page.evaluate((p) => window.__rg!.setLayerObjectsVisible(p, true), prefix);
  await setEye(page, COMBOS[0].eye);
}

/** Step single frames (no render) until `bounce` debug matches, at most `max` frames. */
async function stepBounceUntil(cond: string, max = 900): Promise<Record<string, unknown>> {
  return page.evaluate(
    ({ c, m }) => {
      const rg = window.__rg!;
      const test = new Function('d', `return (${c});`) as (d: Record<string, unknown>) => boolean;
      for (let i = 0; i < m; i++) {
        const d = window.__rgGlasses!.weave!.debug('bounce');
        if (test(d)) return d;
        rg.step(1 / 60, 1, false);
      }
      return window.__rgGlasses!.weave!.debug('bounce');
    },
    { c: cond, m: max },
  );
}

/** Press Jump once (held on afterwards, so the trampoline keeps growing). */
async function pressJump(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ jump: true, jumpPressed: true });
    rg.step(1 / 60, 1, false);
  });
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
    const w = window as unknown as { __weaveEvents: Ev[] };
    w.__weaveEvents = [];
    rg.ctx.events.on('glasses:result', (e) => {
      if (e.mechanic === 'bounce' || e.mechanic === 'hero') w.__weaveEvents.push({ type: 'result', ...e });
    });
    rg.ctx.events.on('ui:toast', (e) => w.__weaveEvents.push({ type: 'toast', icon: e.icon }));
  });
});

test.afterAll(async () => {
  await page.close();
});


// ───────────────────────────── bounce ─────────────────────────────

/** Press Jump again (edge) while holding it. */
const pressAgain = pressJump;

test('bounce: idle off the trampoline; bold ring mid-fall (tier 1 and 3) only in the weak channel; its timing hidden from the strong eye', async () => {
  expect(await dbg('bounce')).toMatchObject({ active: false, tracked: 0 });
  expect(await draws('bounce')).toBe(0);
  // Walk onto the mat holding Jump (a hold is not a press): 12 m (no ring), then 18 m with a ring.
  // Each descent counts once (QA r7 M4: `falls` went up once per frame and no ring ever came).
  await page.evaluate(() => {
    const rg = window.__rg!;
    const c = window.__rgThrills!.trampoline();
    rg.teleport(c.x + 1, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 2, false);
    rg.inject({ jump: true });
  });
  let d = await stepBounceUntil('d.ring === true');
  expect(d).toMatchObject({ ring: true, falling: true, tier: 1, decided: false });
  expect(d.fall as number).toBeGreaterThan(1.2);
  expect(d.falls as number).toBeLessThanOrEqual(2);
  // Mid-fall, with the perfect moment late in the fall (the closing band still well outside).
  await force('bounce', { perfectAt: 0.8 });
  d = await stepBounceUntil('d.at >= 0.35');
  expect(d.at as number).toBeLessThan((d.perfect as number) - (d.half as number));
  expect(await draws('bounce')).toBe(1);
  await save('bounce-midfall-t1');
  await force('bounce', { tier: 3 });
  await save('bounce-midfall-t3');
  await force('bounce', { lookOffset: [-10, 4] });
  await save('bounce-grass-t3', false);
  await force('bounce', { lookOffset: null, tier: 1 });
  await expectOwnObjectsOnlyTouchWeak('weave-bounce');
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force('bounce', { perfectAt: 0 }),
    setB: () => force('bounce', { perfectAt: 1 }),
    combos: COMBOS.slice(1, 2),
    label: 'bounce perfect moment',
  });
});

test('bounce: one press at the ring = hit; one early press = miss; mashing and the landing press give nothing', async () => {
  await events();
  // Hit: one press when the ring closes (the result comes when the landing zone starts).
  await force('bounce', { perfectAt: 0.5 });
  let d = await stepBounceUntil('d.at >= d.perfect - 0.004');
  expect(d.decided).toBe(false);
  await pressJump();
  expect(results(await events())).toEqual([]);
  d = await stepBounceUntil('d.decided === true');
  expect(d).toMatchObject({ hits: 1, lastGrade: 'hit', ring: false });
  let ev = await events();
  expect(results(ev)).toEqual([{ type: 'result', mechanic: 'bounce', kind: 'timeIt', tier: 1, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  await page.evaluate(() => window.__rg!.step(1 / 60, 6));
  const n = await draws('bounce');
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThanOrEqual(3);
  await save('bounce-hit', false);

  // Miss: next fall, one press right after the ring appears.
  d = await stepBounceUntil('d.ring === true && d.decided === false && d.at >= 0.1');
  expect(d.at as number).toBeLessThan((d.perfect as number) - (d.half as number));
  await pressJump();
  d = await stepBounceUntil('d.decided === true');
  expect(d).toMatchObject({ misses: 1, lastGrade: 'miss' });
  ev = await events();
  expect(results(ev)).toEqual([{ type: 'result', mechanic: 'bounce', kind: 'timeIt', tier: 1, hit: false }]);
  expect(ev.some((e) => e.type === 'toast')).toBe(false);

  // Mashing: two presses in one fall → no result.
  await force('bounce', { perfectAt: 0.5 });
  expect(await stepBounceUntil('d.ring === true && d.decided === false && d.at >= d.perfect - 0.004')).toMatchObject({ ring: true });
  await pressJump();
  await page.evaluate(() => window.__rg!.step(1 / 60, 6, false));
  await pressAgain();
  d = await stepBounceUntil('d.decided === true');
  expect(d).toMatchObject({ hits: 1, misses: 1, mashed: 1, lastGrade: 'mash' });
  expect(results(await events())).toEqual([]);

  // The landing press only (last 0.3 s): no result.
  expect(await stepBounceUntil('d.ring === true && d.decided === false && d.at >= 0.05')).toMatchObject({ ring: true });
  expect(await stepBounceUntil('d.fall - d.at <= 0.3')).toMatchObject({ decided: true, presses: 0 });
  await pressJump();
  d = await dbg('bounce');
  expect(d).toMatchObject({ hits: 1, misses: 1, lastGrade: 'none' });
  expect(results(await events())).toEqual([]);

  // R lets go of the trampoline: nothing attached, no draws.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 60, false);
  });
  expect(await dbg('bounce')).toMatchObject({ onTrampoline: false, active: false, tracked: 0 });
  expect(await draws('bounce')).toBe(0);
});

// ───────────────────────────── hero ─────────────────────────────

/** Put the player's chest on gem spot `i` and let a few frames run; returns the gems picked up. */
async function touchGem(i: number): Promise<number> {
  return page.evaluate((k) => {
    const rg = window.__rg!;
    let n = 0;
    const off = rg.ctx.events.on('gem:collected', () => n++);
    const p = rg.ctx.world.gemSpots[k].position;
    rg.teleport(p.x, p.y - 0.85, p.z);
    rg.step(1 / 60, 3, false);
    off();
    return n;
  }, i);
}

/** Press the skill key once (panda: a dash). */
async function pressSkill(): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ skill: true, skillPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
  });
}

test('hero: on demand only (0 draws idle); recharge ring and ×N in the weak channel only; sparkles hidden from the strong eye', async () => {
  await page.evaluate(async () => {
    const rg = window.__rg!;
    await rg.ctx.player.setCharacter('panda'); // dash: fires on the ground
    rg.ctx.player.respawn();
    rg.step(1 / 60, 90, false);
  });
  await force('hero', { spark: null, nextIn: 999 });
  // Idle in walk mode (skill ready, no combo): nothing attached.
  expect(await dbg('hero')).toMatchObject({ active: false, tracked: 0, ring: null, number: null });
  expect(await draws('hero')).toBe(0);

  // The skill recharges: the ring shows its progress arc; the number shows at ×3.
  await force('hero', { combo: 3 });
  const home = await page.evaluate(() => {
    const p = window.__rg!.ctx.player.position;
    return { x: p.x, y: p.y, z: p.z, yaw: window.__rg!.ctx.player.yaw };
  });
  await pressSkill();
  // The dash carries the hero 7 m; bring him back to the open spawn plaza for the picture.
  await page.evaluate((h) => {
    const rg = window.__rg!;
    rg.step(1 / 60, 15, false);
    rg.teleport(h.x, h.y + 0.05, h.z, h.yaw);
    rg.step(1 / 60, 30);
  }, home);
  let d = await dbg('hero');
  expect(d.ring).not.toBeNull();
  expect(d.number).toMatchObject({ text: '×3' });
  expect(await draws('hero')).toBe(2);
  await save('hero-recharge');
  await expectOwnObjectsOnlyTouchWeak('weave-hero');

  // Ready, then 2 s later the ring goes away again.
  await page.evaluate(() => window.__rg!.step(1 / 60, 90 + 130, false));
  d = await dbg('hero');
  expect(d.ring).toBeNull();
  expect(await draws('hero')).toBe(1); // the number only
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force('hero', { spark: null }),
    setB: () => force('hero', { spark: 'skill', age: 0.5 }),
    combos: COMBOS.slice(0, 1),
    label: 'hero ring sparkle',
  });
  await expectAnswerBlindWithoutWeakEye(page, {
    setA: () => force('hero', { spark: null }),
    setB: () => force('hero', { spark: 'combo', age: 0.5 }),
    combos: COMBOS.slice(2, 3),
    label: 'hero number sparkle',
  });
  await force('hero', { spark: 'skill', age: 0.5 });
  await save('hero-sparkle');
  await force('hero', { spark: null, combo: null });
  expect(await draws('hero')).toBe(0);
});

test('hero: skill in a ring sparkle = hit, late = miss; a gem in a number sparkle = hit', async () => {
  await events();
  // Skill hit: a real dash press during the sparkle (the ring shows for the window).
  await force('hero', { spark: 'skill', nextIn: 999 });
  expect(await draws('hero')).toBe(1);
  await page.evaluate(() => window.__rg!.step(1 / 60, 24, false));
  await pressSkill();
  await page.evaluate(() => window.__rg!.step(1 / 60, 2));
  let d = await dbg('hero');
  expect(d).toMatchObject({ hits: 1, lastResult: 'skill:hit', spark: null });
  let ev = await events();
  expect(results(ev)).toEqual([{ type: 'result', mechanic: 'hero', kind: 'onHero', tier: 1, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  const n = await draws('hero');
  expect(n).toBeGreaterThanOrEqual(2); // ring + burst
  expect(n).toBeLessThanOrEqual(3);
  await save('hero-skill-hit', false);

  // Skill miss: the sparkle closes (1.5 s), then a dash 0.4 s later.
  await page.evaluate(() => window.__rg!.step(1 / 60, 120, false)); // dash recharges
  await force('hero', { spark: 'skill' });
  await page.evaluate(() => window.__rg!.step(1 / 60, 90 + 24, false));
  await pressSkill();
  d = await dbg('hero');
  expect(d).toMatchObject({ misses: 1, lastResult: 'skill:miss' });
  ev = await events();
  expect(results(ev)).toEqual([{ type: 'result', mechanic: 'hero', kind: 'onHero', tier: 1, hit: false }]);
  expect(ev.some((e) => e.type === 'toast')).toBe(false);

  // Gem hit: two real pickups make the combo ×2 (the number shows), a sparkle, then a third pickup.
  const plaza = await page.evaluate(() =>
    window.__rg!.ctx.world.gemSpots.map((s, i) => (s.tag === 'plaza' ? i : -1)).filter((i) => i >= 0),
  );
  expect(plaza.length).toBeGreaterThanOrEqual(3);
  expect(await touchGem(plaza[0])).toBe(1);
  expect(await touchGem(plaza[1])).toBe(1);
  d = await dbg('hero');
  expect(d.number).toMatchObject({ text: '×2' });
  await force('hero', { spark: 'combo' });
  await page.evaluate(() => window.__rg!.step(1 / 60, 20, false));
  await events();
  expect(await touchGem(plaza[2])).toBe(1);
  d = await dbg('hero');
  expect(d).toMatchObject({ hits: 2, lastResult: 'combo:hit' });
  ev = await events();
  expect(results(ev)).toEqual([{ type: 'result', mechanic: 'hero', kind: 'onHero', tier: 1, hit: true }]);
  expect(ev.some((e) => e.type === 'toast' && e.icon === 'gem')).toBe(true);
  expect(await draws('hero')).toBeLessThanOrEqual(3);

  // The combo runs out and the ring's ready hold ends: nothing attached again.
  await page.evaluate(() => window.__rg!.step(1 / 60, 300, false));
  expect(await dbg('hero')).toMatchObject({ active: false, tracked: 0 });
  expect(await draws('hero')).toBe(0);
  // Hidden avatar (a vehicle / ride): nothing attached even with a sparkle forced.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.player.setVisible(false);
    rg.step(1 / 60, 2, false);
  });
  await force('hero', { spark: 'skill' });
  await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
  expect(await dbg('hero')).toMatchObject({ active: false, tracked: 0, spark: null });
  expect(await draws('hero')).toBe(0);
  await page.evaluate(() => {
    window.__rg!.ctx.player.setVisible(true);
    window.__rg!.step(1 / 60, 2, false);
  });
});

test('hero: QA8 M4 a real Q press while the ring sparkles is a hit for every hero (never "cancelled")', async () => {
  const ids = ['robot', 'frog', 'panda', 'bee', 'pup', 'flamingo', 'rex', 'fox', 'alpaca', 'trike'];
  const fired: string[] = [];
  for (const id of ids) {
    const ok = await page.evaluate(async (cid) => {
      const rg = window.__rg!;
      try {
        await rg.ctx.player.setCharacter(cid as Parameters<typeof rg.ctx.player.setCharacter>[0]);
      } catch {
        return false;
      }
      rg.ctx.player.respawn();
      rg.step(1 / 60, 240, false);
      return rg.ctx.player.skill.ready;
    }, id);
    if (!ok) continue;
    const before = await dbg('hero');
    // A real key: on the ground first; heroes whose power needs the air get a jump first.
    const press = async (air: boolean): Promise<boolean> => {
      await page.evaluate((inAir) => {
        const rg = window.__rg!;
        const w = window as unknown as { __skillN: number; __skillOff?: () => void };
        w.__skillN = 0;
        w.__skillOff = rg.ctx.events.on('player:skill', () => w.__skillN++);
        if (inAir) {
          rg.inject({ jump: true, jumpPressed: true });
          rg.step(1 / 60, 1, false);
          rg.inject(null);
          rg.step(1 / 60, 14, false);
        }
      }, air);
      // The ring sparkles (tier 1: a 1.5 s window, 0.4 s in: a real reaction).
      await force('hero', { spark: 'skill', age: 0.4, tier: 1, nextIn: 999 });
      await page.keyboard.down('KeyQ');
      await page.evaluate(() => window.__rg!.step(1 / 60, 3, false));
      await page.keyboard.up('KeyQ');
      return page.evaluate(() => {
        window.__rg!.step(1 / 60, 30, false);
        const w = window as unknown as { __skillN: number; __skillOff?: () => void };
        w.__skillOff?.();
        return w.__skillN > 0;
      });
    };
    let went = await press(false);
    if (!went) went = await press(true);
    const after = await dbg('hero');
    if (!went) continue;
    fired.push(id);
    expect([id, (after.hits as number) - (before.hits as number), (after.cancelled as number) - (before.cancelled as number)]).toEqual([id, 1, 0]);
  }
  expect(fired.length).toBeGreaterThanOrEqual(3);
  await page.evaluate(async () => {
    const rg = window.__rg!;
    await rg.ctx.player.setCharacter('panda');
    rg.ctx.player.respawn();
    rg.step(1 / 60, 30, false);
  });
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
