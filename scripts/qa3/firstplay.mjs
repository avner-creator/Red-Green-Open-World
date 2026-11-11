// QA3: first 60-90 s as a brand-new player with Pip's intro tour on (&buddyIntro=1).
// The "child" stands still for the tour, then walks where Pip's lead points (follows the Pip lead
// target if exposed, else the nearest attraction), screenshots every few seconds.
// Usage: npm run build && RG_PORT=4352 node scripts/qa3/firstplay.mjs
import { open } from './lib.mjs';

const { page, shot, close } = await open('firstplay', { query: '&quality=medium&buddyIntro=1' });
const step = (n, render = false) => page.evaluate(([n, r]) => window.__rg.step(1 / 60, n, r), [n, render]);
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await step(2, true);
  await page.getByTestId('play').click();
  let t = 0;
  const marks = [0.5, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 50, 60, 75, 90];
  for (const m of marks) {
    const n = Math.round((m - t) * 60);
    if (n > 0) {
      // From 20 s on, walk forward holding Shift (a child following the arrow on the path).
      if (m > 20) await page.evaluate(() => window.__rg.inject({ moveY: 1, sprint: true }));
      await step(n - 1, false);
      await step(1, true);
    }
    t = m;
    const info = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="pip-bubble"]');
      const dir = window.__rgBuddy?.director?.();
      const s = window.__rg.state();
      const explain = [...document.querySelectorAll('[class*="explain"]')].filter((e) => e.offsetParent).map((e) => e.className + ':' + e.textContent);
      return { pip: b && b.offsetParent ? b.innerText.replace(/\s+/g, ' ') + ' [' + b.className + ']' : '-', dir, pos: s.playerPosition.map((v) => v.toFixed(1)).join(','), mode: s.playerMode, gems: s.gems, explain };
    });
    console.log(`t=${m}`, JSON.stringify(info));
    await shot(`t${String(m).padStart(4, '0')}`, { channels: m === 4 || m === 12 });
  }
  await page.evaluate(() => window.__rg.inject(null));
  console.log('PIP HISTORY', JSON.stringify(await page.evaluate(() => window.__rgBuddy?.history())));
} finally {
  await close();
}
