// Change hero from the title: look at the select, step to other heroes, look at powers, pick one, GO.
await page.getByTestId('title-hero').click();
await st(30);
log(await shot('h/00-select'));
const chips = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="csel-"][data-id]')].map((c) => c.dataset.id));
log('heroes', chips);
const info = () => page.evaluate(() => ({
  name: document.querySelector('[data-testid="csel-name"]')?.textContent,
  story: document.querySelector('[data-testid="csel-story"]')?.textContent,
  powers: [...document.querySelectorAll('[data-testid^="csel-power-"]')].map((p) => p.dataset.testid.slice(11) + ':' + p.dataset.state + ':' + p.getAttribute('aria-pressed')),
  go: !!document.querySelector('[data-testid="csel-go"]'),
  buy: document.querySelector('[data-testid="csel-buy"]')?.textContent,
  locked: !!document.querySelector('[data-testid="csel-locked"]'),
}));
log('cur', await info());
for (const id of [chips[1], chips[4], chips[7]]) {
  await page.getByTestId('csel-' + id).click();
  await st(30);
  log(id, await info());
  log(await shot('h/01-' + id));
}
await page.getByTestId('csel-' + chips[1]).click();
await st(30);
const pw = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="csel-power-"]')].map((p) => p.dataset.testid));
log('powers on hero', chips[1], pw);
if (pw[1]) {
  await page.getByTestId(pw[1]).click();
  await st(20);
}
log('after power pick', await info());
log(await shot('h/02-power'));
await page.getByTestId('csel-go').click();
await st(30);
log('after go', await H.s(), await page.evaluate(() => window.__rg.ctx.player.characterId));
log(await shot('h/03-after-go'));
