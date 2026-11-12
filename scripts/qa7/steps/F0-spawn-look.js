// From spawn: is the map board visible? Walk from spawn toward it (11,-16.5) with real keys, screenshot every 2 s,
// then stand in front of it (look at it from 4 m).
await page.evaluate(() => window.__rg.teleport(0, 18.5, 9, 1.75));
await st(30);
await H.snap('map/00-spawn');
let t = 0;
for (let i = 0; i < 6; i++) {
  const r = await H.walkTo(8, -9, 2, 0.8);
  t += 2;
  await H.snap('map/w' + i);
  if (r.d < 1) break;
}
log('at', await H.s());
await H.walkTo(11, -16.5 + 0, 3, 3.5);
await H.snap('map/01-board');
log('board', await H.s());
