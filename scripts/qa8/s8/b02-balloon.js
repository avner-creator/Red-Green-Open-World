// QA8 B: balloon + skydive + parachute weave ring. Walk into the basket (auto-board), wait, jump with Space at the top,
// open the chute (Space) when the timing ring says so, channel check while the ring is up, land.
const C = () => page.evaluate(() => window.__rgGlasses.weave.debug('chute'));
const ia = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'balloon');
await H.near(ia.position[0], ia.position[2], 12, -Math.PI / 2);
log('walk', await H.walkTo(ia.position[0], ia.position[2], 12, 0.4), (await H.s()).mode);
const tl = [];
let last = '';
let gt = 0;
let jumped = false;
let opened = false;
let sepDone = false;
let hoopSep = false;
for (let j = 0; j < 2400; j++) {
  await st(6, false); gt += 0.1;
  const c = await C();
  const s = await H.s();
  const k = `${c.phase}/${s.mode}`;
  if (k !== last) { tl.push(`${gt.toFixed(1)} ${k} agl=${c.agl?.toFixed(0)} target=${c.ring.target?.toFixed?.(0)} win=${c.ring.window}`); last = k; await H.snap(`sky8/${String(Math.round(gt * 10)).padStart(4, '0')}-${c.phase}`); }
  if (c.phase === 'top' && !jumped && gt > 3) { jumped = true; await tap('Space', 2); tl.push(`${gt.toFixed(1)} Space (jump)`); }
  if (c.phase === 'freefall' && c.ring.attached && !sepDone && c.agl < (c.ring.target ?? 0) + 40) { sepDone = true; await H.snap('sky8/ring'); tl.push('sep ring ' + JSON.stringify(await H.sep('sky8/ring-sep'))); }
  if (c.phase === 'freefall' && c.hoop.attached && !hoopSep) { hoopSep = true; await H.snap('sky8/hoop'); tl.push('sep hoop ' + JSON.stringify(await H.sep('sky8/hoop-sep'))); }
  if (c.phase === 'freefall' && !opened && c.ring.target != null && c.agl != null && Math.abs(c.agl - c.ring.target) < Math.max(2, c.ring.window * 0.4)) {
    opened = true; await tap('Space', 1); tl.push(`${gt.toFixed(1)} Space (chute) at agl=${c.agl.toFixed(1)} target=${c.ring.target.toFixed(1)}`);
  }
  if (c.phase === 'landed' || (gt > 20 && s.mode === 'walk')) { tl.push(`${gt.toFixed(1)} end ${k}`); break; }
}
await st(90);
await H.snap('sky8/99-landed');
const c = await C();
log(tl.join('\n'));
log('hits', c.hits, 'misses', c.misses, 'lastOpen', JSON.stringify(c.lastOpen), 'lastHoop', JSON.stringify(c.lastHoop), await H.s(), await H.ui());
