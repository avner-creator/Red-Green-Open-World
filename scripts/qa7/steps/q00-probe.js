// QA6: list debug globals and interactables, snapshot spawn.
const s = await page.evaluate(() => ({
  g: Object.keys(window).filter((k) => k.startsWith('__rg')),
  act: window.__rg.interactables().map((i) => [i.id, i.position.map((v) => Math.round(v))]),
  glasses: window.__rgGlasses?.sites().map((x) => [x.id, Math.round(x.x), Math.round(x.z)]),
}));
log(s);
await H.snap('a/00-start');
