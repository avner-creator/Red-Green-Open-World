// QA8 A/m7: walk onto the bubble-soccer pitch from Pip's lead point, from the booth, and from 4 sides.
const bb = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgBubbleBall[fn](...a), [fn, a]);
const booth = await bb('booth');
const c = await bb('world', 0, 0, 0);
log('booth', booth, 'centre', c);
const dest = (await page.evaluate(() => window.__rgBuddy.dests().find((x) => x.name === 'bubbleArena'))).dest;
const face = (x, z, tx, tz) => page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 40, false); }, [x, z, tx, tz]);
const starts = [['pip', dest[0], dest[1]], ['booth', booth[0], booth[2]]];
for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; starts.push([`side${i}`, c[0] + Math.sin(a) * 16, c[2] + Math.cos(a) * 16]); }
for (const [nm, x, z] of starts) {
  await face(x, z, c[0], c[2]);
  const r = await H.walkTo(c[0], c[2], 14, 1.5);
  const ph = await bb('debug').catch(() => null);
  log(nm, [x.toFixed(1), z.toFixed(1)], JSON.stringify(r), JSON.stringify(ph)?.slice(0, 160));
  await H.snap(`m7/${nm}`);
}
