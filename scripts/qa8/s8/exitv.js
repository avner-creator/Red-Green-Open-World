for (let i = 0; i < 4 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
if ((await H.s()).phase === 'paused') await tap('Escape', 30);
log('mode', (await H.s()).mode, (await H.s()).phase);