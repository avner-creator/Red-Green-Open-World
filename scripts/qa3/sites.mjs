// QA3 part 2: every attraction / mini-game / secret site, from 15 m (spawn side) and at its entrance (5 m).
// Logs the nearest E target and the HUD prompt text at the entrance.
// Usage: npm run build && RG_PORT=4353 node scripts/qa3/sites.mjs [filter]
import { open } from './lib.mjs';

const filter = process.argv[2] ?? '';
const { page, shot, close } = await open('sites', { query: '&quality=medium' });
const ANCHORS = ['carnivalRow', 'iceCream', 'bubbleArena', 'dinoRing', 'raceStart', 'foamCourse', 'airstrip', 'dragonRoost',
  'trampoline', 'launchPads', 'balloon', 'bungee', 'sillyZone', 'gearShack', 'bouncePads', 'garage', 'ranch', 'lighthouse'];
const FIXED = [
  ['secret-rooftops', 5.65, -40.5], ['secret-vault', 13.2, 27.4],
  ['mg-glowflies', -40.7, 73.2], ['mg-oddone', -47.4, -2.2], ['mg-lineup', 71.7, -89.5], ['mg-toys', -50, 13], ['mg-gates', 48, 104], ['mg-dots', 64, 8],
  ['signpost3', -10, 12.5],
];
try {
  await page.evaluate(() => {
    window.__rg.freeze(true);
    window.__rg.start();
    window.__rg.step(1 / 60, 10, false);
  });
  const sites = await page.evaluate((names) => {
    const a = window.__rg.ctx.world.anchors;
    return names.filter((n) => a[n]).map((n) => [n, a[n].position.x, a[n].position.z]);
  }, ANCHORS);
  const chests = await page.evaluate(() => window.__rg.ctx.world.chestSpots.map((c, i) => [`chest${i}`, c.position.x, c.position.z]));
  console.log('chests', JSON.stringify(chests));
  const all = [...sites, ...FIXED, chests[0]].filter((s) => s[0].includes(filter));
  for (const [name, x, z] of all) {
    for (const d of [15, 5]) {
      const info = await page.evaluate(([x, z, d]) => {
        const rg = window.__rg;
        const s = rg.ctx.world.anchors.spawn.position;
        const dx = s.x - x;
        const dz = s.z - z;
        const l = Math.hypot(dx, dz) || 1;
        const px = x + (dx / l) * d;
        const pz = z + (dz / l) * d;
        rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.3, pz, Math.atan2(x - px, z - pz));
        rg.step(1 / 60, 60, false);
        rg.step(1 / 60, 1);
        const st = rg.state();
        const p = st.playerPosition;
        let near = null;
        let nd = 1e9;
        for (const it of rg.interactables()) {
          const dd = Math.hypot(it.position[0] - p[0], it.position[2] - p[2]);
          if (dd < nd) {
            nd = dd;
            near = it.id;
          }
        }
        const prompt = document.querySelector('[data-testid="prompt"]');
        const pip = document.querySelector('[data-testid="pip-bubble"]');
        return {
          pos: p.map((v) => v.toFixed(1)).join(','),
          ground: rg.ctx.world.heightAt(px, pz).toFixed(2),
          mode: st.playerMode,
          near: near ? `${near}@${nd.toFixed(1)}m` : null,
          prompt: prompt && prompt.offsetParent ? prompt.innerText.replace(/\s+/g, ' ') : '-',
          pip: pip && pip.offsetParent ? pip.innerText : '-',
        };
      }, [x, z, d]);
      console.log(name, d, JSON.stringify(info));
      await shot(`${name}-${d}m`, { channels: d === 5 && (name.startsWith('mg-') || name.startsWith('chest') || name.startsWith('signpost')) });
    }
  }
} finally {
  await close();
}
