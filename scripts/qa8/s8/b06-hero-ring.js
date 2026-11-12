// QA8 B: hero weave ring: wander the plaza 90 s (W + turns), fire the power (C) when the ring sparkles; channel check.
for (let i = 0; i < 4 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const D = () => page.evaluate(() => window.__rgGlasses.weave.debug('hero'));
await page.evaluate(() => { const rg = window.__rg; rg.teleport(0, rg.ctx.world.heightAt(0, -5) + 0.5, -5, 0); rg.step(1 / 60, 30, false); });
const d0 = await D();
const tl = [];
let sep = false;
let fired = 0;
let lastSpark = null;
for (let i = 0; i < 360; i++) {
  const keys = i % 40 < 28 ? ['KeyW'] : ['KeyW', i % 80 < 40 ? 'KeyA' : 'KeyD'];
  for (const k of keys) await page.keyboard.down(k);
  await st(15, false);
  for (const k of keys) await page.keyboard.up(k);
  const d = await D();
  const sk = d.spark ? JSON.stringify(d.spark) : null;
  if (sk !== lastSpark && !(d.spark && lastSpark)) { globalThis.__heroFired = null; }
  if (sk !== lastSpark) { tl.push(`${(i / 4).toFixed(1)} spark=${sk} ring=${!!d.ring} num=${d.number?.text ?? ''} readyFor=${d.readyFor}`); lastSpark = sk; }
  if (d.ring && !sep) { sep = true; await H.snap('hero8/ring'); tl.push('sep ' + JSON.stringify(await H.sep('hero8/ring-sep'))); }
  if (d.spark && d.spark.kind === "skill" && !globalThis.__heroFired?.[d.spark.age > 0.3 ? 1 : 0] && d.ring) { await tap("KeyQ", 2); fired++; globalThis.__heroFired = [1, 1]; tl.push(`${(i / 4).toFixed(1)} fired C`); }
  if (i > 0 && i % 60 === 0 && !d.spark) { await tap("KeyQ", 2); }
}
const d = await D();
log(tl.join('\n'));
log('hits', d.hits - d0.hits, 'misses', d.misses - d0.misses, 'fired', fired, 'last', JSON.stringify(d.lastResult), 'opened', d.opened, 'cancelled', d.cancelled, 'spoiled', d.spoiled);
