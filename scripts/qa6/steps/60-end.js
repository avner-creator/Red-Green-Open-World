// Session end: skip the timer to 3 s, watch the sunset end, end screen, then PLAY AGAIN.
await page.evaluate(() => window.__rg.setRemaining(3));
for (let i = 0; i < 8; i++) {
  await st(60);
  const s = await H.s();
  log(i, s.phase, s.rem);
  await H.snap('e/' + i + '-' + s.phase);
}
const end = await page.evaluate(() => ({ txt: document.querySelector('[data-screen="end"]')?.innerText?.replace(/\s+/g, ' ').slice(0, 300), btns: [...document.querySelectorAll('[data-screen="end"] button')].map((b) => b.dataset.testid + ':' + (b.getAttribute('aria-label') ?? '')) }));
log('end screen', JSON.stringify(end));
await H.snap('e/end-screen');
const pa = page.getByTestId('play-again');
if (await pa.count()) {
  await pa.click({ force: true });
  for (let i = 0; i < 4; i++) await st(30);
  log('after play again', await H.s(), await page.evaluate(() => window.__rgBuddy?.director()));
  await H.snap('e/after-play-again');
}
