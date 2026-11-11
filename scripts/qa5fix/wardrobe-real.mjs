// Real (non-test) build: Play, open the wardrobe, count distinct item pictures on first open and after a tab switch.
// Usage: RG_PORT=4379 node scripts/qa5fix/wardrobe-real.mjs  (needs `vite preview` running)
import { chromium } from '@playwright/test';
const port = process.env.RG_PORT ?? 4173;
const out = process.env.OUT ?? 'test-results/qa5fix';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
p.on('pageerror', (e) => console.log('PAGEERR', String(e)));
await p.goto(`http://localhost:${port}/?quality=low`);
await p.waitForSelector('#boot', { state: 'detached', timeout: 120000 });
await p.waitForTimeout(1500);
await p.getByTestId('play').click();
await p.waitForTimeout(4000);
await p.keyboard.press('KeyI');
await p.waitForTimeout(500);
const info = () => p.evaluate(() => {
  const s = document.querySelector('[data-screen="wardrobe"]');
  const imgs = [...(s?.querySelectorAll('[data-testid="wardrobe-grid"] img') ?? [])];
  return { cls: s?.className, cards: s?.querySelectorAll('[data-testid="shop-card"]').length, imgs: imgs.length, distinct: new Set(imgs.map((i) => i.src)).size };
});
console.log('open', await info());
await p.waitForTimeout(8000);
console.log('open+8s', await info());
await p.screenshot({ path: `${out}/wardrobe-1.png` });
await p.locator('[data-screen="wardrobe"] .dr-tab').nth(1).click();
await p.waitForTimeout(6000);
console.log('tab2', await info());
await p.screenshot({ path: `${out}/wardrobe-2.png` });
await b.close();
