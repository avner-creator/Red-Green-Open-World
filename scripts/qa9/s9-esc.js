for (let i = 0; i < 3 && (await H.s()).phase !== 'playing'; i++) { await page.keyboard.press('Escape'); await st(30, false); }
log('state', JSON.stringify(await H.s()));
