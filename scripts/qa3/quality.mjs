// QA3 part 4: Low vs Medium from the same spots (spawn, plaza looking out, mid-island), plus a
// plaza chest approached from three sides. Usage: RG_PORT=4358 node scripts/qa3/quality.mjs low|medium
import { open } from './lib.mjs';

const q = process.argv[2] ?? 'low';
const { page, shot, close } = await open(`quality-${q}`, { query: `&quality=${q}&buddy=1` });
const VIEWS = [
  ['spawn', null],
  ['plaza-north', [0, 0, -1]],
  ['plaza-west', [-1, 0, 0]],
  ['plaza-east', [1, 0, 0]],
  ['mid-island', [30, 30, -1]],
];
try {
  await page.evaluate(() => {
    window.__rg.freeze(true);
    window.__rg.start();
    window.__rg.step(1 / 60, 10, false);
  });
  for (const [name, v] of VIEWS) {
    await page.evaluate((v) => {
      const rg = window.__rg;
      const s = rg.ctx.world.anchors.spawn.position;
      if (v) {
        const [x, z, yawSign] = v.length === 3 && Math.abs(v[0]) <= 1 ? [s.x, s.z, Math.atan2(v[0], v[2])] : [v[0], v[1], Math.PI];
        rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, yawSign);
      } else rg.teleport(s.x, s.y + 0.3, s.z);
      rg.step(1 / 60, 60, false);
      rg.step(1 / 60, 1);
    }, v);
    await shot(name);
  }
  // Chest 0 on the plaza, from three sides at 3 m.
  for (const [side, a] of [['south', 0], ['east', Math.PI / 2], ['north', Math.PI]]) {
    const info = await page.evaluate((a) => {
      const rg = window.__rg;
      const c = rg.ctx.world.chestSpots[0].position;
      const x = c.x + Math.sin(a) * 3.2;
      const z = c.z + Math.cos(a) * 3.2;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, Math.atan2(c.x - x, c.z - z));
      rg.step(1 / 60, 120, false);
      rg.step(1 / 60, 1);
      const pr = document.querySelector('[data-testid="prompt"]');
      const pip = document.querySelector('[data-testid="pip-bubble"]');
      return { prompt: pr && pr.offsetParent ? pr.innerHTML.slice(0, 200) : '-', pip: pip && pip.offsetParent ? pip.innerText : '-' };
    }, a);
    console.log('chest', side, JSON.stringify(info));
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.__rg.step(1 / 60, 30, true));
    await shot(`chest-${side}`, { channels: side === 'east' });
  }
} finally {
  await close();
}
