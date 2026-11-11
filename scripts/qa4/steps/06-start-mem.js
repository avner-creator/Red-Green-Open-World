// Like 05 but starts with __rg.start() (as the e2e helpers do) after a few title frames.
const mem = () => page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
await st(5);
log('title', await mem());
await page.evaluate(() => window.__rg.start());
const out = [];
for (let i = 0; i < 12; i++) {
  const t = Date.now();
  await st(1, i % 4 === 3);
  out.push(`${i}:${await mem()}MB/${Date.now() - t}ms`);
}
log(out.join(' '));
