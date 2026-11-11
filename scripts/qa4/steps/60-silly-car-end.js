// Items 5, 6 (short), 13: Silly Zone beach ball collision, buggy drive + bump, session end.
await tap('KeyR', 30);
const names = await page.evaluate(() => { const o = []; window.__rg.ctx.scene.traverse((x) => { if (/silly|ball|tube|mushroom|seesaw|flop/i.test(x.name) && x.name.length < 30) { const v = x.getWorldPosition(x.position.clone()); if (Math.hypot(v.x - 8, v.z - 98) < 30) o.push(`${x.name}@${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)}`); } }); return [...new Set(o)].slice(0, 25); });
log('silly', names);
const ballP = await page.evaluate(() => { let p = null; window.__rg.ctx.scene.traverse((x) => { if (!p && /^silly-ball/.test(x.name)) { const v = x.getWorldPosition(x.position.clone()); p = [v.x, v.y, v.z]; } }); return p; });
log('ball', ballP);
if (ballP) {
  for (const [i, ang] of [0, Math.PI / 2, Math.PI].entries()) {
    const b0 = await page.evaluate(() => { let p = null; window.__rg.ctx.scene.traverse((x) => { if (!p && /^silly-ball/.test(x.name)) { const v = x.getWorldPosition(x.position.clone()); p = [v.x, v.y, v.z]; } }); return p; });
    await H.near(b0[0], b0[2], 9, ang);
    const tr = [];
    let minD = 99;
    await hold(['KeyW'], 120, 10, async (s) => { const d = H.dist(s.playerPosition, b0); minD = Math.min(minD, d); tr.push(d.toFixed(1)); });
    const b1 = await page.evaluate(() => { let p = null; window.__rg.ctx.scene.traverse((x) => { if (!p && /^silly-ball/.test(x.name)) { const v = x.getWorldPosition(x.position.clone()); p = [v.x, v.y, v.z]; } }); return p; });
    log('ball side', i, 'player-ball start dist trail', tr.join(' '), 'minD', minD.toFixed(2), 'ball moved', H.dist(b0, b1).toFixed(1));
    if (i === 2) await H.snap('a/silly/ball-2');
  }
}
