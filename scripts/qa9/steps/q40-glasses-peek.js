// QA6 B: for each glasses booth: goto, find the start pad, walk onto it (real keys), E, step 4 s; dump debug.
const ids = (globalThis.QA_IDS ?? ['oddone', 'dotsigns', 'lineup', 'gates', 'glowflies', 'toys']);
for (const id of ids) {
  await page.evaluate((id) => window.__rgGlasses.goto(id), id);
  await st(60);
  await H.snap(`gl/${id}-00-arrive`);
  const pv = await page.evaluate((id) => window.__rgGlasses.boothPadView(id), id);
  const dbg0 = await page.evaluate((id) => window.__rgGlasses.boothDebug(id), id);
  log(id, 'padView', JSON.stringify(pv), 'kit', JSON.stringify(dbg0).slice(0, 300));
  globalThis.QA_PV = globalThis.QA_PV ?? {};
  globalThis.QA_PV[id] = pv;
}
