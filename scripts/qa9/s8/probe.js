// QA8: probe world/buddy APIs.
log(await page.evaluate(() => Object.keys(window.__rg.ctx.world)));
log(await page.evaluate(() => window.__rgBuddy.dests().map((d) => `${d.name}:${d.dest.map((v) => v.toFixed(1))}:${d.ok}`).join(' ')));
log(await page.evaluate(() => window.__rg.interactables().filter((i) => /dot/i.test(i.id))));
log(await page.evaluate(() => Object.keys(window.__rgGlasses ?? {})));
