// QA5: HUD / touch-button overlaps after PLAY on phone profiles and 960x540 desktop. Lists every pair of visible
// interactive HUD elements whose rectangles overlap by more than 4 px.
// Usage: RG_PORT=4386 node scripts/qa9/hud-overlap.mjs
import { open } from './lib.mjs';

const profiles = [['iPhone 13 landscape', null], ['Pixel 7 landscape', null], [null, [667, 375]], [null, [960, 540]]];
for (const [device, size] of profiles) {
  const name = device ? device.replace(/\s+/g, '-') : `${size[0]}x${size[1]}`;
  const o = await open(`hud-${name}`, { query: '&quality=low&freeze=1', ...(device ? { device, ctxOpts: { deviceScaleFactor: 1 } } : { width: size[0], height: size[1], ctxOpts: size[0] < 700 ? { hasTouch: true, isMobile: true } : {} }) });
  try {
    await o.page.evaluate(() => window.__rg.freeze(true));
    await o.page.getByTestId('play').click({ force: true });
    await o.page.evaluate(() => window.__rg.step(1 / 60, 60, true));
    const r = await o.page.evaluate(() => {
      const sel = '[data-testid]';
      const els = [...document.querySelectorAll(sel)].filter((e) => {
        const t = e.dataset.testid;
        if (/zone|touch-hud|stage|look-hint|pip-bubble|^toasts|-hud$|screen/.test(t)) return false;
        const cs = getComputedStyle(e);
        const q = e.getBoundingClientRect();
        return q.width > 6 && q.height > 6 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.1 && e.closest('[data-screen]') === null && (e.tagName === 'BUTTON' || /chip|wallet|stars|timer|compass|missions|combo|help|radio|skill|touch-|hud-wardrobe|pip-button/.test(t));
      });
      const out = [];
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect();
        const b = els[j].getBoundingClientRect();
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 4 && h > 4) out.push(`${els[i].dataset.testid} x ${els[j].dataset.testid} (${Math.round(w)}x${Math.round(h)})`);
      }
      return { n: els.length, ids: els.map((e) => e.dataset.testid), overlaps: out };
    });
    console.log(name, 'elements', r.n, JSON.stringify(r.ids));
    console.log(name, 'OVERLAPS', JSON.stringify(r.overlaps));
    await o.shot('after-play', { channels: true });
  } finally {
    await o.close();
  }
}
