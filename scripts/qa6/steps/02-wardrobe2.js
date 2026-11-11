// Wardrobe with real item pictures (previews are opt-in in test mode), then wear a free item, go to hero select.
await page.evaluate(() => window.__rgGear.enablePreviews(true));
await page.getByTestId('wardrobe-close').click();
await st(10);
await page.getByTestId('title-wardrobe').click();
for (let i = 0; i < 12; i++) await st(20);
log(await shot('t/04-wardrobe-previews'));
await page.getByTestId('shop-card').nth(1).click(); // owned (chef?) -> wear
await st(20);
log(await shot('t/05-wear-owned'));
for (const t of ['face', 'back', 'emote', 'hero']) {
  await page.getByTestId(`shop-tab-${t}`).click();
  for (let i = 0; i < 6; i++) await st(20);
  log(t, await shot(`t/06-tab-${t}`));
}
await page.getByTestId('wardrobe-close').click();
await st(20);
log('equipped', await page.evaluate(() => JSON.stringify(window.__rgGear.attached())));
log(await shot('t/07-title-after-dress'));
