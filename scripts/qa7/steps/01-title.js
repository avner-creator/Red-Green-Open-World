// Title as a new child: look, open DRESS UP, try on, close; change hero; pick a power.
await page.evaluate(() => window.__rg.freeze(true));
await st(2);
log('title', await shot('t/00-title'));
await page.getByTestId('title-wardrobe').click();
await st(20);
log('wardrobe open', await shot('t/01-wardrobe'));
const cards = await page.evaluate(() => [...document.querySelectorAll('[data-testid="shop-card"]')].map((c) => ({ id: c.dataset.item ?? c.dataset.id, txt: c.textContent.trim().slice(0, 30), cls: c.className })).slice(0, 50));
log('cards', cards.length, JSON.stringify(cards.slice(0, 12)));
const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="shop-tab-"]')].map((t) => t.dataset.cat));
log('tabs', tabs);
// Try on the first two cards
const cs = page.getByTestId('shop-card');
await cs.nth(0).click();
await st(20);
log(await shot('t/02-try0'));
await cs.nth(3).click();
await st(20);
log(await shot('t/03-try3'));
log('tryBar', await page.evaluate(() => document.querySelector('[data-testid="wardrobe-try"]')?.innerText));
log('wallet', await page.evaluate(() => window.__rg.ctx.profile?.wallet));
