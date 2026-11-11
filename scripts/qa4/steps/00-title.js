await st(5);
log(await shot('a/00-title'));
const btns = await page.$$eval('button', (b) => b.filter((x) => x.offsetParent).map((x) => (x.id || '') + '|' + x.className + '|' + x.textContent.trim().slice(0, 30)));
log(btns);
const a = await page.evaluate(() => Object.fromEntries(Object.entries(window.__rg.ctx.world.anchors).map(([k, v]) => [k, [v.position.x, v.position.y, v.position.z, v.yaw ?? 0, v.radius].map((n) => (typeof n === 'number' ? +n.toFixed(1) : n))])));
log(a);
