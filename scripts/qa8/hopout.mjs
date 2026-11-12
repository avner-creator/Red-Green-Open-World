// QA8: in the parked buggy at the garage, does E (instant press, and down/step/up) get the hero out?
import { open } from './lib.mjs';

const { page, close } = await open('hopout', { query: '&quality=low&freeze=1', width: 960, height: 540 });
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await page.getByTestId('play').click();
  const enter = () => page.evaluate(() => {
    const rg = window.__rg;
    rg.step(1 / 60, 30, false);
    const c = rg.ctx.vehicles.all.find((v) => v.kind === 'car');
    const p = c.position;
    const x = p.x + Math.sin(2.6) * 2.4;
    const z = p.z + Math.cos(2.6) * 2.4;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.5, z, Math.atan2(p.x - x, p.z - z));
    rg.step(1 / 60, 20, false);
  });
  const mode = () => page.evaluate(() => window.__rg.state().playerMode);
  await enter();
  await page.keyboard.press('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
  console.log('in:', await mode());
  await page.evaluate(() => window.__rg.step(1 / 60, 600, false));
  await page.keyboard.press('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
  console.log('after instant press E (parked 10 s):', await mode());
  await page.keyboard.down('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 2, false));
  await page.keyboard.up('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
  console.log('after E down/2 frames/up:', await mode());
  await page.keyboard.down('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
  await page.keyboard.up('KeyE');
  await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
  console.log('after E held 0.5 s:', await mode(), await page.evaluate(() => window.__rg.state().playerPosition.map((v) => +v.toFixed(1))));
} finally {
  await close();
}
