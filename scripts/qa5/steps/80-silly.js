// Silly Zone "Boop them all": walk the last 10 m to the start pad, step on it, then (a) win by walking into each lit tube,
// (b) second round: stand still and let it time out. Screenshots every 2 s.
const S = () => page.evaluate(() => window.__rgSilly.round());
const pad = await page.evaluate(() => window.__rgSilly.startPad());
log('pad', pad);
await H.near(pad[0], pad[2], 10, 0.4);
log('walk', await H.walkTo(pad[0], pad[2], 12, 0.6));
await H.snap('silly/00-pad');
for (let i = 0; i < 6; i++) { await st(30); }
log('round after pad', JSON.stringify(await S()), await H.ui());
await H.snap('silly/01-start');
let t = 0;
let r = await S();
if (r.phase !== 'playing' && r.phase !== 'countdown') { await page.keyboard.press('KeyE'); await st(30); r = await S(); log('after E', JSON.stringify(r)); }
const tubes = await page.evaluate(() => window.__rgSilly.tubes());
const trace = [];
const done = new Set();
const tag = process.env.X ?? 'w';
while (t < 70) {
  r = await S();
  trace.push([t, r.phase, r.booped + '/' + r.total, +(r.timeLeft ?? 0).toFixed(1)]);
  if (r.phase === 'result' || r.phase === 'idle' && t > 5) break;
  // nearest target not yet booped: targets are tube indices; booped ones we cannot see individually, go in order
  const p = (await H.s()).p;
  const tg = r.targets.filter((i) => !done.has(i)).map((i) => tubes[i]).sort((a, b) => Math.hypot(a[0] - p[0], a[2] - p[2]) - Math.hypot(b[0] - p[0], b[2] - p[2]));
  const k = r.booped % Math.max(1, tg.length);
  const goal = tg[0];
  if (goal) { const w = await H.walkTo(goal[0], goal[2], 2, 1.2, true); if (w.d < 1.3 || w.stall >= 1.5) done.add(r.targets.find((i) => tubes[i] === goal)); }
  else await st(60, false);
  t += 2;
  await H.snap('silly/v' + String(t).padStart(3, '0'));
}
log('win run', JSON.stringify(trace));
log('result', JSON.stringify(await S()), await H.ui());
await H.snap('silly/02-result');
