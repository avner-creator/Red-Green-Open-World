// Radio: M cycles stations (chip shows), the HUD radio button cycles too. Read station + chip text each time.
await page.evaluate(() => window.__rg.setRemaining(3000));
const rs = () => page.evaluate(() => ({ api: window.__rgRadio ? JSON.stringify(Object.fromEntries(Object.entries(window.__rgRadio).filter(([, v]) => typeof v !== 'function'))) : null, st: typeof window.__rgRadio?.station === 'function' ? window.__rgRadio.station() : null, chip: document.querySelector('[data-testid="radio-chip"]')?.innerText.trim(), chipOn: document.querySelector('[data-testid="radio-chip"]')?.classList.contains('on') }));
log('start', JSON.stringify(await rs()), await page.evaluate(() => Object.keys(window.__rgRadio ?? {})));
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('KeyM');
  await st(10);
  const r = await rs();
  log('M', i, r.st, r.chip, r.chipOn);
  if (i < 2) await H.snap('radio/m' + i);
}
await page.getByTestId('radio-btn').click();
await st(10);
log('btn', JSON.stringify(await rs()), (await H.s()).phase);
await H.snap('radio/btn');
