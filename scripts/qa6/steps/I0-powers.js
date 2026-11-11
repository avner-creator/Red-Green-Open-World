// Use three different super powers: via pause menu > Hero, pick hero + power, GO, then use the power with real keys.
const tapK = async (k, f = 3) => { await page.keyboard.down(k); await st(f, false); await page.keyboard.up(k); };
if ((await H.s()).mode !== 'walk') { await tapK('KeyR'); await st(90, false); }
await page.evaluate(() => window.__rg.teleport(0, 18.5, 9, 1.75));
await st(30, false);
const trials = [['bee', 'glide'], ['robot', 'doubleJump'], ['frog', 'bounceBall'], ['pup', 'dash']];
for (const [hero, power] of trials) {
  await tapK('Escape');
  await st(10);
  if ((await H.s()).phase !== 'paused') { log('no pause menu'); }
  await page.getByTestId('pause-hero').click({ force: true }).catch(async () => { await page.locator('[data-screen="pause"] button[aria-label="Hero"]').click({ force: true }); });
  await st(20);
  await page.getByTestId('csel-' + hero).click({ force: true });
  await st(10);
  const ok = await page.getByTestId('csel-power-' + power).count();
  if (ok) { await page.getByTestId('csel-power-' + power).click({ force: true }); await st(10); }
  const state = await page.evaluate((p) => document.querySelector(`[data-testid="csel-power-${p}"]`)?.dataset.state, power);
  await page.getByTestId('csel-go').click({ force: true }).catch(() => {});
  await st(30);
  const s0 = await H.s();
  log(hero, power, 'tile state', state, 'phase', s0.phase, 'char', await page.evaluate(() => window.__rg.ctx.player.characterId));
  // use: jump, then press/hold Q in the air; record max height and horizontal distance
  const p0 = s0.p;
  let maxY = p0[1];
  await page.keyboard.down('KeyW');
  await tapK('Space', 4);
  await st(12, false);
  await page.keyboard.down('KeyQ');
  for (let i = 0; i < 20; i++) {
    await st(6, false);
    if (i === 3 && power === 'doubleJump') { await page.keyboard.up('KeyQ'); await tapK('Space', 3); }
    if (i === 3 && power === 'dash') await page.keyboard.up('KeyQ');
    const p = (await H.s()).p;
    maxY = Math.max(maxY, p[1]);
    if (i === 6) await H.snap('pw/' + power);
  }
  await page.keyboard.up('KeyQ');
  await page.keyboard.up('KeyW');
  await st(60, false);
  const p1 = (await H.s()).p;
  log(' -> maxRise', (maxY - p0[1]).toFixed(1), 'm, moved', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(1), 'm', 'chip', await page.evaluate(() => document.querySelector('[data-testid="skill-chip"]')?.className));
  await page.evaluate(() => window.__rg.teleport(0, 18.5, 9, 1.75));
  await st(30, false);
}
