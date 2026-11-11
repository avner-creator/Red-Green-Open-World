// After PLAY: step one frame at a time and log JS heap (MB) to find the memory jump.
const mem = () => page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
log('before', await mem());
await page.click('button.play');
log('clicked', await mem());
const out = [];
for (let i = 0; i < 16; i++) {
  const t = Date.now();
  await st(1, i % 4 === 3);
  out.push(`${i}:${await mem()}MB/${Date.now() - t}ms`);
}
log(out.join(' '));
