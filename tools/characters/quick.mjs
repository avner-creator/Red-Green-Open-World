// Fast look-dev shots against a running dev server (`npx vite --port $RG_PORT`): front, 3/4 and
// side of each hero in one animation.
// Usage: RG_PORT=4373 [T=0.5] [VIEWS=front,34] node tools/characters/quick.mjs <outdir> <anim> <id ...>
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = Number(process.env.RG_PORT ?? 4373);
const [out, anim = 'idle', ...ids] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 360 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', String(e)));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0&only=${ids.join(',')}`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
  const t = Number(process.env.T ?? 0.5);
  for (const id of ids) {
    for (const [view, yaw] of [['front', 0], ['34', -0.65], ['side', -1.5708]]) {
      if (process.env.VIEWS && !process.env.VIEWS.includes(view)) continue;
      await page.evaluate(([i, y, a, tt]) => {
        window.__preview.focus(i, y);
        window.__preview.pose(a, tt);
      }, [id, yaw, anim, t]);
      writeFileSync(`${out}/${id}-${view}.png`, await page.screenshot({ type: 'png' }));
    }
  }
  console.log('ok');
} finally {
  await browser.close();
}
