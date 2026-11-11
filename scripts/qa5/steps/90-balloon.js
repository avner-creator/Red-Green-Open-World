// Balloon: walk the last 12 m into the basket WITHOUT pressing E (auto-board), then hold W the whole way (never Space).
const ia = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'balloon');
log('balloon', ia.position);
await H.near(ia.position[0], ia.position[2], 12, -Math.PI / 2);
const w = await H.walkTo(ia.position[0], ia.position[2], 12, 0.4);
log('walk', w, await H.s());
await H.snap('bal/00-basket');
const log2 = [];
await page.keyboard.down('KeyW');
let landed = false;
for (let j = 0; j < 160; j++) {
  await st(30, false);
  const s = await H.s();
  const ui = j % 4 === 0 ? (await H.ui()).filter((x) => !/hud:|toasts/.test(x)).join('|').slice(0, 80) : '';
  log2.push(`${(j / 2).toFixed(1)}s ${s.p.map((n) => n.toFixed(0)).join(',')} ${s.mode} ${ui}`);
  if (j % 4 === 0) await H.snap('bal/t' + String(j).padStart(3, '0'));
  if (j > 10 && s.mode === 'walk') { landed = true; break; }
}
await page.keyboard.up('KeyW');
await st(60);
await H.snap('bal/99-landed');
log(log2.join('\n'));
log('landed', landed, await H.s());
