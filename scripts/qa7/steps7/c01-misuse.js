// QA7 C: misuse. (1) Silly round: hold W through 3-2-1; walk away 40 m mid-round. (2) Odd-one-out: walk away
// mid-round. (3) Wardrobe (I) and pause (Esc) mid-activity in silly, race, foam, oddone: check phase/state
// after closing. (4) spam E x20 at Scoops counter, vault door, chest.
const out = [];
const wardrobePause = async (tag) => {
  await tap('KeyI', 20);
  const wOpen = await page.evaluate(() => !!document.querySelector('[data-testid="wardrobe"]')?.offsetParent);
  await H.snap(`mis/${tag}-wardrobe`);
  await tap('Escape', 20);
  const after1 = (await H.s()).phase;
  const wClosed = !(await page.evaluate(() => !!document.querySelector('[data-testid="wardrobe"]')?.offsetParent));
  if (after1 === 'paused') await tap('Escape', 20);
  await tap('Escape', 20);
  const p2 = (await H.s()).phase;
  await H.snap(`mis/${tag}-pause`);
  await tap('Escape', 20);
  const p3 = (await H.s()).phase;
  return { wOpen, wClosed, afterEsc: after1, pausedByEsc: p2, afterEsc2: p3, mode: (await H.s()).mode };
};
// (1) silly
{
  const S = () => page.evaluate(() => window.__rgSilly.round());
  for (let i = 0; i < 20 && !['idle', 'done'].includes((await S()).phase); i++) await st(60, false);
  await st(60 * 8, false);
  const pad = await page.evaluate(() => window.__rgSilly.startPad());
  await H.near(pad[0], pad[2], 8, 0.3);
  await H.walkTo(pad[0], pad[2], 8, 0.5);
  await page.keyboard.down('KeyW');
  const tl = [];
  for (let i = 0; i < 10; i++) { await st(30, false); const r = await S(); tl.push(`${i / 2}:${r.phase}:${(await H.s()).p.map((v) => v.toFixed(0)).join(',')}`); }
  await page.keyboard.up('KeyW');
  out.push(['silly hold W', tl.join(' ')]);
  out.push(['silly wardrobe/pause', JSON.stringify(await wardrobePause('silly'))]);
  out.push(['silly after', JSON.stringify(await S())]);
  // walk away 40 m
  const hp = (await H.s()).p;
  out.push(['silly walk away', JSON.stringify(await H.walkTo(hp[0] - 40, hp[2] - 10, 12, 1, true))]);
  for (let i = 0; i < 12; i++) await st(60, false);
  out.push(['silly after walk-away', JSON.stringify(await S()), await H.ui()]);
  await H.snap('mis/silly-walkaway');
}
// (2) oddone walk away
{
  const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
  await G('goto', 'oddone'); await st(30, false);
  const d = await G('debug', 'oddone');
  const pad = Array.isArray(d.pad) ? { x: d.pad[0], z: d.pad[2] } : d.pad;
  await H.walkTo(pad.x, pad.z, 12, 0.5);
  await tap('KeyE', 10);
  for (let i = 0; i < 8; i++) await st(30, false);
  out.push(['oddone started', (await G('boothDebug', 'oddone'))?.phase]);
  out.push(['oddone wardrobe/pause', JSON.stringify(await wardrobePause('oddone'))]);
  out.push(['oddone walk away', JSON.stringify(await H.walkTo(pad.x + 40, pad.z, 12, 1, true))]);
  const tl = [];
  for (let i = 0; i < 20; i++) { await st(60, false); tl.push((await G('boothDebug', 'oddone'))?.phase); }
  out.push(['oddone after', tl.join(',')]);
  await H.snap('mis/oddone-walkaway');
}
// (4) spam E
{
  const i0 = await page.evaluate(() => window.__rgScoops.info());
  await page.evaluate(([x, z]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.4, z); rg.step(1 / 60, 30, false); }, [i0.customer[0], i0.customer[2]]);
  for (let i = 0; i < 20; i++) await tap('KeyE', 3);
  await st(60, false);
  const inf = await page.evaluate(() => window.__rgScoops.info());
  out.push(['scoops spam E', inf.phase, inf.build?.stage, JSON.stringify(inf.build?.scoops ?? null), (await H.s()).wallet]);
  await H.snap('mis/scoops-spamE');
  out.push(['scoops wardrobe/pause', JSON.stringify(await wardrobePause('scoops'))]);
  for (let i = 0; i < 4 && (await page.evaluate(() => window.__rgScoops.info())).phase !== 'idle'; i++) await tap('KeyR', 60);
  out.push(['scoops left', (await page.evaluate(() => window.__rgScoops.info())).phase]);
}
log(out.map((x) => x.join(' | ')).join('\n'), '\nerrors', JSON.stringify(errors.slice(-5)));
