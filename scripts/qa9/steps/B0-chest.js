// Chest: walk the last 10 m to chest 0's key area, follow to the key (E), carry it to the chest, open (symbol button / E).
const I = () => page.evaluate(() => window.__rgChests.info()[0]);
let c = await I();
log('chest0', JSON.stringify({ pos: c.position.map((v) => +v.toFixed(1)), key: c.key.map((v) => +v.toFixed(1)), keyState: c.keyState, badge: c.badge, symbol: c.symbol, buttons: c.buttons.map((b) => b.symbol), dots: c.dots }).slice(0, 600));
await H.near(c.key[0], c.key[2], 10, 0.8);
await H.snap('ch/00-near-key');
log('walk to key', await H.walkTo(c.key[0], c.key[2], 12, 1.0));
await H.snap('ch/01-at-key');
log('ui', await H.ui(), JSON.stringify(await page.evaluate(() => window.__rgChests.hud())));
await page.keyboard.press('KeyE');
await st(40);
c = await I();
log('after E at key', c.keyState, c.badge, c.carriedKeyVisible, JSON.stringify(await page.evaluate(() => window.__rgChests.hud())));
await H.snap('ch/02-carry');
log('walk to chest', await H.walkTo(c.position[0], c.position[2], 25, 1.8));
await H.snap('ch/03-at-chest');
log('ui at chest', await H.ui());
await page.keyboard.press('KeyE');
await st(60);
c = await I();
log('after E at chest', 'open', c.open, 'keyState', c.keyState, 'wrong', c.wrongTries, 'buttons', JSON.stringify(c.buttons));
await H.snap('ch/04-after-E');
if (!c.open) {
  const b = c.buttons.find((b) => b.symbol === c.symbol);
  if (b) { log('step on symbol button', b.symbol, await H.walkTo(b.x, b.z, 8, 0.4)); await st(60); c = await I(); log('open now', c.open, c.wrongTries); await H.snap('ch/05-button'); }
}
for (let i = 0; i < 3; i++) await st(60);
await H.snap('ch/06-final');
log('final', (await I()).open, (await H.s()).wallet);
