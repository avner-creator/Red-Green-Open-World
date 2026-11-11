/**
 * Every ride that takes the player lets go cleanly: enter it, press R, and the hero is back on foot
 * with the default camera and no sound loop left running. Also: a ride never takes the player from
 * another ride (E on a second ride while riding does nothing). One page for the whole table.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

// Not serial: one ride failing must not hide the others (each test enters from walk mode).
test.describe.configure({ mode: 'default' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
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

/** How each ride is entered (in the page). Returns a short note for the failure message. */
type Enter = { kind: 'target'; id: string } | { kind: 'vehicle'; vkind: 'car' | 'horse' } | { kind: 'hook'; call: string };

const RIDES: { name: string; enter: Enter }[] = [
  { name: 'buggy', enter: { kind: 'vehicle', vkind: 'car' } },
  { name: 'horse', enter: { kind: 'vehicle', vkind: 'horse' } },
  { name: 'balloon skydive', enter: { kind: 'target', id: 'balloon' } },
  { name: 'rocket flight', enter: { kind: 'hook', call: 'rocket' } },
  { name: 'bungee', enter: { kind: 'target', id: 'bungee-winch' } },
  { name: 'stunt plane', enter: { kind: 'target', id: 'sky-plane' } },
  { name: 'dragon', enter: { kind: 'target', id: 'sky-dragon' } },
  { name: 'bubble ball', enter: { kind: 'hook', call: 'bubbleBall' } },
  { name: 'dino sumo', enter: { kind: 'hook', call: 'dinoSumo' } },
  { name: 'foam course', enter: { kind: 'hook', call: 'foam' } },
  { name: 'buggy race', enter: { kind: 'hook', call: 'race' } },
  { name: 'carnival', enter: { kind: 'hook', call: 'carnival' } },
  { name: 'scoops', enter: { kind: 'target', id: 'scoops-counter' } },
];

async function enter(p: Page, e: Enter): Promise<{ mode: string; vehicle: boolean }> {
  return p.evaluate((e) => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const w = window as unknown as Record<string, { start?: (a?: string) => unknown; launchRocket?: (i: number) => void; info?: () => { booths: { id: string; playable: boolean }[] } } | undefined>;
    const stand = (x: number, z: number, yaw = 0): void => {
      rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, yaw);
      rg.step(1 / 60, 20, false);
    };
    const pressUse = (): void => {
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
    };
    if (e.kind === 'vehicle') {
      const v = ctx.vehicles.all.find((q) => q.kind === e.vkind);
      if (v) {
        stand(v.position.x + 2.2, v.position.z + 0.5);
        pressUse();
      }
    } else if (e.kind === 'target') {
      const t = rg.interactables().find((q) => q.id === e.id);
      if (t) {
        stand(t.position[0], t.position[2]);
        pressUse();
      }
    } else if (e.call === 'rocket') {
      ctx.profile.earn(10, 'test'); // a rocket launch costs a ticket
      w.__rgThrills?.launchRocket?.(0);
    } else if (e.call === 'bubbleBall') {
      w.__rgBubbleBall?.start?.();
    } else if (e.call === 'dinoSumo') {
      w.__rgDinoSumo?.start?.();
    } else if (e.call === 'foam') {
      w.__rgFoam?.start?.();
    } else if (e.call === 'race') {
      w.__rgRace?.start?.();
    } else if (e.call === 'carnival') {
      const booth = w.__rgCarnival?.info?.().booths.find((b) => b.playable);
      if (booth) w.__rgCarnival?.start?.(booth.id);
    }
    rg.step(1 / 60, 90, false);
    return { mode: rg.state().playerMode, vehicle: !!ctx.player.vehicle };
  }, e);
}

async function pressR(p: Page): Promise<{ mode: string; vehicle: boolean; override: boolean; loops: string[]; visible: boolean }> {
  return p.evaluate(() => {
    const rg = window.__rg!;
    for (let k = 0; k < 2; k++) {
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 90, false);
    }
    // Some rides hand the player back a frame or two later; give the systems a moment.
    rg.step(1 / 60, 60, false);
    return {
      mode: rg.state().playerMode,
      vehicle: !!rg.ctx.player.vehicle,
      override: rg.cameraOverridden(),
      loops: rg.audioLoops(),
      visible: rg.ctx.player.object.visible,
    };
  });
}

for (const ride of RIDES) {
  test(`${ride.name}: R lets go — walk mode, default camera, no sound loop`, async () => {
    const inRide = await enter(page, ride.enter);
    expect.soft(inRide.mode !== 'walk' || inRide.vehicle, `${ride.name} took the player`).toBe(true);
    const out = await pressR(page);
    expect.soft(out.vehicle, `${ride.name}: out of the vehicle`).toBe(false);
    expect.soft(out.mode, `${ride.name}: walk mode`).toBe('walk');
    expect.soft(out.override, `${ride.name}: camera override released`).toBe(false);
    expect.soft(out.loops, `${ride.name}: no sound loop left on`).toEqual([]);
    expect.soft(out.visible, `${ride.name}: hero visible`).toBe(true);
  });
}

test('a ride never takes the player from another ride', async () => {
  const res = await page.evaluate(() => {
    const rg = window.__rg!;
    const w = window as unknown as Record<string, { start?: () => unknown; phase?: () => string } | undefined>;
    // On the foam course, then try to start Bubble Ball and the race.
    w.__rgFoam?.start?.();
    rg.step(1 / 60, 60, false);
    const before = rg.state().playerMode;
    w.__rgBubbleBall?.start?.();
    w.__rgRace?.start?.();
    rg.step(1 / 60, 30, false);
    const out = {
      before,
      foam: w.__rgFoam?.phase?.() ?? 'none',
      ball: w.__rgBubbleBall?.phase?.() ?? 'none',
      vehicle: !!rg.ctx.player.vehicle,
    };
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 120, false);
    return out;
  });
  expect(res.before).toBe('external');
  expect(res.foam).not.toBe('idle');
  expect(res.ball).toBe('idle');
  expect(res.vehicle).toBe(false);
});

test('no console errors', () => {
  expect(consoleErrors).toEqual([]);
});
