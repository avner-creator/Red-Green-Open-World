/**
 * The six playable characters in the real game: each one swaps in, walks, jumps, fires its skill
 * with the expected motion, wears an outfit on its own head anchor and sits in the buggy.
 * Screenshots (full / R / G canvas) go to test-results/characters-ingame/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, canvasShot } from './helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/characters-ingame';
const IDS = ['robot', 'frog', 'panda', 'bee', 'flamingo', 'rex'] as const;
type Id = (typeof IDS)[number];
const SKILL_OF: Record<Id, string> = {
  robot: 'doubleJump',
  frog: 'superBounce',
  panda: 'dash',
  bee: 'glide',
  flamingo: 'doubleJump',
  rex: 'groundPound',
};

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

/** Save the last rendered frame as full / R / G. */
async function save(name: string): Promise<void> {
  if (!SHOTS) return; // human-only screenshots are opt-in (RG_SHOTS=1)
  const png = await canvasShot(page, `${OUT}/${name}-full.png`);
  writeFileSync(`${OUT}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${OUT}/${name}-G.png`, splitChannel(png, 1));
}

/** Fresh session at the spawn, settled on the ground, then switch character. */
async function fresh(id: Id): Promise<void> {
  await page.evaluate(async (id) => {
    const rg = window.__rg!;
    rg.inject(null);
    rg.start();
    rg.step(1 / 60, 10, false);
    await rg.ctx.player.setCharacter(id);
    rg.step(1 / 60, 40, false);
  }, id);
}

/** Step n frames with an input patch held, recording the player's height and vertical speed. */
async function track(n: number, inject: Record<string, number | boolean> | null, edgeFirst = false) {
  return page.evaluate(
    ({ n, inject, edgeFirst }) => {
      const rg = window.__rg!;
      const p = rg.ctx.player;
      const y: number[] = [];
      const vy: number[] = [];
      rg.inject(inject);
      for (let i = 0; i < n; i++) {
        rg.step(1 / 60, 1, false);
        if (edgeFirst && i === 0 && inject) {
          // Keep only the held parts after the first frame.
          const held: Record<string, number | boolean> = {};
          for (const [k, v] of Object.entries(inject)) if (!k.endsWith('Pressed')) held[k] = v;
          rg.inject(held);
        }
        y.push(p.position.y);
        vy.push(p.velocity.y);
      }
      return { y, vy, x: p.position.x, z: p.position.z, grounded: p.grounded, mode: p.mode };
    },
    { n, inject, edgeFirst },
  );
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20, false);
    const w = window as unknown as { __skills: string[]; __chars: string[]; __emotes: string[] };
    w.__skills = [];
    w.__chars = [];
    w.__emotes = [];
    rg.ctx.events.on('player:skill', (e) => w.__skills.push(e.id));
    rg.ctx.events.on('player:character', (e) => w.__chars.push(e.id));
    rg.ctx.events.on('player:emote', (e) => w.__emotes.push(e.id));
  });
});

test.afterAll(async () => {
  await page.close();
});

const skillsSeen = (): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __skills: string[] }).__skills.splice(0));

test('the default character is the frog and unknown ids are ignored', async () => {
  const r = await page.evaluate(async () => {
    const p = window.__rg!.ctx.player;
    const first = p.characterId;
    await p.setCharacter('unicorn');
    return { first, after: p.characterId, skill: p.skill.id, ready: p.skill.ready, boost: p.skill.bounceBoost };
  });
  expect({ ...r, boost: undefined }).toEqual({ first: 'frog', after: 'frog', skill: 'superBounce', ready: true, boost: undefined });
});

