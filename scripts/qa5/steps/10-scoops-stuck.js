// Repro: walking from the plaza toward the trampoline (east-south-east) through the Scoops parlour.
await page.evaluate(() => window.__rg.setRemaining(3000));
const runs = [];
for (const [sx, sz] of [[16, 0], [17, -6], [20, 3]]) {
  await page.evaluate(([x, z]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(51 - x, -20 - z)), [sx, sz]);
  await st(30, false);
  const r = await H.walkTo(51, -20, 14, 1.5);
  runs.push({ from: [sx, sz], ...r, mode: (await H.s()).mode });
  log(await H.snap('s/stuck-' + sx + '_' + sz));
  // jump out?
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await st(40, false);
  await page.keyboard.up('Space');
  await st(60, false);
  await page.keyboard.up('KeyW');
  runs.push({ afterJump: await H.s() });
}
log(JSON.stringify(runs));
