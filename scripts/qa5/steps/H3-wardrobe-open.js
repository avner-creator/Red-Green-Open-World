// Resume, open the wardrobe from the HUD, read the screen class while open, wait 4 s real time, count pictures.
if ((await H.s()).phase === 'paused') { await page.getByTestId('resume').click(); await st(20); }
await page.evaluate(() => window.__rgGear.enablePreviews(true));
await page.keyboard.down('KeyI');
await st(3);
await page.keyboard.up('KeyI');
await st(10);
await page.waitForTimeout(4000);
await st(5);
log(await page.evaluate(() => ({ screen: document.querySelector('[data-screen="wardrobe"]')?.className, phase: window.__rg.state().phase, imgs: document.querySelectorAll('[data-screen="wardrobe"] img').length })));
await H.snap('t/22-open');
await page.getByTestId('wardrobe-close').click({ force: true });
await st(20);
log('after close', (await H.s()).phase, await page.evaluate(() => (window.__rg.pauseLog ?? []).slice(-3).map((e) => e.reason + ':' + e.detail)));
