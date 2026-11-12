// Workshop: resume, click the duck ornament card twice (select, then buy?), look, then drive away.
if ((await H.s()).phase === 'paused') { await page.getByTestId('resume').click(); await st(20); }
const card = page.getByTestId('ws-card-duckOrnament');
await card.click({ force: true });
await st(30);
await H.snap('w/04-select');
log('cards', await page.evaluate(() => [...document.querySelectorAll('[data-testid^="ws-card-"]')].map((b) => b.dataset.testid.slice(8) + ':' + b.className + ':' + b.textContent.trim())));
await card.click({ force: true });
await st(60);
await H.snap('w/05-buy');
log('wallet', (await H.s()).wallet, await page.evaluate(() => [...document.querySelectorAll('[data-testid^="ws-card-"]')].map((b) => b.dataset.testid.slice(8) + ':' + b.className)));
await page.getByTestId('ws-card-drive').click({ force: true });
await st(60);
log('after drive', await H.s());
await page.keyboard.down('KeyW');
await st(90);
await page.keyboard.up('KeyW');
await H.snap('w/06-driving');
