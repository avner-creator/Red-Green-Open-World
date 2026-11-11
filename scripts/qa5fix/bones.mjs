// Dump a hero's bones (with world positions at idle) and meshes from the character preview page.
// Usage: RG_PORT=4380 node scripts/qa5fix/bones.mjs fox [alpaca ...]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const port = Number(process.env.RG_PORT ?? 4380);
const ids = process.argv.slice(2);
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0&only=${ids.join(',')}`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
  const r = await page.evaluate(() => {
    const scene = window.__previewScene;
    const out = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        const sk = o.skeleton;
        const si = o.geometry.attributes.skinIndex;
        const sw = o.geometry.attributes.skinWeight;
        const cnt = new Array(sk.bones.length).fill(0);
        for (let v = 0; v < si.count; v++) for (let k = 0; k < 4; k++) if (sw.getComponent(v, k) > 0.5) cnt[si.getComponent(v, k)]++;
        out.push(`MESH ${o.name} mat=${o.material.name} verts=${si.count}`);
        out.push('  ' + sk.bones.map((b, i) => `${b.parent?.name}>${b.name}${cnt[i] ? '[' + cnt[i] + ']' : ''}@${b.getWorldPosition(new b.position.constructor()).y.toFixed(2)} s${b.scale.x.toFixed(2)},${b.scale.y.toFixed(2)}`).join(' '));
      } else if (o.isMesh && o.name !== 'face-part') out.push(`mesh ${o.name} mat=${o.material?.name}`);
    });
    return out;
  });
  console.log(r.join('\n'));
} finally {
  await browser.close();
  await server.close();
}
