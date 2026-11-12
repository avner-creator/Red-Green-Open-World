// QA9: the map board reading view as a child meets it. Hero (frog/panda/rex) in the magic top hat
// walks up to the board with W from 13 m out, stops; then mouse-look; then a sprint past and a buggy
// drive past. Logs camera reading weight. Usage: RG_PORT=4422 QA_W=960 QA_H=540 node scripts/qa9/mapboard9.mjs [heroes]
import { open } from './lib.mjs';

const heroes = (process.argv[2] ?? 'frog,panda,rex').split(',');
const W = Number(process.env.QA_W ?? 960);
const H = Number(process.env.QA_H ?? 540);
const { page, shot, close, errors } = await open(`board9-${W}`, { query: '&quality=low&freeze=1', width: W, height: H });
const cam = () => page.evaluate(() => { const s = window.__rgCamera.state(); const p = window.__rg.state().playerPosition; return { r: +s.reading.toFixed(2), a: s.readingActive, d: +s.distance.toFixed(1), mode: window.__rg.state().playerMode, p: p.map((v) => +v.toFixed(1)) }; });
const stepN = (n, r = false) => page.evaluate(([n, r]) => window.__rg.step(1 / 60, n, r), [n, r]);
try {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
  await page.getByTestId('play').click();
  await page.evaluate(() => { window.__rg.step(1 / 60, 90, false); window.__rg.setRemaining(3000); });
  const b = await page.evaluate(() => window.__rgCamera.state().spots.find((s) => s.id === 'mapboard'));
  console.log('board', JSON.stringify(b));
  const put = (along, lat, face) => page.evaluate(([b, along, lat, face]) => {
    const rg = window.__rg;
    const x = b.x + b.nx * along + b.nz * lat;
    const z = b.z + b.nz * along - b.nx * lat;
    const yaw = face === 'board' ? Math.atan2(b.x - x, b.z - z) : face;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, yaw);
    rg.step(1 / 60, 90, false);
  }, [b, along, lat, face]);
  for (const hero of heroes) {
    await page.evaluate(async (h) => {
      const c = window.__rg.ctx;
      await c.player.setCharacter(h);
      c.profile.unlock('hat-tophat', 'shop');
      c.economy.equip(c.economy.item('hat-tophat').slot, 'hat-tophat');
    }, hero);
    // 1. walk up with W from 13 m
    await put(13, 0, 'board');
    await shot(`${hero}-0-far`);
    await page.keyboard.down('KeyW');
    const walk = [];
    for (let i = 0; i < 60; i++) {
      await stepN(10);
      const c = await cam();
      const along = await page.evaluate((b) => { const p = window.__rg.state().playerPosition; return (p[0] - b.x) * b.nx + (p[2] - b.z) * b.nz; }, b);
      walk.push([+(i / 6).toFixed(1), +along.toFixed(1), c.r]);
      if (along < 4.2) break;
    }
    await page.keyboard.up('KeyW');
    const settle = [];
    for (let i = 0; i < 8; i++) { await stepN(10); settle.push((await cam()).r); }
    console.log(hero, 'walk', JSON.stringify(walk), 'settle', JSON.stringify(settle));
    await stepN(1, true);
    await shot(`${hero}-1-read`, { channels: true });
    // 2. mouse look cancels
    await page.mouse.click(W / 2, H / 2);
    await stepN(5);
    const locked = await page.evaluate(() => !!document.pointerLockElement);
    for (let k = 0; k < 6; k++) { await page.mouse.move(W / 2 + 30 * (k + 1), H / 2); await stepN(2); }
    const look = [];
    for (let i = 0; i < 6; i++) { await stepN(10); look.push((await cam()).r); }
    console.log(hero, 'pointerLock', locked, 'after look', JSON.stringify(look));
    await stepN(1, true);
    await shot(`${hero}-2-looked`);
    if (locked) await page.evaluate(() => document.exitPointerLock());
    await stepN(30);
    console.log(hero, 'paused?', await page.evaluate(() => window.__rg.state().phase));
    if ((await page.evaluate(() => window.__rg.state().phase)) === 'paused') { await page.keyboard.press('Escape'); await stepN(10); }
  }
  // 3. sprint past across the zone (4 m out, lateral)
  await put(4.5, -9, Math.atan2(b.nz, -b.nx));
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  const run = [];
  for (let i = 0; i < 24; i++) { await stepN(10); const c = await cam(); run.push([c.r, c.p[0], c.p[2]]); }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  console.log('sprint past max', Math.max(...run.map((x) => x[0])), JSON.stringify(run.map((x) => x[0])));
  // 3b. walk past (no shift)
  await put(4.5, -9, Math.atan2(b.nz, -b.nx));
  await page.keyboard.down('KeyW');
  const wp = [];
  for (let i = 0; i < 40; i++) { await stepN(10); wp.push((await cam()).r); }
  await page.keyboard.up('KeyW');
  console.log('walk past max', Math.max(...wp), JSON.stringify(wp));
  await stepN(1, true);
  await shot('walkpast-end');
  // 4. drive past in the buggy
  const car = await page.evaluate(() => { const c = window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car'); return [c.position.x, c.position.z]; });
  console.log('buggy at', JSON.stringify(car));
  await page.evaluate((p) => { const rg = window.__rg; const x = p[0] + Math.sin(2.6) * 2.4; const z = p[1] + Math.cos(2.6) * 2.4; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(p[0] - x, p[1] - z)); rg.step(1 / 60, 20, false); }, car);
  await page.keyboard.press('KeyE');
  await stepN(30);
  console.log('mode', (await cam()).mode);
  await put(6, -14, Math.atan2(b.nz, -b.nx));
  console.log('after teleport in car', JSON.stringify(await cam()));
  await page.keyboard.down('KeyW');
  const dp = [];
  for (let i = 0; i < 24; i++) { await stepN(10); const c = await cam(); dp.push([c.r, c.mode, c.p[0], c.p[2]]); }
  await page.keyboard.up('KeyW');
  console.log('drive past', JSON.stringify(dp));
  await stepN(1, true);
  await shot('drivepast-end');
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
