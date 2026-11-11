// Click PLAY and step slowly, logging where a renderer crash happens.
await page.click('button.play');
for (let i = 0; i < 10; i++) {
  await st(6, i % 3 === 0);
  log(i, await page.evaluate(() => window.__rg.frames));
}
await page.evaluate(() => window.__rg.setRemaining(3000));
log('ok');
