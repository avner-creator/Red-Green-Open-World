// QA3: one go at the rocket pads with 0 gems, the balloon (top framing) and walking onto the
// trampoline from the side. Usage: RG_PORT=4359 node scripts/qa3/rides.mjs
import { open } from './lib.mjs';

const { page, shot, close } = await open('rides', { query: '&quality=medium&buddy=1' });
const st = () => page.evaluate(() => {
  const s = window.__rg.state();
  const pr = document.querySelector('[data-testid="prompt"]');
  const pip = document.querySelector('[data-testid="pip-bubble"]');
  return `${s.playerMode} pos=${s.playerPosition.map((v) => v.toFixed(1)).join(',')} gems=${s.gems} wallet=${window.__rg.ctx.profile.wallet} prompt=${pr && pr.offsetParent ? pr.innerText.replace(/\s+/g, ' ') : '-'} pip=${pip && pip.offsetParent ? pip.innerText : '-'}`;
});
const goNear = (id, back = 2.5) => page.evaluate(([id, back]) => {
  const rg = window.__rg;
  const it = rg.interactables().find((i) => i.id.startsWith(id));
  if (!it) return `no ${id}; have ${rg.interactables().map((i) => i.id).join(' ')}`;
  const [x, , z] = it.position;
  const s = rg.ctx.world.anchors.spawn.position;
  const l = Math.hypot(s.x - x, s.z - z) || 1;
  const px = x + ((s.x - x) / l) * back;
  const pz = z + ((s.z - z) / l) * back;
  rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.3, pz, Math.atan2(x - px, z - pz));
  rg.step(1 / 60, 30, false);
  return it.id;
}, [id, back]);
const pressE = async () => {
  await page.evaluate(() => window.__rg.inject({ usePressed: true, use: true }));
  await page.evaluate(() => window.__rg.step(1 / 60, 1, false));
  await page.evaluate(() => window.__rg.inject(null));
};
try {
  await page.evaluate(() => {
    window.__rg.freeze(true);
    window.__rg.start();
    window.__rg.step(1 / 60, 10, false);
  });
  // Rocket pad, 0 gems
  console.log('rocket:', await goNear('rocket'), await st());
  await page.evaluate(() => window.__rg.step(1 / 60, 1));
  await shot('rocket-0-before');
  await pressE();
  for (const t of [1, 3]) {
    await page.evaluate((t) => window.__rg.step(1 / 60, t === 1 ? 59 : 120, false), t);
    await page.evaluate(() => window.__rg.step(1 / 60, 1));
    console.log(`rocket t${t}:`, await st());
    await shot(`rocket-0-t${t}`);
  }
  await page.evaluate(() => window.__rg.step(1 / 60, 600, false));
  // Balloon
  console.log('balloon:', await goNear('balloon'), await st());
  await pressE();
  for (const t of [3, 12, 25]) {
    await page.evaluate(() => window.__rg.step(1 / 60, 179, false));
    for (let k = 0; k < (t === 3 ? 0 : t === 12 ? 3 : 4); k++) await page.evaluate(() => window.__rg.step(1 / 60, 180, false));
    await page.evaluate(() => window.__rg.step(1 / 60, 1));
    console.log(`balloon t${t}:`, await st());
    await shot(`balloon-t${t}`);
  }
  await page.evaluate(() => window.__rg.step(1 / 60, 900, false));
  // Trampoline from the side: start 9 m east of the centre, walk west.
  await page.evaluate(() => {
    const rg = window.__rg;
    const a = rg.ctx.world.anchors.trampoline.position;
    const x = a.x + 9;
    const z = a.z;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    rg.inject({ moveY: 1 });
  });
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__rg.step(1 / 60, 30, false));
    console.log(`tramp ${i}:`, await st());
  }
  await page.evaluate(() => window.__rg.inject(null));
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__rg.step(1 / 60, 25, false));
    console.log(`tramp idle ${i}:`, await st());
  }
  await page.evaluate(() => window.__rg.step(1 / 60, 1));
  await shot('trampoline-side');
} finally {
  await close();
}
