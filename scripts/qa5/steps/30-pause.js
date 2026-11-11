// Does anything pause the game unasked? Fun Pass open + Esc, help open + Esc, click every HUD chip, blur/focus, hidden tab.
await page.evaluate(() => window.__rg.setRemaining(3000));
const phase = () => page.evaluate(() => window.__rg.state().phase);
const plog = () => page.evaluate(() => (window.__rg.pauseLog ?? window.__rgPauseLog ?? []).map((e) => e.reason + ':' + e.detail));
const res = [];
const vis = (tid) => page.evaluate((t) => { const e = document.querySelector('[data-testid="' + t + '"]'); if (!e) return 'none'; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && e.getBoundingClientRect().width > 2 ? 'shown' : 'hidden'; }, tid);
// 1 Fun Pass via its HUD chip, then Esc
await page.getByTestId('missions').click();
await st(20);
res.push(['funpass open', await vis('funpass'), await phase()]);
await H.snap('z/01-funpass');
await page.keyboard.press('Escape');
await st(20);
res.push(['funpass after Esc', await vis('funpass'), await phase(), await plog()]);
await H.snap('z/02-funpass-esc');
if ((await phase()) === 'paused') { await page.keyboard.press('Escape'); await st(10); }
// 2 Help button then Esc
await page.getByTestId('help').click();
await st(20);
res.push(['help open', await phase()]);
await H.snap('z/03-help');
await page.keyboard.press('Escape');
await st(20);
res.push(['help after Esc', await phase(), await plog()]);
await H.snap('z/04-help-esc');
if ((await phase()) === 'paused') { await page.keyboard.press('Escape'); await st(10); }
// 3 Click every HUD chip once
for (const t of ['wallet', 'stars', 'timer', 'combo', 'compass', 'skill-chip', 'radio-btn', 'pip-button']) {
  const ok = await page.locator('[data-testid="' + t + '"]').first().click({ timeout: 2000 }).then(() => true).catch(() => false);
  await st(20);
  res.push(['click ' + t, ok, await phase()]);
  if ((await phase()) !== 'playing') { await H.snap('z/05-after-' + t); await page.keyboard.press('Escape'); await st(10); }
}
await H.snap('z/06-after-chips');
// 4 window blur/focus and hidden tab
await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
await st(30);
res.push(['blur', await phase()]);
await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
await st(10);
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
await st(10);
res.push(['hidden', await phase()]);
await page.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});
await st(10);
res.push(['visible again', await phase(), await plog()]);
await H.snap('z/07-end');
for (const r of res) log(JSON.stringify(r));
