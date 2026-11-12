// QA8: print the last stones of each secret path.
const info = await page.evaluate(() => window.__rgSecrets.info());
for (const p of info.paths) {
  const S = p.stones;
  const rows = S.map((s, i) => `${i}:${s.map((v) => v.toFixed(2)).join(',')}${i ? ` gap=${Math.hypot(s[0] - S[i - 1][0], s[2] - S[i - 1][2]).toFixed(2)} dy=${(s[1] - S[i - 1][1]).toFixed(2)}` : ''}`);
  log(p.id, 'pedestal', p.pedestal.map((v) => v.toFixed(1)).join(','), 'claimed', p.claimed, '\n ', rows.join('\n  '));
}
