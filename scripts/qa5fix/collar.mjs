// Histogram of head/neck-skinned vertices of a hero by height (bind pose): count, max radius, bones.
// Usage: RG_PORT=4385 node scripts/qa5fix/collar.mjs frog
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const port = Number(process.env.RG_PORT ?? 4385);
const id = process.argv[2];
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0&only=${id}`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
  console.log(
    await page.evaluate(() => {
      let mesh = null;
      window.__previewScene.traverse((o) => {
        if (o.isSkinnedMesh && o.name !== 'merged-hero-face' && !mesh) mesh = o;
      });
      const g = mesh.geometry;
      const pos = g.attributes.position;
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
      const bones = mesh.skeleton.bones;
      const rows = [];
      for (let v = 0; v < pos.count; v++) {
        let best = -1;
        let bw = 0;
        for (let k = 0; k < 4; k++)
          if (sw.getComponent(v, k) > bw) {
            bw = sw.getComponent(v, k);
            best = si.getComponent(v, k);
          }
        const name = bones[best]?.name;
        if (name !== 'Head' && name !== 'chibi-collar' && name !== 'Neck') continue;
        rows.push([pos.getY(v), Math.hypot(pos.getX(v), pos.getZ(v)), name]);
      }
      const ys = rows.map((r) => r[0]);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      const bins = Array.from({ length: 20 }, () => ({ n: 0, r: 0, names: {} }));
      for (const [y, r, n] of rows) {
        const b = bins[Math.min(19, Math.floor(((y - lo) / (hi - lo)) * 20))];
        b.n++;
        b.r = Math.max(b.r, r);
        b.names[n] = (b.names[n] ?? 0) + 1;
      }
      return `lo ${lo.toFixed(3)} hi ${hi.toFixed(3)}\n` + bins.map((b, i) => `${(i / 20).toFixed(2)} n=${b.n} rmax=${b.r.toFixed(3)} ${JSON.stringify(b.names)}`).join('\n');
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
