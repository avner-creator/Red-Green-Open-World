// QA7 B: Phase 2 weave layers. fakes: walk at the plaza fake spot, touch the real gem (by its debug position).
// shack: walk to the dot-picture boxes, answer. bounce: trampoline fall with ring, press Jump when the ring
// closes. Channel check at each.
const W = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses.weave[fn](...a), [fn, a]);
const out = [];
// fakes
{
  const d0 = await W('debug', 'fakes');
  const sp = d0.spots.find((s) => s.present && !s.spent && !s.blocked);
  out.push(['fakes spot', JSON.stringify(sp)]);
  await H.near(sp.x, sp.z, 18, 0.7);
  out.push(['walk to 9 m', JSON.stringify(await H.walkTo(sp.x, sp.z, 6, 9))]);
  await st(20);
  let d = await W('debug', 'fakes');
  out.push(['fakes near', JSON.stringify(d).slice(0, 500)]);
  await H.snap('weave/fakes-0');
  out.push(['sep', JSON.stringify(await H.sep('weave/fakes-sep'))]);
  out.push(['walk to real', JSON.stringify(await H.walkTo(sp.x, sp.z, 8, 0.4))]);
  await st(30);
  d = await W('debug', 'fakes');
  out.push(['fakes after', d.hits, d.misses, d.gems, JSON.stringify(d.lastResult)]);
  await H.snap('weave/fakes-1');
}
// shack
{
  await page.evaluate(() => { const rg = window.__rg; rg.teleport(4, rg.ctx.world.heightAt(4, 1.2) + 0.4, 1.2, Math.PI / 2); rg.step(1 / 60, 30, false); });
  await st(20);
  let d = await W('debug', 'shack');
  out.push(['shack', JSON.stringify(d).slice(0, 600)]);
  const boxes = (await page.evaluate(() => window.__rg.interactables())).filter((i) => /shack|weave|gift|box/i.test(i.id) && i.id !== 'gearShack');
  out.push(['boxes', JSON.stringify(boxes)]);
  if (boxes.length) {
    await H.walkTo(boxes[0].position[0], boxes[0].position[2] + 2.5, 8, 0.8);
    await H.snap('weave/shack-0');
    out.push(['sep', JSON.stringify(await H.sep('weave/shack-sep'))]);
    d = await W('debug', 'shack');
    const b = boxes.find((x) => x.id.endsWith(String(d.answer))) ?? boxes[d.answer];
    out.push(['answer', d.answer, b?.id, JSON.stringify(await H.walkTo(b.position[0], b.position[2], 6, 0.9))]);
    await tap('KeyE', 60);
    d = await W('debug', 'shack');
    out.push(['shack after', d.hits, d.misses, d.gems, d.prizeItem, JSON.stringify(d.lastResult)]);
    await H.snap('weave/shack-1');
  }
}
log(out.map((x) => x.join(' ')).join('\n'));
