// QA6: what holds the hero? Scoops state, camera override, then try teleport.
const r = await page.evaluate(() => ({ scoops: window.__rgScoops?.state?.() ?? window.__rgScoops?.info?.() ?? Object.keys(window.__rgScoops ?? {}), cam: window.__rg.cameraOverridden(), mode: window.__rg.state().playerMode }));
log(JSON.stringify(r).slice(0, 600));
await H.snap('misc/held');
await page.evaluate(() => window.__rg.teleport(80, window.__rg.ctx.world.heightAt(80, 60) + 0.5, 60, 0));
await st(30);
log('after tp', await H.s());
