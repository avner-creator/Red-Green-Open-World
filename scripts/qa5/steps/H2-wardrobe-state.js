// State of the wardrobe screen element + phase.
log(await page.evaluate(() => ({ screen: document.querySelector('[data-screen="wardrobe"]')?.className, phase: window.__rg.state().phase, imgs: document.querySelectorAll('[data-screen="wardrobe"] img').length, onScreens: [...document.querySelectorAll('[data-screen]')].filter((e) => e.classList.contains('on')).map((e) => e.dataset.screen) })));
await H.snap('t/21-state');
