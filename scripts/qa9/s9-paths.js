const i = await page.evaluate(() => window.__rgSecrets.info());
log(JSON.stringify(Object.keys(i)), JSON.stringify((i.paths ?? []).map((p, k) => [k, p.id, p.stones?.length ?? p.count, p.done ?? p.claimed])));
