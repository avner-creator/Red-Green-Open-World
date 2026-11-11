// QA6: which hero is equipped, and recent character events.
const r = await page.evaluate(() => {
  const p = window.__rg.ctx.profile;
  return { equipped: p.data?.equipped ?? p.equipped ?? null, keys: Object.keys(p).slice(0, 20) };
});
log(JSON.stringify(r).slice(0, 800));
