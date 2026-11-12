// QA6: real-time frame rate at 960x540 Low (SwiftShader), 5 s unfrozen.
const f0 = await page.evaluate(() => { window.__rg.freeze(false); return window.__rg.frames; });
const t0 = Date.now();
await page.waitForTimeout(5000);
const f1 = await page.evaluate(() => { const f = window.__rg.frames; window.__rg.freeze(true); return f; });
log('fps', ((f1 - f0) / ((Date.now() - t0) / 1000)).toFixed(1));
