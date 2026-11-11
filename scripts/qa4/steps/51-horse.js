globalThis.SKIPFALL=1;
;
await H.snap('a/fall/afterR');
// Item 7: horse
const hs = await page.evaluate(() => { const o = []; window.__rg.ctx.scene.traverse((x) => { if (/^horse/i.test(x.name)) { const v = x.getWorldPosition(x.position.clone()); o.push({ id: x.name, position: [v.x, v.y, v.z] }); } }); return o.slice(0, 6); });
log('horse targets', hs);
{
  const P = hs.find((h) => h.id === 'horse').position;
  await H.near(P[0], P[2], 10, 0.8);
  await H.snap('a/horse/00');
  let prompted = false;
  await page.keyboard.down('KeyW');
  for (let j = 0; j < 12; j++) { await st(10, false); const ui = await H.ui(); if (ui.some((u) => /prompt on/.test(u))) { prompted = true; break; } }
  await page.keyboard.up('KeyW');
  log('horse approach', await H.s(), 'prompt', prompted);
  await H.snap('a/horse/at');
  await tap('KeyE', 20);
  log('after E', await H.s());
  const rd = [];
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  for (let j = 0; j < 30; j++) {
    if (j === 10) await page.keyboard.down('KeyA');
    if (j === 14) await page.keyboard.up('KeyA');
    if (j === 20) await tap('Space', 1);
    await st(30, j % 4 === 0);
    const s = await H.s();
    rd.push(`${s.p.map((n) => n.toFixed(0)).join(',')}:${s.mode[0]}`);
    if (j % 4 === 0) await H.snap(`a/horse/r${j}`);
  }
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  log('ride', rd.join(' '));
  await st(60, false);
  await tap('KeyR', 30);
  log('after R', await H.s());
  await H.snap('a/horse/afterR');
  await tap('KeyE', 30);
  log('after E again', await H.s());
}
