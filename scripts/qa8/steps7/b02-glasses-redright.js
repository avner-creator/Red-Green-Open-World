// QA7 B: six glasses mini-games, red lens on the RIGHT eye, weak eye left and right.
const play = async () => {
// QA6 B: play ONE full round of a glasses booth game like a child who sees the weak layer.
// globalThis.QA_ID = game id, globalThis.QA_TAG = suffix. Real keys (walk, E, Space); line-up aims with
// injected look (mouse look needs pointer lock, which headless Chromium does not give).
const id = globalThis.QA_ID;
const tag = `${id}${globalThis.QA_TAG ?? ''}`;
const G = (fn, ...a) => page.evaluate(([fn, a]) => window.__rgGlasses[fn](...a), [fn, a]);
const dbg = () => G('debug', id);
const kitPh = async () => (await G('boothDebug', id))?.phase;
await G('goto', id);
await st(30, false);
let d = await dbg();
const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[2] } : p);
const pad = P(d.pad ?? (await G('boothPadView', id)));
if (d.approach) await H.walkTo(d.approach.x, d.approach.z, 10, 0.8);
log('walk to pad', await H.walkTo(pad.x, pad.z, 15, 0.5));
await st(10, false);
await page.keyboard.press('KeyE');
const t0 = await page.evaluate(() => performance.now());
let gt = 0; // game seconds since E
const tl = [];
let last = '';
let shots = 0;
let midSep = null;
let lastAct = -10;
const note = (s) => { if (s !== last) { tl.push([+gt.toFixed(1), s]); last = s; } };
const step = async (n) => { await st(n, false); gt += n / 60; };
let ended = false;
let sawPlay = false;
while (gt < 150) {
  const kp = await kitPh();
  d = await dbg();
  note(`${kp}/${d.state ?? d.phase}`);
  if (kp === 'play') sawPlay = true;
  if (sawPlay && (kp === 'idle' || kp === 'cooldown')) { ended = true; break; }
  if (sawPlay && kp === 'celebrate' && !globalThis.__celebShot) { globalThis.__celebShot = 1; await page.evaluate(() => window.__rg.render()); await H.sep(`gl6/${tag}-celebrate`).then((r) => log('sep celebrate', JSON.stringify(r))); }
  if (kp === 'play' && shots === 0) { shots++; await page.evaluate(() => window.__rg.render()); midSep = await H.sep(`gl6/${tag}-play`); log('sep play', JSON.stringify(midSep)); }
  if (kp === 'wait') {
    if (!globalThis.__waitShot) { globalThis.__waitShot = 1; await H.snap(`gl6/${tag}-wait`); log('wait ui', await H.ui(), 'pip', await page.evaluate(() => document.querySelector('[data-testid="pip-bubble"]')?.dataset.id)); }
    if (gt - (globalThis.__waitT ?? -99) > 6 && globalThis.QA_RETURN !== false) { globalThis.__waitT = gt; note('walk back to pad'); await H.walkTo(pad.x, pad.z, 12, 0.5); }
  }
  if (kp === 'play') {
    if (id === 'oddone' && d.state === 'open' && d.pressed === -1) {
      const s = d.stands[d.answer];
      await H.walkTo(s.x, s.z, 6, 0.35);
      await page.keyboard.press('KeyE');
      note(`press ${d.answer}`);
      await step(30);
      continue;
    }
    if (id === 'dotsigns' && d.dotsShown && d.chosen === -1 && d.stand) {
      const s = d.stand[d.answer];
      await H.walkTo(s.x, s.z, 6, 0.35);
      await page.keyboard.press('KeyE');
      note(`press ${d.answer}`);
      await step(30);
      continue;
    }
    if (id === 'gates' && d.state === 'open' && d.chosen === -1 && d.arches) {
      const a = d.arches[d.answer];
      const f = a.front, b = a.back;
      const dx = b.x - f.x, dz = b.z - f.z, L = Math.hypot(dx, dz);
      await H.walkTo(f.x, f.z, 12, 0.5, true);
      await H.walkTo(b.x + (dx / L) * 1.5, b.z + (dz / L) * 1.5, 4, 0.5, true);
      await H.snap(`gl6/${tag}-through-${d.round}`);
      note(`ran through ${d.answer}`);
      await step(30);
      d = await dbg();
      if (d.state !== 'open' && globalThis.QA_RETURN !== false) { await H.walkTo(pad.x, pad.z, 12, 0.5); }
      continue;
    }
    if (id === 'glowflies' && d.flies?.length) {
      const hp = await page.evaluate(() => window.__rg.state().playerPosition);
      const fl = d.flies.map((f) => ({ x: f.x ?? f[0], y: f.y ?? f[1], z: f.z ?? f[2] })).filter((f) => Number.isFinite(f.x));
      fl.sort((a, b) => Math.hypot(a.x - hp[0], a.z - hp[2]) - Math.hypot(b.x - hp[0], b.z - hp[2]));
      const f = fl[0];
      if (f) {
        const dist = Math.hypot(f.x - hp[0], f.z - hp[2]);
        if (dist > 1.6) await H.walkTo(f.x, f.z, 1, 1.2, true);
        else { await page.keyboard.down('Space'); await step(10); await page.keyboard.up('Space'); await step(20); }
        gt += 1;
      } else await step(15);
      continue;
    }
    if (id === 'toys' && d.state === 'trail') {
      const pr = d.prints ?? [];
      const nx = pr[Math.min(pr.length - 1, (d.next ?? 0))];
      const tgt = nx ? { x: nx.x ?? nx[0], z: nx.z ?? nx[2] } : d.end;
      const w = await H.walkTo(tgt.x, tgt.z, 2, 0.8, false);
      gt += 2;
      if (gt - lastAct > 10) { lastAct = gt; note(`print ${d.next}/${pr.length} d=${w.d}`); }
      continue;
    }
    if (id === 'lineup' && d.screen) {
      const r = d.screen.ring;
      const b = (d.screen.bubbles ?? []).find((x) => x);
      if (r && b) {
        if (d.inside >= 0) { await page.keyboard.press('KeyE'); note('pop press'); await step(20); continue; }
        // look: +lookX moves the bubble left on screen (~-2.6 NDC/rad); +lookY moves it up (~+2 NDC/rad)
        const ex = r.x - b.x, ey = r.y - b.y;
        await page.evaluate(([lx, ly]) => window.__rg.inject({ lookX: lx, lookY: ly }), [-ex * 0.3, -ey * 0.6]);
        await step(1);
        await page.evaluate(() => window.__rg.inject(null));
        await step(1);
        continue;
      }
    }
  }
  await step(15);
  if (Math.round(gt) % 8 === 0 && shots < 4 && kp === 'play') { shots++; await H.snap(`gl6/${tag}-t${Math.round(gt)}`); }
}
d = await dbg();
const kd = await G('boothDebug', id);
await H.snap(`gl6/${tag}-end`);
log(id, 'ended', ended, 'gameSecs', +gt.toFixed(1), 'results', JSON.stringify(kd?.results), 'hits', kd?.hits, 'gems', kd?.roundGems ?? d.gems, 'wallet', (await H.s()).wallet);
log('timeline', JSON.stringify(tl));
globalThis.__celebShot = 0;

};
const sum = [];
for (const weakEye of globalThis.QA_WEAK ?? ['left', 'right']) {
  await page.evaluate((w) => window.__rg.setEye({ leftLens: 'green', weakEye: w }), weakEye);
  await st(5, false);
  for (const id of globalThis.QA_IDS ?? ['oddone', 'dotsigns', 'lineup', 'gates', 'glowflies', 'toys']) {
    globalThis.QA_ID = id; globalThis.QA_TAG = `-gR-${weakEye}`; globalThis.QA_RETURN = true; globalThis.__waitShot = 0; globalThis.__waitT = -99;
    try { await play(); } catch (e) { log('ERR', id, String(e).slice(0, 200)); }
    const kd = await page.evaluate((id) => window.__rgGlasses.boothDebug(id), id);
    sum.push([weakEye, id, JSON.stringify(kd?.results), kd?.hits]);
  }
}
log('SUMMARY', JSON.stringify(sum));
await page.evaluate(() => window.__rg.setEye({ leftLens: 'red', weakEye: 'left' }));
