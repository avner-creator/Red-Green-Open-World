// Gear Shack kiosk (14,2): walk up, E, look, buy something; then the garage workshop tool cart: E, upgrade.
if ((await H.s()).phase === 'paused') { await page.getByTestId('resume').click(); await st(20); }
await page.keyboard.press('KeyR');
await st(60);
log('after R', await H.s());
const ia0 = await page.evaluate(() => window.__rg.interactables().map((i) => i.id));
log('interactables', ia0);
await H.near(14, 2, 9, -1.9);
log('prompt target', await page.evaluate(() => window.__rg.interactables().find((i) => i.id === 'gearShack')));
log('walk', await H.walkTo(10.5, 2.8, 10, 1.0));
log('ui', await H.ui());
await H.snap('g/00-kiosk-approach');
await page.keyboard.press('KeyE');
await st(30);
log('after E', await H.s(), await page.evaluate(() => document.querySelector('.screen.on, [data-screen].on')?.dataset.screen ?? document.querySelector('[data-testid="wardrobe"]')?.className));
await H.snap('g/01-kiosk-open');
const cards = await page.evaluate(() => [...document.querySelectorAll('[data-testid="shop-card"]')].map((c) => (c.dataset.item ?? '') + ':' + c.className.replace(/b card /, '') + ':' + c.textContent.trim().slice(0, 12)));
log('cards', cards.length, cards.slice(0, 20));
// buy the first affordable item
const buy = await page.evaluate(() => { const c = [...document.querySelectorAll('[data-testid="shop-card"]')].find((c) => /s-buy|s-afford|s-can/.test(c.className)); return c?.dataset.item ?? null; });
log('affordable', buy);
if (buy) {
  await page.locator('[data-testid="shop-card"][data-item="' + buy + '"]').click();
  await st(20);
  await H.snap('g/02-tried');
  const b = page.getByTestId('wardrobe-buy');
  if (await b.count()) { await b.first().click(); await st(40); }
  await H.snap('g/03-bought');
  log('owns', buy, await page.evaluate((id) => window.__rg.ctx.profile.owns(id), buy), 'wallet', (await H.s()).wallet);
}
await page.keyboard.press('Escape');
await st(30);
log('phase after Esc', await H.s());
await H.snap('g/04-closed');