for (const id of IDS) {
  test(`${id}: swaps in, walks, jumps, emotes and fires its skill`, async () => {
    await fresh(id);
    const info = await page.evaluate((id) => {
      const rg = window.__rg!;
      const p = rg.ctx.player;
      const model = p.object.getObjectByName(`character-${id}`);
      let visibleMeshes = 0;
      model?.traverseVisible((o) => {
        if ((o as { isMesh?: boolean }).isMesh) visibleMeshes++;
      });
      const others = ['robot', 'frog', 'panda', 'bee', 'flamingo', 'rex'].filter((o) => o !== id && p.object.getObjectByName(`character-${o}`));
      rg.step(1 / 60, 1, true);
      return { cid: p.characterId, skill: p.skill.id, visibleMeshes, others, visible: p.object.visible, mode: p.mode, grounded: p.grounded };
    }, id);
    expect(info.cid).toBe(id);
    expect(info.skill).toBe(SKILL_OF[id]);
    expect(info.visible).toBe(true);
    expect(info.visibleMeshes).toBeGreaterThan(0);
    expect(info.others).toEqual([]);
    expect(info.mode).toBe('walk');
    expect(info.grounded).toBe(true);
    await save(`${id}-spawn`);

    // Walk forward.
    const start = await page.evaluate(() => window.__rg!.ctx.player.position.toArray());
    const walk = await track(40, { moveY: 1 });
    expect(Math.hypot(walk.x - start[0], walk.z - start[2])).toBeGreaterThan(3);
    await track(30, null);

    // Jump: rises over a metre and lands again.
    const y0 = await page.evaluate(() => window.__rg!.ctx.player.position.y);
    const jump = await track(80, { jump: true, jumpPressed: true }, true);
    expect(Math.max(...jump.y) - y0).toBeGreaterThan(1.1);
    expect(jump.grounded).toBe(true);
    await track(10, null);

    // Emote: plays, then moving cancels it.
    const emote = await page.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ emotePressed: true });
      rg.step(1 / 60, 20, false);
      rg.inject(null);
      return (window as unknown as { __emotes: string[] }).__emotes.splice(0);
    });
    expect(emote).toHaveLength(1);
    await skillsSeen();

    // The skill, with its expected motion.
    const skill = SKILL_OF[id];
    if (skill === 'doubleJump') {
      const single = await track(70, { jump: true, jumpPressed: true }, true);
      await track(20, null);
      const base = await page.evaluate(() => window.__rg!.ctx.player.position.y);
      const singleApex = Math.max(...single.y) - base;
      const a = await track(18, { jump: true, jumpPressed: true }, true);
      const b = await track(4, { jump: true, skill: true, skillPressed: true }, true);
      await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
      await save(`${id}-skill`);
      const c = await track(80, null);
      const doubleApex = Math.max(...a.y, ...b.y, ...c.y) - base;
      expect(doubleApex - singleApex).toBeGreaterThan(0.8);
      expect(c.grounded).toBe(true);
    } else if (skill === 'glide') {
      // From 12 m up: holding the skill keeps the fall slow; without it the fall is fast.
      const free = await page.evaluate(() => {
        const rg = window.__rg!;
        const p = rg.ctx.player;
        rg.teleport(p.position.x, p.position.y + 12, p.position.z, p.yaw);
        rg.step(1 / 60, 50, false);
        return p.velocity.y;
      });
      expect(free).toBeLessThan(-12);
      await page.evaluate(() => {
        const rg = window.__rg!;
        rg.start();
        rg.step(1 / 60, 20, false);
        const p = rg.ctx.player;
        rg.teleport(p.position.x, p.position.y + 12, p.position.z, p.yaw);
        rg.step(1 / 60, 15, false);
      });
      const g = await track(60, { skill: true, skillPressed: true, moveY: 1 }, true);
      await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
      await save(`${id}-skill`);
      expect(g.vy[g.vy.length - 1]).toBeGreaterThan(-2.7);
      expect(g.vy[g.vy.length - 1]).toBeLessThan(-2.2);
      const land = await track(300, null);
      expect(land.grounded).toBe(true);
    } else if (skill === 'dash') {
      const p0 = await page.evaluate(() => window.__rg!.ctx.player.position.toArray());
      await track(8, { skill: true, skillPressed: true }, true);
      await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
      await save(`${id}-skill`);
      const d = await track(30, null);
      expect(Math.hypot(d.x - p0[0], d.z - p0[2])).toBeGreaterThan(5);
      // Cooldown: a second press right away does nothing.
      const cd = await page.evaluate(() => window.__rg!.ctx.player.skill.cooldown);
      expect(cd).toBeGreaterThan(0.5);
    } else if (skill === 'superBounce') {
      const base = await page.evaluate(() => window.__rg!.ctx.player.position.y);
      await track(20, { skill: true, skillPressed: true }, true);
      await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
      await save(`${id}-charge`);
      await track(28, { skill: true });
      const up = await track(40, null);
      const boost = await page.evaluate(() => window.__rg!.ctx.player.skill.bounceBoost);
      await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
      await save(`${id}-skill`);
      const rest = await track(120, null);
      expect(Math.max(...up.y, ...rest.y) - base).toBeGreaterThan(8);
      expect(boost).toBe(1.25);
      expect(rest.grounded).toBe(true);
      expect(rest.mode).toBe('walk'); // soft landing, no flop
    } else if (skill === 'groundPound') {
      await page.evaluate(() => {
        const rg = window.__rg!;
        const p = rg.ctx.player;
        rg.teleport(p.position.x, p.position.y + 7, p.position.z, p.yaw);
        rg.step(1 / 60, 10, false);
      });
      const pd = await track(16, { skill: true, skillPressed: true }, true);
      await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
      await save(`${id}-skill`);
      // Down to the landing, then a few frames of the shockwave.
      const minVy = await page.evaluate(() => {
        const rg = window.__rg!;
        let m = 0;
        for (let i = 0; i < 40 && !rg.ctx.player.grounded; i++) {
          rg.step(1 / 60, 1, false);
          m = Math.min(m, rg.ctx.player.velocity.y);
        }
        rg.step(1 / 60, 7, false);
        rg.step(1 / 60, 1, true);
        return m;
      });
      await save(`${id}-pound`);
      const slam = await track(20, null);
      expect(Math.min(...pd.vy, minVy)).toBeLessThan(-25);
      expect(slam.grounded).toBe(true);
      expect(slam.mode).toBe('walk'); // shockwave, not a flop
      const boost = await page.evaluate(() => window.__rg!.ctx.player.skill.bounceBoost);
      expect([1, Infinity]).toContain(boost);
    }
    expect(await skillsSeen()).toContain(skill);
  });
}

