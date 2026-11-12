// Garage workshop: walk to the tool cart, E, look at the upgrade screen, buy one upgrade, leave.
const w = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'workshop');
log('workshop at', w.position);
await H.near(w.position[0], w.position[2], 9, 0.5);
log('walk', await H.walkTo(w.position[0], w.position[2], 10, 1.6));
log('ui', await H.ui());
await H.snap('w/00-approach');
await page.keyboard.press('KeyE');
for (let i = 0; i < 6; i++) await st(30);
log('after E', await H.s());
await H.snap('w/01-open');
const btns = await page.evaluate(() => [...document.querySelectorAll('[data-testid="workshop"] button')].map((b) => (b.dataset.testid ?? '') + '|' + (b.getAttribute('aria-label') ?? '') + '|' + b.className + '|' + b.textContent.trim().slice(0, 16)));
log('buttons', btns);
const up = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="workshop"] button')].find((b) => !b.disabled && /buy|up|get/i.test((b.getAttribute('aria-label') ?? '') + b.className)); return b ? (b.dataset.testid ?? b.getAttribute('aria-label')) : null; });
log('try', up);
if (up) {
  await page.locator('[data-testid="workshop"] button[aria-label="' + up + '"], [data-testid="' + up + '"]').first().click({ force: true });
  for (let i = 0; i < 4; i++) await st(30);
  await H.snap('w/02-upgraded');
  log('wallet', (await H.s()).wallet);
}
await page.keyboard.press('Escape');
for (let i = 0; i < 4; i++) await st(30);
log('after Esc', await H.s());
await H.snap('w/03-left');
