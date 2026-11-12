// Click the real PLAY, keep the session long so rounds are not cut off.
await page.evaluate(() => window.__rg.freeze(true));
await st(2);
await page.getByTestId('play').click();
await st(30);
await page.evaluate(() => window.__rg.setRemaining(3000));
await st(30);
log('playing', await H.s());
