const W = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses.weave[fn](...a), [fn, a]);
log(JSON.stringify(await W('debug', 'bounce')));
log(JSON.stringify(await page.evaluate(() => { const f = window.__rg.ctx; return null; })));
