// QA7 B: secret path stone hopping like a child: on each stone, tap jump and steer at the next stone.
const I = () => page.evaluate(() => window.__rgSecrets.info());
const res = [];
for (const k of globalThis.QA_PATHS ?? [1, 0]) {
  let p = (await I()).paths[k];
  const s0 = p.stones[0];
  await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 30, false); }, [p.start[0], p.start[1], s0[0], s0[2]]);
  await H.snap(`sp/${k}-10-start`);
  let i = 0, tries = 0, maxI = 0, resets = 0;
  while (i < p.stones.length && tries < 60) {
    tries++;
    const s = p.stones[i];
    await page.keyboard.down('Space');
    await st(4, false);
    await H.walkTo(s[0], s[2], 1.25, 0.3);
    await page.keyboard.up('Space');
    await st(20, false);
    const hp = (await H.s()).p;
    const on = Math.hypot(hp[0] - s[0], hp[2] - s[2]) < s[3] + 0.3 && Math.abs(hp[1] - (s[1] + 0.25)) < 0.9;
    if (on) { i++; maxI = Math.max(maxI, i); } else {
      // find which stone we stand on, if any
      const j = p.stones.findIndex((t) => Math.hypot(hp[0] - t[0], hp[2] - t[2]) < t[3] + 0.3 && Math.abs(hp[1] - (t[1] + 0.25)) < 0.9);
      if (j >= 0) i = j + 1; else { i = 0; resets++; }
    }
    if (tries === 20) await H.snap(`sp/${k}-11-mid`);
  }
  log(k, 'reached stone', maxI, 'of', p.stones.length, 'tries', tries, 'ground resets', resets);
  log(k, 'to pedestal', JSON.stringify(await H.walkTo(p.pedestal[0], p.pedestal[2], 3, 0.6)));
  await tap('KeyE', 60); await st(90, false);
  p = (await I()).paths[k];
  await H.snap(`sp/${k}-12-end`);
  res.push([p.id, p.claimed, maxI, tries, resets]);
  log(k, 'claimed', p.claimed, 'wallet', (await H.s()).wallet, await H.ui());
}
log(JSON.stringify(res));
