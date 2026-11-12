// Use the chosen super power (Q) in play and record what happens to the hero (height, speed) + skill chip.
await page.evaluate(() => window.__rg.setRemaining(3000));
const chip = () => page.evaluate(() => {
  const e = document.querySelector('[data-testid="skill-chip"]');
  return e ? { cls: e.className, st: e.dataset.state, cd: e.dataset.cooldown, txt: e.textContent.trim() } : null;
});
log('chip before', await chip());
const tr = [];
await page.keyboard.down('KeyW');
await st(20, false);
await page.keyboard.down('KeyQ');
for (let i = 0; i < 16; i++) {
  await st(6, i % 4 === 3);
  if (i === 1) await page.keyboard.up('KeyQ');
  const s = await H.s();
  tr.push(s.p[1]);
  if (i % 4 === 3) log(await shot('p/rocket-' + i));
}
await page.keyboard.up('KeyW');
log('heights', tr);
log('chip after', await chip());
await st(120, false);
log('chip later', await chip());
