// QA8 A/M1: parked buggy, E, hold W 20 s (no steering). Track position, mode, Pip; snaps every 4 s.
const carPos = await page.evaluate(() => { const c = window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car'); return [c.position.x, c.position.y, c.position.z]; });
log('car at', carPos);
const [cx, , cz] = carPos;
await H.near(cx, cz, 8, 2.6);
log('walk', await H.walkTo(cx, cz, 10, 2.0));
await page.keyboard.press('KeyE');
await st(30);
log('after E', await H.s());
await H.snap('m1/00-in');
await page.keyboard.down('KeyW');
const tr = [];
for (let t = 0.5; t <= 20; t += 0.5) {
  await st(30, false);
  const s = await H.s();
  const b = await page.evaluate(() => document.querySelector('[data-testid="pip-bubble"].on')?.dataset.text ?? '');
  tr.push(`${t} ${s.p.map((v) => v.toFixed(1)).join(',')} ${s.mode} ${b.slice(0, 40)}`);
  if (t % 4 === 0) await H.snap('m1/w-' + t);
}
await page.keyboard.up('KeyW');
log(tr.join('\n'));
