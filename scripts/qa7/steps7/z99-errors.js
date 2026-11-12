await tap('KeyR', 20); await tap('KeyR', 60);
log('state', await H.s(), 'errors', errors.length, JSON.stringify(errors.slice(0, 10)), 'rg errors', JSON.stringify(await page.evaluate(() => window.__rg.errors)));
