// QA8 C misuse: spam E x20 at the race booth; S held in the buggy at the garage 6 s; spam E x20 at the Gear Shack.
for (let i = 0; i < 4 && (await H.s()).mode !== 'walk'; i++) { await tap('KeyE', 60); }
const out = [];
const booth = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'race-booth');
await H.near(booth.position[0], booth.position[2], 6, 1.2);
await H.walkTo(booth.position[0], booth.position[2], 8, 1.8);
for (let i = 0; i < 20; i++) await tap('KeyE', 3);
await st(60, false);
out.push(['race E x20', JSON.stringify(await page.evaluate(() => window.__rgRace.state().phase)), (await H.s()).mode, (await H.s()).wallet]);
await page.evaluate(() => window.__rgRace.exit()); await st(240, false);
for (let i = 0; i < 4 && (await H.s()).mode !== 'walk'; i++) { await tap('KeyE', 60); }
out.push(['after exit', (await H.s()).mode, await page.evaluate(() => window.__rgRace.state().phase)]);
await page.evaluate(() => { const rg = window.__rg; rg.teleport(12, rg.ctx.world.heightAt(12, 1.4) + 0.4, 1.4, Math.atan2(14 - 12, 2 - 1.4)); rg.step(1 / 60, 30, false); });
await H.walkTo(12.85, 1.67, 4, 0.6);
for (let i = 0; i < 20; i++) await tap('KeyE', 3);
await st(30);
out.push(['shack E x20', (await H.s()).phase, (await H.s()).mode, JSON.stringify(await H.ui())]);
await H.snap('misuse/shack-spam');
await tap('Escape', 30);
if ((await H.s()).phase === 'paused') await tap('Escape', 30);
out.push(['after Esc', (await H.s()).phase]);
log(out.map((x) => x.join(' ')).join('\n'));
