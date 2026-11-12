// QA7 B: Silly Zone "Boop them all!" — walk onto the start pad (real keys), then bop every lit tube person by
// walking into it (no reading). Log timeline, snap arrival/play/result, channel check.
const S = () => page.evaluate(() => window.__rgSilly.round());
const pad = await page.evaluate(() => window.__rgSilly.startPad());
await H.near(pad[0], pad[2], 12, 0.3);
await H.snap('silly/00-arrive');
log('ui arrive', await H.ui());
log('to pad', JSON.stringify(await H.walkTo(pad[0], pad[2], 12, 0.5)));
await st(60, false);
let r = await S();
log('on pad 1s', JSON.stringify(r));
if (r.phase === 'idle') { await tap('KeyE', 30); r = await S(); log('after E', JSON.stringify(r)); }
const tl = [];
let gt = 0;
let shotPlay = false;
while (gt < 120) {
  r = await S();
  if (r.phase === 'play' || r.phase === 'playing' || r.phase === 'run') {
    if (!shotPlay) { shotPlay = true; await H.snap('silly/01-play'); tl.push(['sep', JSON.stringify(await H.sep('silly/sep-play'))]); }
    const tubes = await page.evaluate(() => window.__rgSilly.tubes());
    const hp = (await H.s()).p;
    const left = r.targets.filter((i) => typeof i === 'number');
    // nearest lit target not yet booped is unknown -> walk to targets in order
    const idx = left[r.booped] ?? left[0];
    const t = tubes[idx] ?? tubes[0];
    const w = await H.walkTo(t[0], t[2], 3, 0.4, true);
    gt += 3;
    tl.push([gt, r.phase, `booped ${r.booped}/${r.total}`, `time ${r.timeLeft?.toFixed?.(1)}`, JSON.stringify(w)]);
  } else {
    tl.push([gt, r.phase, JSON.stringify(r).slice(0, 160)]);
    if (r.phase === 'result' || r.phase === 'done' || r.phase === 'prize') { await H.snap('silly/02-result'); await st(120, false); await H.snap('silly/03-after'); log('ui result', await H.ui()); break; }
    await st(30, false); gt += 0.5;
  }
}
log(tl.map((x) => x.join(' ')).join('\n'));
log('final', JSON.stringify(await S()), (await H.s()).wallet);
