// QA6 B: bungee as a child: walk the last 8 m on the bridge deck to the platform, E, hold nothing (it dives
// by itself), then push W, wait for the landing; then the winch (E) back up.
const b = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'bungee');
const info = await page.evaluate(() => window.__rgBungee.info());
log('bungee', b.position, JSON.stringify(info).slice(0, 300));
// stand on the deck 6 m from the platform along the deck
const dk = info.deck;
await page.evaluate(([x, y, z]) => window.__rg.teleport(x, y, z, 0), [b.position[0] + 6, b.position[1] - 0.8, b.position[2]]);
await st(40);
log('start', await H.s());
log('walk', await H.walkTo(b.position[0], b.position[2], 8, 1.0));
await H.snap('bj/00-platform');
log('ui', await H.ui());
await page.keyboard.press('KeyE');
const tl = [];
let shots = 0;
for (let j = 0; j < 120; j++) {
  await st(30, false);
  const s = await H.s();
  const ph = await page.evaluate(() => window.__rgBungee.phase());
  tl.push(`${(j / 2).toFixed(1)} ${ph} y${s.p[1].toFixed(1)} ${s.mode}`);
  if (j === 6) await page.keyboard.down('KeyW');
  if (j % 5 === 0 && shots < 12) { shots++; await H.snap('bj/t' + String(j).padStart(3, '0')); }
  if (j > 8 && s.mode === 'walk') break;
}
await page.keyboard.up('KeyW');
log(tl.filter((_, i) => i % 2 === 0).join('\n'));
log('last', JSON.stringify(await page.evaluate(() => window.__rgBungee.last())).slice(0, 300));
await st(60);
await H.snap('bj/90-landed');
log('ui', await H.ui());
// winch
const w = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'bungee-winch');
log('to winch', await H.walkTo(w.position[0], w.position[2], 10, 1.2));
await page.keyboard.press('KeyE');
for (let j = 0; j < 30; j++) { await st(30, false); const s = await H.s(); if (j > 4 && s.mode === 'walk') { log('winch done at', j / 2, s); break; } }
await H.snap('bj/95-after-winch');
