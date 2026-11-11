// In the open shop: buy the tried item (force click: the Buy button pulses), wear it, close with Esc.
await H.snap('g/02-tried');
await page.getByTestId('wardrobe-buy').first().click({ force: true });
await page.waitForTimeout(500);
await st(40);
await H.snap('g/03-bought');
log('owns duck', await page.evaluate(() => window.__rg.ctx.profile.owns('hat-duck')), 'wallet', (await H.s()).wallet, 'equipped', JSON.stringify(await page.evaluate(() => window.__rgGear.attached())));
await page.keyboard.press('Escape');
await st(30);
log('after Esc', await H.s(), await page.evaluate(() => (window.__rg.pauseLog ?? []).map((e) => e.reason + ':' + e.detail)));
await H.snap('g/04-closed');
if ((await H.s()).phase === 'paused') { await page.keyboard.press('Escape'); await st(20); log('after 2nd Esc', (await H.s()).phase); }
