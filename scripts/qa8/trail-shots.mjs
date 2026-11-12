// Pip r8 (m13): look at stepping-stone trail ends. Usage: RG_PORT=4419 node scripts/qa8/trail-shots.mjs
import { open } from './lib.mjs';

const VIEWS = [
  ['dots-park', [73.5, 15], [60, 9]],
  ['dots-front', [52, 12], [62, 9]],
  ['oddone', [-33, 12], [-35.8, 0.6]],
  ['lineup', [64, -84], [71.2, -89.5]],
];
const { page, shot, close, errors } = await open('trail-shots', { query: '&quality=low&freeze=1', width: 960, height: 540 });
try {
  await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
  await page.getByTestId('play').click();
  await page.evaluate(() => { window.__rg.step(1 / 60, 30, true); window.__rg.setRemaining(3000); });
  for (const [name, [x, z], [tx, tz]] of VIEWS) {
    await page.evaluate(([x, z, tx, tz]) => {
      const rg = window.__rg;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, Math.atan2(tx - x, tz - z));
      rg.step(1 / 60, 90, true);
    }, [x, z, tx, tz]);
    await shot(name);
  }
} finally {
  console.log('errors', errors.length);
  await close();
}
