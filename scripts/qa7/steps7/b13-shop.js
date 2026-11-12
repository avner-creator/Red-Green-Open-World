// QA7 B: Gear Shack. Walk to the kiosk, E, click a tile (an affordable hat), click Buy, close, check it is worn.
const gs = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'gearShack');
log('shack', gs?.position);
await H.near(gs.position[0], gs.position[2], 8, 0.3);
await H.snap('shop/00-approach');
log('walk', JSON.stringify(await H.walkTo(gs.position[0], gs.position[2], 10, 1.6)), await H.ui());
await tap('KeyE', 40);
await H.snap('shop/01-open');
const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="wardrobe-item"],[data-testid^="shop-item"],[data-item]')].filter((e) => e.offsetParent).map((e) => ({ t: e.dataset.testid, id: e.dataset.item ?? e.dataset.id, txt: e.textContent.trim().slice(0, 20), r: (({ x, y, width, height }) => [x, y, width, height].map(Math.round))(e.getBoundingClientRect()) })).slice(0, 40));
log('tiles', JSON.stringify(tiles).slice(0, 1500));
log('wallet', (await H.s()).wallet);
const pick = tiles.find((t) => /pizza|shark|pompom|flowerpot|unicorn|tophat/.test(t.id ?? t.t ?? '')) ?? tiles[3];
log('pick', JSON.stringify(pick));
if (pick) { await page.mouse.click(pick.r[0] + pick.r[2] / 2, pick.r[1] + pick.r[3] / 2); await st(20); }
await H.snap('shop/02-tried');
const buy = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="wardrobe-buy"]')].find((e) => e.offsetParent); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, b.textContent.trim(), b.disabled]; });
log('buy btn', JSON.stringify(buy));
if (buy) { await page.mouse.click(buy[0], buy[1]); await st(40); }
await H.snap('shop/03-bought');
log('after buy wallet', (await H.s()).wallet, 'head', await page.evaluate(() => window.__rg.ctx.profile.equipped('head')), 'attached', JSON.stringify(await page.evaluate(() => window.__rgGear.attached())));
await tap('Escape', 30);
log('after Esc', (await H.s()).phase);
if ((await H.s()).phase === 'paused') { await tap('Escape', 30); }
await H.snap('shop/04-wearing');
