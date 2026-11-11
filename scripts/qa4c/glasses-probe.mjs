// QA4C section 3 probe: each weaker-eye mini-game's site, board (R/G shots), debug state, E targets,
// weak layer on vs off. Usage: RG_PORT=4363 node scripts/qa4c/glasses-probe.mjs
import { open } from './lib.mjs';

const { page, shot, close, errors } = await open('glasses', { query: '&quality=low&freeze=1', width: 1280, height: 720 });
const ids = ['glowflies', 'oddone', 'lineup', 'toys', 'gates', 'dotsigns'];
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await page.evaluate(() => window.__rg.start());
  await page.evaluate(() => window.__rg.step(1 / 60, 5, true));
  const sites = await page.evaluate(() => window.__rgGlasses.sites());
  const spawn = await page.evaluate(() => window.__rg.state().playerPosition);
  for (const s of sites) console.log('SITE', s.id, s.x.toFixed(1), s.z.toFixed(1), 'from spawn', Math.hypot(s.x - spawn[0], s.z - spawn[2]).toFixed(0), 'm');
  // Compass contents at spawn
  console.log('COMPASS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[data-testid="compass-marker"]')].map((m) => m.dataset.id ?? m.getAttribute('aria-label') ?? m.className))));
  for (const id of ids) {
    const g = await page.evaluate((i) => window.__rgGlasses.goto(i), id);
    await page.evaluate(() => window.__rg.step(1 / 60, 40, true));
    await shot(`${id}-board`, { channels: true });
    await page.evaluate(() => window.__rg.setLayerVisible(1, false));
    await page.evaluate(() => window.__rg.render());
    await shot(`${id}-noweak`);
    await page.evaluate(() => window.__rg.setLayerVisible(1, true));
    await page.evaluate(() => window.__rg.render());
    const info = await page.evaluate((i) => ({ dbg: window.__rgGlasses.debug(i), active: window.__rgGlasses.active(i), e: window.__rg.interactables().filter((x) => x.id.includes(i) || x.id.includes('glasses')), pip: document.querySelector('[data-testid="pip-bubble"]')?.dataset.text }), id);
    console.log('MG', id, JSON.stringify(g), JSON.stringify(info).slice(0, 1500));
  }
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
