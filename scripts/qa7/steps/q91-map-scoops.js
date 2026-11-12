// QA6 A: map board from spawn and from 6 m in front (bench?), then Scoops game: does Pip stay quiet?
await page.evaluate(() => { window.__rg.ctx.profile.equip('character', 'frog'); window.__rg.teleport(0, window.__rg.ctx.world.heightAt(0, 9) + 0.3, 9, Math.atan2(11 - 0, -16.5 - 9)); });
await st(60);
await H.snap('map/00-from-spawn-facing-board');
const fx = 11 + (0 - 11) * 0.3, fz = -16.5 + (9 + 16.5) * 0.3;
await page.evaluate(([x, z]) => window.__rg.teleport(x, window.__rg.ctx.world.heightAt(x, z) + 0.3, z, Math.atan2(11 - x, -16.5 - z)), [fx, fz]);
await st(60);
await H.snap('map/01-in-front');
// Scoops game
const sc = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'scoops-counter');
await H.near(sc.position[0], sc.position[2], 5, -1.2);
log('walk', await H.walkTo(sc.position[0], sc.position[2], 8, 1.5));
await page.keyboard.press('KeyE');
const lines = [];
let last = '';
for (let i = 0; i < 160; i++) {
  await st(30, false);
  const b = await page.evaluate(() => { const b = document.querySelector('[data-testid="pip-bubble"]'); return b?.classList.contains('on') ? `${b.dataset.id}|${b.dataset.text}` : ''; });
  const ph = await page.evaluate(() => window.__rgScoops.info().phase);
  if (b && b !== last) lines.push([i / 2, ph, b]);
  last = b;
  if (i === 10) await H.snap('map/02-scoops-play');
  if (i > 10 && ph === 'idle') { lines.push([i / 2, 'scoops idle']); break; }
  // child: tap E now and then (scoop buttons), random A/D
  if (i % 3 === 0) await page.keyboard.press(['KeyE', 'KeyA', 'KeyD', 'Space'][i % 4]);
}
log('pip lines during scoops', JSON.stringify(lines));
await H.snap('map/03-scoops-end');
log('scoops', JSON.stringify(await page.evaluate(() => { const s = window.__rgScoops.info(); return { phase: s.phase, cones: s.cones }; })));
