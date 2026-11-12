import { expect, test } from '@playwright/test';
import { boot, canvasShot } from './helpers';
import { buildTerrain } from '../../src/world/terrain';
import { stoneTrails } from '../../src/world/wayfinding';
import { MAP_BADGE, MAP_BOARD, MAP_RING, boardLayout } from '../../src/world/fill/mapboard';

test.describe('ui wayfinding', () => {
  test('compass, controls card and mode strips', async ({ page }) => {
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.start();
      window.__rg!.step(1 / 60, 30, false);
      window.__rg!.step(1 / 60, 1, false);
    });

    // Compass: attraction markers only, and they move with the camera yaw.
    const markers = page.getByTestId('compass-marker');
    expect(await markers.count()).toBeGreaterThanOrEqual(5);
    const anchors = await markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.anchor));
    expect(anchors.join()).not.toMatch(/gem|key|chest|lock/i);
    const lefts = (): Promise<string[]> => markers.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.left));
    const before = await lefts();
    await page.evaluate(() => {
      const rg = window.__rg!;
      const p = rg.ctx.player.position;
      rg.teleport(p.x, p.y + 0.2, p.z, Math.PI / 2 + rg.ctx.cameraRig.yaw);
      rg.step(1 / 60, 120, false);
      rg.step(1 / 60, 1, false);
    });
    const after = await lefts();
    expect(after.join('|')).not.toBe(before.join('|'));
    expect(await page.locator('.wf-m.hl').count()).toBe(1);

    // H toggles the controls card; Esc closes it without pausing; the "?" button works too.
    const card = page.getByTestId('controls-card');
    await expect(card).not.toHaveClass(/on/);
    await page.keyboard.press('KeyH');
    await expect(card).toHaveClass(/on/);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.keyboard.press('Escape');
    await expect(card).not.toHaveClass(/on/);
    expect(await page.evaluate(() => window.__rg!.state().phase)).toBe('playing');
    await page.getByTestId('help').click();
    await expect(card).toHaveClass(/on/);
    await page.keyboard.press('KeyH');
    await expect(card).not.toHaveClass(/on/);

    // Mode strips follow player:mode.
    const strip = page.getByTestId('mode-strip');
    const root = page.locator('.rg').first();
    const emit = (mode: string, previous: string): Promise<void> =>
      page.evaluate(([m, p]) => window.__rg!.ctx.events.emit('player:mode', { mode: m as 'walk', previous: p as 'walk' }), [mode, previous]);
    await emit('driving', 'walk');
    await expect(strip).toHaveClass(/on/);
    await expect(strip).toHaveAttribute('data-kind', 'driving');
    await expect(root).toHaveAttribute('data-mode', 'driving');
    await expect(page.getByTestId('tutorial')).toBeHidden();
    await emit('external', 'driving');
    await expect(strip).toHaveAttribute('data-kind', 'skydive');
    await emit('walk', 'external');
    await expect(strip).not.toHaveClass(/on/);
    await expect(root).toHaveAttribute('data-mode', 'walk');

    // The pause menu has a Controls button that opens the same card.
    await page.evaluate(() => window.__rg!.ctx.session.pause());
    await page.evaluate(() => window.__rg!.step(1 / 60, 2, false));
    await page.getByTestId('pause-controls').click();
    await expect(page.locator('[data-screen="controls"]')).toHaveClass(/on/);
    expect(consoleErrors).toEqual([]);
  });

  // QA8 m13: the dot-signs trail ended at the back of the booth sign. Every stepping-stone trail must
  // end within 3 m of its attraction's start point (the booth's lead spot, else its start pad) with
  // a clear straight walk from the last stone to it (the live colliders: booth, pedestals, props).
  test('every stepping-stone trail ends near its start point with a clear straight walk', async ({ page }) => {
    const trails = stoneTrails(buildTerrain().roads).map((t) => ({ id: t.id.split(':')[0], name: t.id, end: t.stones[t.stones.length - 1], stones: t.stones }));
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.start();
      window.__rg!.step(1 / 60, 30, false);
    });
    const res = await page.evaluate((list) => {
      const rg = window.__rg!;
      const g = (window as unknown as { __rgGlasses: { boothPadView(id: string): { x: number; z: number } | null } }).__rgGlasses;
      const V = rg.ctx.camera.position.constructor as new (x?: number, y?: number, z?: number) => import('three').Vector3;
      return list.map((t) => {
        const lead = rg.ctx.scene.getObjectByName(`glasses:${t.id}:lead`);
        const p = lead ? lead.getWorldPosition(new V()) : g.boothPadView(t.id);
        if (!p) return { id: t.id, name: t.name, end: t.end, start: null, dist: Infinity, blocked: ['no start point'] };
        const dist = Math.hypot(p.x - t.end.x, p.z - t.end.z);
        // A hero-wide straight walk: three parallel rays at knee and chest height, each way.
        const blocked: string[] = [];
        const ux = (p.x - t.end.x) / (dist || 1);
        const uz = (p.z - t.end.z) / (dist || 1);
        for (const side of [-0.3, 0, 0.3]) {
          for (const up of [0.45, 1.1]) {
            const ax = t.end.x - uz * side;
            const az = t.end.z + ux * side;
            const bx = p.x - uz * side;
            const bz = p.z + ux * side;
            const ya = rg.ctx.world.heightAt(ax, az) + up;
            const yb = rg.ctx.world.heightAt(bx, bz) + up;
            const dir = new V(bx - ax, yb - ya, bz - az);
            const len = dir.length();
            const hit = rg.ctx.physics.raycast(new V(ax, ya, az), dir.normalize(), len);
            if (hit) blocked.push(`side ${side} up ${up}: hit at ${hit.distance.toFixed(2)} of ${len.toFixed(2)}`);
          }
        }
        // The trail itself is walkable too: stone to stone, nothing in the way.
        for (let i = 1; i < t.stones.length; i++) {
          const a = t.stones[i - 1];
          const b = t.stones[i];
          for (const up of [0.45, 1.1]) {
            const ya = rg.ctx.world.heightAt(a.x, a.z) + up;
            const yb = rg.ctx.world.heightAt(b.x, b.z) + up;
            const dir = new V(b.x - a.x, yb - ya, b.z - a.z);
            const len = dir.length();
            if (rg.ctx.physics.raycast(new V(a.x, ya, a.z), dir.normalize(), len)) blocked.push(`stone ${i - 1}→${i} up ${up}`);
          }
        }
        return { id: t.id, name: t.name, end: t.end, start: { x: p.x, z: p.z }, dist, blocked };
      });
    }, trails);
    const summary = res.map((r) => `${r.name}: end (${r.end.x.toFixed(1)}, ${r.end.z.toFixed(1)}) start ${r.start ? `(${r.start.x.toFixed(1)}, ${r.start.z.toFixed(1)})` : '-'} d ${r.dist.toFixed(2)} ${r.blocked.join('; ')}`).join('\n');
    console.log(summary);
    for (const r of res) {
      expect(r.dist, summary).toBeLessThanOrEqual(3);
      expect(r.blocked, summary).toEqual([]);
    }
    expect(res.map((r) => r.id)).toContain('dotsigns');
    expect(consoleErrors).toEqual([]);
  });

  // QA8 m6: the unit test (tests/world/mapboard.test.ts) said 23–27 px, QA saw ~15 px and the top
  // row under the compass bar. Measured here on the real screen: the live spawn camera after PLAY,
  // the HUD on, at 640×360. Every badge (its cream ring) is big enough and clear of every HUD piece.
  test('map board from the spawn camera: badges big enough and clear of the HUD (640×360)', async ({ page }) => {
    test.setTimeout(600_000);
    const lay = boardLayout(MAP_BOARD.x, MAP_BOARD.z);
    const badges = lay.icons.map((a) => ({ name: a.anchor, u: a.u, v: a.v }));
    const { consoleErrors } = await boot(page);
    await page.evaluate(() => {
      window.__rg!.freeze(true);
      window.__rg!.step(1 / 60, 1, true);
    });
    await page.getByTestId('play').click();
    await page.evaluate(() => window.__rg!.step(1 / 60, 90, true));
    const res = await page.evaluate(
      ({ badges, yaw, yc, bx, bz, half, ring }) => {
        const rg = window.__rg!;
        const cam = rg.ctx.camera;
        cam.updateMatrixWorld(true);
        const V = cam.position.constructor as new (x?: number, y?: number, z?: number) => import('three').Vector3;
        const W = rg.ctx.canvas.clientWidth;
        const H = rg.ctx.canvas.clientHeight;
        const ground = rg.ctx.world.heightAt(bx, bz);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const px = (u: number, v: number): { x: number; y: number } => {
          const n = new V(bx + rx * u, ground + yc + v, bz + rz * u).project(cam);
          return { x: ((n.x + 1) / 2) * W, y: ((1 - n.y) / 2) * H };
        };
        const host = rg.ctx.uiRoot.getBoundingClientRect();
        // Every visible HUD piece (the compass bar and its stamp chip included), not the full-screen
        // wrappers, Pip's bubble or the world prompts.
        const hud = [...rg.ctx.uiRoot.querySelectorAll<HTMLElement>('[data-testid]')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const id = e.dataset.testid ?? '';
            if (/^(pip-bubble|pip-callout|prompt|world-)/.test(id) || e.closest('.screen')) return false;
            const cs = getComputedStyle(e);
            return r.width > 2 && r.height > 2 && r.width < W * 0.9 && r.height < H * 0.9 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
          })
          .map((e) => {
            const r = e.getBoundingClientRect();
            return { id: e.dataset.testid ?? '', x0: r.left - host.left, y0: r.top - host.top, x1: r.right - host.left, y1: r.bottom - host.top };
          });
        const out = badges.map((b) => {
          const top = px(b.u, b.v + half);
          const bottom = px(b.u, b.v - half);
          const l = px(b.u - ring, b.v);
          const r = px(b.u + ring, b.v);
          const box = { x0: Math.min(l.x, r.x), x1: Math.max(l.x, r.x), y0: px(b.u, b.v + ring).y, y1: px(b.u, b.v - ring).y };
          const under = hud.filter((h) => box.x0 < h.x1 && box.x1 > h.x0 && box.y0 < h.y1 && box.y1 > h.y0).map((h) => h.id);
          return { name: b.name, tall: bottom.y - top.y, box, under };
        });
        return { cam: { pos: cam.position.toArray(), fov: cam.fov, aspect: cam.aspect, zoom: cam.zoom }, W, H, hero: rg.state().playerPosition, out, hud };
      },
      { badges, yaw: lay.yaw, yc: lay.yc, bx: MAP_BOARD.x, bz: MAP_BOARD.z, half: MAP_BADGE / 2, ring: MAP_RING + 0.04 },
    );
    const summary = `${JSON.stringify(res.cam)} hero ${res.hero.map((v) => v.toFixed(2))}\n` + res.out.map((o) => `${o.name} ${o.tall.toFixed(1)} px  box ${[o.box.x0, o.box.y0, o.box.x1, o.box.y1].map((v) => v.toFixed(0))} ${o.under.join(',')}`).join('\n');
    const hudList = JSON.stringify(res.hud.map((h) => [h.id, Math.round(h.x0), Math.round(h.y0), Math.round(h.x1), Math.round(h.y1)]));
    for (const o of res.out) {
      expect(o.tall, `${summary}\n${hudList}`).toBeGreaterThanOrEqual(20);
      expect(o.under, `${summary}\n${hudList}`).toEqual([]);
      expect(o.box.x0 >= 0 && o.box.x1 <= res.W && o.box.y0 >= 0 && o.box.y1 <= res.H, summary).toBe(true);
    }

    // Up close (QA8 m6: the hero covered the bottom-row badges; no layout clears every hero and hat):
    // the hero 4.5 m in front of the board, facing it, still. The board reading view (camera-read.ts)
    // eases the camera up to look over the hero's head. Frog, panda and rex, bare and in antlers and
    // a sombrero, 8 frozen frames across 20 s of idle each: the same frame with the hero hidden
    // changes no badge (≤ 5 px in its ring box), and every badge is ≥ 20 px tall and clear of the HUD.
    const looks: [string, string | null][] = [];
    for (const hero of ['frog', 'panda', 'rex']) for (const hat of [null, 'hat-antlers', 'hat-sombrero']) looks.push([hero, hat]);
    const fails: string[] = [];
    for (const [hero, hat] of looks) {
      const ok = await page.evaluate(
        async ({ hero, hat, yaw, bx, bz }) => {
          const rg = window.__rg!;
          const ctx = rg.ctx;
          await ctx.player.setCharacter(hero as 'frog');
          if (hat) {
            ctx.profile.unlock(hat, 'shop');
            ctx.economy.equip(ctx.economy.item(hat)!.slot, hat);
          } else ctx.economy.equip('head', null);
          const hx = bx + Math.sin(yaw) * 4.5;
          const hz = bz + Math.cos(yaw) * 4.5;
          rg.teleport(hx, rg.ctx.world.heightAt(hx, hz) + 0.2, hz, Math.atan2(bx - hx, bz - hz));
          rg.step(1 / 60, 120, false);
          const st = window.__rgCamera!.state();
          return { reading: st.reading, active: st.readingActive };
        },
        { hero, hat, yaw: lay.yaw, bx: MAP_BOARD.x, bz: MAP_BOARD.z },
      );
      expect(ok.active && ok.reading === 1, `${hero} ${hat}: reading view ${JSON.stringify(ok)}`).toBe(true);
      for (let f = 0; f < 8; f++) {
        const frame = await page.evaluate(
          ({ badges, yaw, yc, bx, bz, ring, half, first }) => {
            const rg = window.__rg!;
            if (!first) rg.step(1 / 60, 150, false);
            rg.render();
            const cam = rg.ctx.camera;
            cam.updateMatrixWorld(true);
            const V = cam.position.constructor as new (x?: number, y?: number, z?: number) => import('three').Vector3;
            const W = rg.ctx.canvas.width;
            const H = rg.ctx.canvas.height;
            const CW = rg.ctx.canvas.clientWidth;
            const CH = rg.ctx.canvas.clientHeight;
            const g = rg.ctx.world.heightAt(bx, bz);
            const px = (u: number, v: number, w: number, h: number): { x: number; y: number } => {
              const n = new V(bx + Math.cos(yaw) * u, g + yc + v, bz - Math.sin(yaw) * u).project(cam);
              return { x: ((n.x + 1) / 2) * w, y: ((1 - n.y) / 2) * h };
            };
            const host = rg.ctx.uiRoot.getBoundingClientRect();
            const hud = [...rg.ctx.uiRoot.querySelectorAll<HTMLElement>('[data-testid]')]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                const id = e.dataset.testid ?? '';
                if (/^(pip-bubble|pip-callout|prompt|world-)/.test(id) || e.closest('.screen')) return false;
                const cs = getComputedStyle(e);
                // Shown all the way up (a hidden activity HUD's children are not on screen).
                const shown = e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
                return shown && r.width > 2 && r.height > 2 && r.width < CW * 0.9 && r.height < CH * 0.9 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
              })
              .map((e) => {
                const r = e.getBoundingClientRect();
                return { id: e.dataset.testid ?? '', x0: r.left - host.left, y0: r.top - host.top, x1: r.right - host.left, y1: r.bottom - host.top };
              });
            const boxOf = (b: { u: number; v: number }, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } => {
              const pts = [px(b.u - ring, b.v, w, h), px(b.u + ring, b.v, w, h), px(b.u, b.v + ring, w, h), px(b.u, b.v - ring, w, h)];
              return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
            };
            return {
              W,
              H,
              out: badges.map((b) => {
                const css = boxOf(b, CW, CH);
                return {
                  name: b.name,
                  tall: px(b.u, b.v - half, CW, CH).y - px(b.u, b.v + half, CW, CH).y,
                  box: boxOf(b, W, H),
                  inView: css.x0 >= 0 && css.x1 <= CW && css.y0 >= 0 && css.y1 <= CH,
                  under: hud.filter((h) => css.x0 < h.x1 && css.x1 > h.x0 && css.y0 < h.y1 && css.y1 > h.y0).map((h) => `${h.id} [${[h.x0, h.y0, h.x1, h.y1].map(Math.round)}] badge [${[css.x0, css.y0, css.x1, css.y1].map(Math.round)}]`),
                };
              }),
            };
          },
          { badges, yaw: lay.yaw, yc: lay.yc, bx: MAP_BOARD.x, bz: MAP_BOARD.z, ring: MAP_RING + 0.04, half: MAP_BADGE / 2, first: f === 0 },
        );
        if (f === 0 && hat === 'hat-sombrero') await page.screenshot({ path: `test-results/mapboard-reading-${hero}.png` });
        const withHero = await canvasShot(page);
        await page.evaluate(() => {
          window.__rg!.ctx.player.setVisible(false);
          window.__rg!.render();
        });
        const without = await canvasShot(page);
        await page.evaluate(() => window.__rg!.ctx.player.setVisible(true));
        for (const o of frame.out) {
          let changed = 0;
          const x0 = Math.max(0, Math.floor(o.box.x0));
          const x1 = Math.min(frame.W - 1, Math.ceil(o.box.x1));
          const y0 = Math.max(0, Math.floor(o.box.y0));
          const y1 = Math.min(frame.H - 1, Math.ceil(o.box.y1));
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const i = (y * withHero.width + x) * 4;
              if (Math.abs(withHero.data[i] - without.data[i]) + Math.abs(withHero.data[i + 1] - without.data[i + 1]) > 24) changed++;
            }
          }
          const tag = `${hero} ${hat ?? 'bare'} frame ${f} ${o.name}`;
          if (changed > 5) fails.push(`${tag}: ${changed} px changed`);
          if (o.tall < 20) fails.push(`${tag}: ${o.tall.toFixed(1)} px tall`);
          if (!o.inView || o.under.length) fails.push(`${tag}: off screen or under ${o.under.join(',')}`);
        }
      }
    }
    expect(fails).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
