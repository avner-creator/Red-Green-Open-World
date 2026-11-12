// QA6 A M5: village vault, walk (real WASD) from each pad to each other pad (12 ordered pairs);
// count pad presses ('click' sounds) during each walk. Expected: exactly 1 (the target) per walk.
const info = () => page.evaluate(() => window.__rgSecrets.info());
const d = (await info()).doors.find((x) => /village/.test(x.id)) ?? (await info()).doors[0];
log('door', d.id, 'open', d.open, 'pads', JSON.stringify(d.pads.map((p) => p.map((v) => +v.toFixed(1)))));
await page.evaluate(() => {
  if (!window.__qaPress) {
    window.__qaPress = [];
    window.__rg.ctx.events.on('glasses:result', (e) => { if (e.mechanic === 'vaultDoor') window.__qaPress.push(e.hit); });
  }
});
const clicks = () => page.evaluate(() => window.__qaPress.length);
const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
const res = [];
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 4; j++) {
    if (i === j) continue;
    // teleport onto pad i, wait to settle (its press counts, ignore)
    await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, yaw), [d.pads[i][0], d.pads[i][1], Math.atan2(d.pads[j][0] - d.pads[i][0], d.pads[j][1] - d.pads[i][1])]);
    await st(60, false);
    const c0 = await clicks();
    const w = await H.walkTo(d.pads[j][0], d.pads[j][1], 6, 0.3);
    await st(40, false);
    const c1 = await clicks();
    res.push([`${i}->${j}`, c1 - c0, w.d]);
  }
}
log('presses per walk (want 1)', JSON.stringify(res));
log('bad', JSON.stringify(res.filter((r) => r[1] !== 1)));
// The real sequence once, from 9 m out
const seq = d.sequence.slice();
await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.5, z, yaw), [d.x + fx * 9, d.z + fz * 9, d.yaw + Math.PI]);
await st(60, false);
const before = (await info()).doors.find((x) => x.id === d.id);
for (const p of seq) await H.walkTo(d.pads[p][0], d.pads[p][1], 8, 0.3), await st(40, false);
for (let k = 0; k < 4; k++) await st(60, false);
const after = (await info()).doors.find((x) => x.id === d.id);
log('sequence', JSON.stringify(seq), 'open before', before.open, 'after', after.open, 'misses', after.misses);
await H.snap('v6/03-open');
