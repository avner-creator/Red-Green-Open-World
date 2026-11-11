const m = await page.evaluate(() => ({ heap: Math.round(performance.memory.usedJSHeapSize / 1e6), total: Math.round(performance.memory.totalJSHeapSize / 1e6) }));
log(m);
