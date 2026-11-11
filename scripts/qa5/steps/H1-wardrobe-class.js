// Is the wardrobe root marked 'on' while open (the picture queue requires it)?
await page.getByTestId('hud-wardrobe').click({ force: true });
await st(10);
log(await page.evaluate(() => { const w = document.querySelector('[data-testid="wardrobe"]'); return { cls: w?.className, parentCls: w?.parentElement?.className, screen: w?.closest('[data-screen]')?.className }; }));
await page.waitForTimeout(3000);
log('pics after 3 s', await page.evaluate(() => document.querySelectorAll('[data-testid="wardrobe"] img').length));
await page.keyboard.press('Escape');
await st(10);
