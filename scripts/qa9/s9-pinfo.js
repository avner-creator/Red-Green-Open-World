const p=(await page.evaluate(() => window.__rgSecrets.info())).paths; log(JSON.stringify(p.map(q=>{const o={...q}; delete o.stones; return o;})).slice(0,1500));
