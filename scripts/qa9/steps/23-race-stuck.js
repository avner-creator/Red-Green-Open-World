// Where did the car get stuck relative to the racing line, and does R put it back?
const info = await page.evaluate(() => [140, 145, 150, 155, 160].map((s) => window.__rgRace.lineInfo(s)).map((i) => ({ x: +i.x.toFixed(1), z: +i.z.toFixed(1), safe: i.safe, ideal: i.ideal, blocked: i.blocked })));
log('line 140..160', JSON.stringify(info));
const car = await page.evaluate(() => window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car').position.toArray().map((v) => +v.toFixed(1)));
log('car', car, (await H.s()).mode);
