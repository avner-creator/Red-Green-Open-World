// Lists every object registered on a vision layer (layer:name -> count) after boot. Debug helper.
// Usage: npm run build && RG_PORT=4293 node scripts/layer-names.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`http://localhost:${port}/?test=1&quality=low`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  const names = await page.evaluate(() => {
    window.__rg.start();
    window.__rg.step(1 / 60, 5, false);
    const m = {};
    for (const o of window.__rg.layerObjects()) m[`${o.layer}:${o.name}`] = (m[`${o.layer}:${o.name}`] ?? 0) + 1;
    return m;
  });
  for (const [k, v] of Object.entries(names)) console.log(`${k} x${v}`);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
