// QA8 B: bungee as a child: teleport to the north path below the tower (travel), walk to the board (real keys), E / walk off,
// log phases and timings, snap each phase.
for (let i = 0; i < 4 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
const B = () => page.evaluate(() => ({ ph: window.__rgBungee.phase(), last: window.__rgBungee.last() }));
const inf = await page.evaluate(() => window.__rgBungee.info());
log('info', JSON.stringify(inf));
const ia = (await page.evaluate(() => window.__rg.interactables())).filter((i) => /bungee/i.test(i.id));
log('interactables', JSON.stringify(ia));
const tgt = (ia.find((i) => i.id === 'bungee-winch') ?? ia[0]).position;
await H.near(tgt[0], tgt[2], 8, Math.PI);
log('walk', await H.walkTo(tgt[0], tgt[2], 15, 0.8), await H.ui());
await H.snap('bungee8/00-at');
await tap('KeyE', 30);
let last = '';
const tl = [];
let gt = 0;
for (let i = 0; i < 400; i++) {
  await st(15, false); gt += 0.25;
  const b = await B();
  const s = await H.s();
  const k = `${b.ph}/${s.mode}`;
  if (k !== last) { tl.push(`${gt} ${k} ${s.p.join(',')}`); last = k; await H.snap(`bungee8/${String(gt * 4).padStart(4, '0')}-${b.ph}`); }
  if (b.ph === 'idle' && gt > 5 && s.mode === 'walk' && s.p[1] < 10 && tl.length > 2) break;
  if (b.ph === 'idle' && s.mode === 'walk' && s.p[1] > 30 && !globalThis.__bjWalked) { globalThis.__bjWalked = 1; tl.push('on deck: walk to board ' + JSON.stringify(await H.walkTo(inf.board[0], inf.board[2], 8, 0.3))); await tap('KeyE', 10); }
  // a child taps Space now and then
  if (i % 8 === 0) await tap('Space', 0);
}
log(tl.join('\n'));
log('last', JSON.stringify(await B()), (await H.s()).wallet, await H.ui());
