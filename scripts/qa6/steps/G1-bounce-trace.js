// Trace the bounce weave debug against the hero height during held-Space bounces.
const W = () => page.evaluate(() => { const d = window.__rgGlasses.weave.debug('bounce'); return [d.active, d.onTrampoline, d.falling, d.ring, d.falls, d.skipped, d.tracked, d.lastGrade].join(','); });
await page.keyboard.down('Space');
const tr = [];
for (let i = 0; i < 60; i++) {
  await st(10, false);
  const s = await H.s();
  tr.push(`${(i / 6).toFixed(1)}s y=${s.p[1].toFixed(1)} ${s.mode} | ${await W()}`);
}
await page.keyboard.up('Space');
log(tr.join('\n'));
log('fresh', await page.evaluate(() => JSON.stringify(window.__rgGlasses.weave.debug('bounce'))));
