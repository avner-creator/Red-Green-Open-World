// QA7 A m2 + B: three chests, start to open. Walk (real WASD) 10 m to the key area, find the key (walk to it,
// E), carry to the chest, press E at the chest (m2: must not press a tile), then step on the right symbol.
const all = await page.evaluate(() => window.__rgChests.info());
log('chests', all.length, JSON.stringify(all.map((c) => ({ id: c.id, pos: c.position.map((v) => +v.toFixed(0)), open: c.open, sym: c.symbol }))));
const ids = globalThis.QA_CHESTS ?? [0, 1, 2];
for (const k of ids) {
  const I = () => page.evaluate((k) => window.__rgChests.info()[k], k);
  let c = await I();
  if (c.open) { log(k, 'already open'); continue; }
  const t0 = Date.now();
  await H.near(c.position[0], c.position[2], 6, 0.5);
  await H.snap(`ch7/${k}-00-chest`);
  const sepA = await H.sep(`ch7/${k}-sep-chest`);
  log(k, 'sep at chest', JSON.stringify(sepA));
  // A child follows the dotted trail to the key area, then looks for the key.
  log(k, 'walk to key', JSON.stringify(await H.walkTo(c.key[0], c.key[2], 20, 1.0)));
  await H.snap(`ch7/${k}-01-at-key`);
  await page.keyboard.press('KeyE');
  await st(40);
  c = await I();
  log(k, 'after E at key', c.keyState, c.badge, c.carriedKeyVisible);
  if (c.keyState !== 'carried' && c.keyState !== 'held') {
    // try once more on the key spot exactly (walk-over pickup)
    await H.walkTo(c.key[0], c.key[2], 6, 0.3); await st(30); c = await I(); log(k, 'walk-over', c.keyState);
  }
  log(k, 'walk to chest', JSON.stringify(await H.walkTo(c.position[0], c.position[2], 25, 1.8)));
  await H.snap(`ch7/${k}-02-at-chest`);
  log(k, 'ui at chest', await H.ui());
  const w0 = (await I()).wrongTries;
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyE'); await st(20); }
  c = await I();
  log(k, 'E x3 at chest: wrong', w0, '->', c.wrongTries, 'open', c.open, 'eTile', c.eTile);
  if (!c.open) {
    const b = c.buttons.find((b) => b.symbol === c.symbol);
    log(k, 'step on', b.symbol, JSON.stringify(await H.walkTo(b.x, b.z, 8, 0.4)));
    await st(60); c = await I();
    if (!c.open) { await page.keyboard.press('KeyE'); await st(60); c = await I(); }
    log(k, 'open', c.open, 'wrong', c.wrongTries);
    await H.snap(`ch7/${k}-03-open`);
    await st(120);
    await H.snap(`ch7/${k}-04-reward`);
    log(k, 'outfit', c.outfitId, 'ui', await H.ui());
  }
}
