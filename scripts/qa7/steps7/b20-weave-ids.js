const w = await page.evaluate(() => { const W = window.__rgGlasses.weave; return { ids: W.ids(), dbg: Object.fromEntries(W.ids().map((i) => [i, JSON.stringify(W.debug(i)).slice(0, 300)])) }; });
log(JSON.stringify(w, null, 1));
