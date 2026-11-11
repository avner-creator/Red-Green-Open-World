// Wardrobe pictures with the real-time loop running (not frozen) and previews on.
await page.evaluate(() => { window.__rgGear.enablePreviews(true); });
await page.getByTestId('hud-wardrobe').click({ force: true });
await page.evaluate(() => window.__rg.freeze(false));
await page.waitForTimeout(12000);
await page.evaluate(() => window.__rg.freeze(true));
const n = await page.evaluate(() => ({ pics: document.querySelectorAll('[data-testid="wardrobe-grid"] img').length, cards: document.querySelectorAll('[data-testid="shop-card"]').length, previewFn: !!window.__rg.ctx.economy.item('hat-pizza')?.preview, url: (() => { try { const v = window.__rg.ctx.economy.item('hat-pizza').preview(); return typeof v === 'string' ? v.slice(0, 30) : String(v); } catch (e) { return 'ERR ' + e; } })() }));
log(JSON.stringify(n));
log(await shot('t/20-wardrobe-unfrozen'));
await page.keyboard.press('Escape');
await st(10);
