// Remove the HUD-hiding style tag that A2 injected (QA artifact).
log(await page.evaluate(() => { const s = [...document.querySelectorAll('style')].filter((s) => s.textContent.includes('visibility: hidden !important')); s.forEach((x) => x.remove()); return s.length; }));
