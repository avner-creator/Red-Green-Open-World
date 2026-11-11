// QA4b: living island. Walk/sprint into sheep, chickens, townsfolk, a bird flock; watch reactions and pass-through.
import { open } from './lib.mjs';

const g = await open('life');
const { page, shot, step, st, pos, release, walkTo, tp, setKeys, keysToward } = g;
const inst = (name) => page.evaluate((name) => {
  const m = window.__rgLife.root.getObjectByName(`life-${name}`);
  if (!m) return [];
  const out = []; const M = new m.matrix.constructor(); const v = new m.position.constructor();
  for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, M); v.setFromMatrixPosition(M); m.localToWorld(v); out.push([v.x, v.y, v.z]); }
  return out;
}, name);
/** Chase a moving target (getter) for `s` seconds with held keys; return min horizontal distance. */
async function chase(label, get, { s = 5, sprint = false } = {}) {
  let minD = 99;
  for (let t = 0; t < s * 60; t += 6) {
    const tgt = await get(); const p = await pos();
    if (!tgt) break;
    const d = Math.hypot(tgt[0] - p[0], tgt[2] - p[2]);
    minD = Math.min(minD, d);
    const k = await keysToward(tgt[0] - p[0], tgt[2] - p[2]);
    if (sprint) k.push('ShiftLeft');
    await setKeys(k);
    await step(6);
  }
  await release();
  console.log(`${label}: min distance ${minD.toFixed(2)} m`);
  return minD;
}
try {
  await page.evaluate(() => window.__rgLife.loadTownsfolk());
  await step(120);
  for (let k = 0; k < 30 && !(await page.evaluate(() => window.__rgLife.townsfolkReady)); k++) await step(30);
  const folk = await page.evaluate(() => window.__rgLife.townsfolk);
  console.log('townsfolk', JSON.stringify(folk));
  // Townsfolk: walk into each from 8 m.
  for (const f of folk) {
    await tp(f.x + 8, f.z + 1, -Math.PI / 2);
    await step(30);
    const d = await chase(`folk ${f.id} walk`, async () => [f.x, 0, f.z], { s: 4 });
    const after = (await page.evaluate(() => window.__rgLife.townsfolk)).find((q) => q.id === f.id);
    console.log(`  folk ${f.id} state=${after.state} visible=${after.visible}`);
    await shot(`folk-${f.id}`);
    await step(150); // stand idle near: should point
    const after2 = (await page.evaluate(() => window.__rgLife.townsfolk)).find((q) => q.id === f.id);
    console.log(`  folk ${f.id} after idle 2.5 s: state=${after2.state} pointAt=${after2.pointAt}`);
    if (d < 0.3) console.log(`  !! possible pass-through ${f.id}`);
    if (f === folk[0]) await shot(`folk-${f.id}-idle`);
  }
  // Sheep: chase each for 5 s sprinting.
  const sheep0 = await inst('sheep');
  console.log('sheep', sheep0.length, JSON.stringify(sheep0.map((p) => p.map((v) => +v.toFixed(1)))));
  for (let i = 0; i < Math.min(3, sheep0.length); i++) {
    const s = sheep0[i];
    await tp(s[0] + 7, s[2], -Math.PI / 2);
    await chase(`sheep ${i} sprint`, async () => (await inst('sheep'))[i], { s: 5, sprint: true });
    await shot(`sheep-${i}`);
  }
  console.log('hops', JSON.stringify((await page.evaluate(() => window.__rgLife.critters)).hops));
  const ch = await inst('chickens');
  console.log('chickens', JSON.stringify(ch.map((p) => p.map((v) => +v.toFixed(1)))));
  await tp(ch[0][0] + 8, ch[0][2], -Math.PI / 2);
  await chase('chicken 0 walk', async () => (await inst('chickens'))[0], { s: 5 });
  await shot('chicken');
  await chase('chicken 1 sprint', async () => (await inst('chickens'))[1], { s: 5, sprint: true });
  console.log('hops', JSON.stringify((await page.evaluate(() => window.__rgLife.critters)).hops));
  // Plaza flock.
  const fl = (await page.evaluate(() => window.__rgLife.critters)).flocks[0];
  console.log('flock0 before', JSON.stringify(fl));
  await tp(fl.x + 12, fl.z, -Math.PI / 2);
  await step(60);
  await shot('flock-before');
  await walkTo(fl.x, fl.z, { maxS: 4 });
  await step(20);
  await shot('flock-scatter');
  console.log('flock0 after', JSON.stringify((await page.evaluate(() => window.__rgLife.critters)).flocks[0]));
  await step(400);
  console.log('flock0 4 s later', JSON.stringify((await page.evaluate(() => window.__rgLife.critters)).flocks[0]));
  console.log(await st());
} finally {
  await g.close();
}
