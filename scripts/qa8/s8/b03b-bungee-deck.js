// QA8 B: bungee from the deck: snap what the child sees at the board, walk to the E prompt spot, E, then hold W off the board.
const B = () => page.evaluate(() => ({ ph: window.__rgBungee.phase(), last: window.__rgBungee.last() }));
log('at', await H.s(), await H.ui());
await H.snap('bungee8/10-board');
log('to prompt', await H.walkTo(-5.8, -106, 6, 0.4), await H.ui());
await H.snap('bungee8/11-prompt');
await tap('KeyE', 30);
let last = '';
const tl = [];
let gt = 0;
for (let i = 0; i < 300; i++) {
  await st(15, false); gt += 0.25;
  const b = await B();
  const s = await H.s();
  const k = `${b.ph}/${s.mode}`;
  if (k !== last) { tl.push(`${gt} ${k} ${s.p.join(',')} ${(await H.ui()).filter((x) => !/hud:|toasts/.test(x)).join('|')}`); last = k; await H.snap(`bungee8/${String(100 + gt * 4).padStart(4, '0')}-${b.ph}`); }
  if (gt === 3 && b.ph === 'idle') { tl.push('still idle: hold W 3 s'); await hold(['KeyW'], 180, 30); }
  if (b.ph === 'idle' && gt > 8 && s.p[1] < 10) break;
  if (i % 8 === 0 && b.ph !== 'idle') await tap('Space', 0);
}
log(tl.join('\n'));
log('last', JSON.stringify(await B()), (await H.s()).wallet);
