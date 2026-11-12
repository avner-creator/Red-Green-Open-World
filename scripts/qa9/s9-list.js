const it = await page.evaluate(() => window.__rg.interactables().map((i) => `${i.id}@${i.position.map((v) => v.toFixed(0)).join(',')}`));
log(it.join(' '));
log(JSON.stringify(await page.evaluate(() => window.__rg.ctx.vehicles.all.map((v) => [v.kind, +v.position.x.toFixed(1), +v.position.z.toFixed(1)]))));
