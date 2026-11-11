await page.getByTestId('title-wardrobe').click();
await page.getByTestId('shop-tab-head').click();
await page.waitForTimeout(8000);
await st(5);
const imgs = await page.evaluate(() => [...document.querySelectorAll('[data-testid="shop-card"]')].slice(0, 6).map((c) => c.querySelector('img')?.src?.slice(0, 40) ?? c.querySelector('svg') ? 'svg' : '?'));
log('imgs', imgs);
log(await shot('t/08-wardrobe-wait'));
await page.getByTestId('wardrobe-close').click();
await st(5);
