const info = await page.evaluate(() => window.__rgSecrets.info());
for (const p of info.paths.slice(0, 2)) log(p.id, JSON.stringify(p.stones.map((s) => s.map((v) => +v.toFixed(1)))));