test('skills are off while driving; the boost from a pound is read before a bounce', async () => {
  await fresh('rex');
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.player;
    rg.teleport(p.position.x, p.position.y + 5, p.position.z, p.yaw);
    rg.step(1 / 60, 8, false);
    rg.inject({ skillPressed: true, skill: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    let boostAtLanding = 1;
    for (let i = 0; i < 60; i++) {
      rg.step(1 / 60, 1, false);
      if (p.grounded) {
        boostAtLanding = p.skill.bounceBoost;
        break;
      }
    }
    rg.step(1 / 60, 40, false);
    return { boostAtLanding, later: p.skill.bounceBoost };
  });
  expect(r.boostAtLanding).toBe(Infinity);
  expect(r.later).toBe(1);
});

test('outfits follow every character (explorer hat), and everyone sits in the buggy', async () => {
  // Open the first chest the real way to get the explorer hat.
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 10, false);
  });
  await page.evaluate(async () => {
    await window.__rg!.ctx.player.setCharacter('robot');
  });
  const c = (await page.evaluate(() => window.__rgChests!.info()))[0];
  const stand = (x: number, z: number): Promise<void> =>
    page.evaluate(
      ({ x, z }) => {
        const rg = window.__rg!;
        rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, 0);
        rg.step(1 / 60, 24, false);
      },
      { x, z },
    );
  await stand(c.key[0], c.key[2]);
  const [rx, rz] = await page.evaluate(([s]) => window.__rgChests!.sidePoint(0, s), [c.keyholeSide]);
  await stand(rx, rz);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ usePressed: true, use: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 60, false);
  });
  expect(await page.evaluate(() => window.__rg!.state().outfits)).toEqual(['hat-explorer']);
  await skillsSeen();

  for (const id of IDS) {
    await page.evaluate(async (id) => {
      const rg = window.__rg!;
      const sp = rg.ctx.world.anchors.spawn;
      rg.teleport(sp.position.x, sp.position.y + 0.1, sp.position.z, sp.yaw);
      await rg.ctx.player.setCharacter(id);
      rg.step(1 / 60, 40, false);
      rg.step(1 / 60, 1, true);
    }, id);
    const hat = await page.evaluate(() => {
      const p = window.__rg!.ctx.player;
      const holder = p.object.getObjectByName('outfit-head')!;
      const worn = holder.children.filter((o) => !o.name.startsWith('skill-'));
      const v = { x: 0, y: 0, z: 0 } as { x: number; y: number; z: number };
      if (worn[0]) {
        const e = worn[0].matrixWorld.elements;
        v.x = e[12];
        v.y = e[13];
        v.z = e[14];
      }
      return { count: worn.length, above: v.y - p.position.y, horiz: Math.hypot(v.x - p.position.x, v.z - p.position.z) };
    });
    expect(hat.count, id).toBe(1);
    expect(hat.above, id).toBeGreaterThan(1.3);
    expect(hat.above, id).toBeLessThan(2.1);
    expect(hat.horiz, id).toBeLessThan(id === 'rex' ? 1.8 : 0.5);
    await save(`${id}-hat`);
  }

  for (const id of IDS) {
    await page.evaluate(async (id) => {
      const rg = window.__rg!;
      rg.start();
      rg.step(1 / 60, 10, false);
      await rg.ctx.player.setCharacter(id);
      const car = rg.ctx.vehicles.all[0];
      const q = car.object.quaternion;
      const h = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      const x = car.position.x + Math.cos(h) * 1.9;
      const z = car.position.z - Math.sin(h) * 1.9;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, h);
      rg.step(1 / 60, 20, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 60, false);
      rg.step(1 / 60, 1, true);
    }, id);
    const seat = await page.evaluate(() => ({ mode: window.__rg!.ctx.player.mode, visible: window.__rg!.ctx.player.object.visible }));
    expect(seat, id).toEqual({ mode: 'driving', visible: true });
    await save(`${id}-buggy`);
    // Skills are off while driving.
    const fired = await page.evaluate(() => {
      const rg = window.__rg!;
      rg.inject({ skillPressed: true, skill: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 5, false);
      return (window as unknown as { __skills: string[] }).__skills.splice(0);
    });
    expect(fired, id).toEqual([]);
  }
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.start();
    rg.step(1 / 60, 5, false);
  });
  const chars = await page.evaluate(() => (window as unknown as { __chars: string[] }).__chars);
  expect(new Set(chars)).toEqual(new Set(IDS));
  expect(consoleErrors).toEqual([]);
});
