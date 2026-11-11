// Item 4: bungee. Walk along the bridge deck to the platform, E, Space at a bob, ride, land, winch.
const t = (await page.evaluate(() => window.__rg.interactables())).filter((x) => /bung/i.test(x.id));
log('targets', t);
const P = t[0].position;
const side = Number(globalThis.BUNGEE_SIDE ?? 1);
await page.evaluate(([x, y, z, s]) => { const rg = window.__rg; rg.teleport(x + 6, y, z, -Math.PI / 2); rg.step(1 / 60, 30, false); }, [P[0], P[1], P[2], side]);
await H.snap('a/bungee/00');
let k = 0;
const tr = [];
let prompted = false;
await page.keyboard.down('KeyW');
for (let j = 0; j < 20; j++) {
  await st(10, j % 4 === 0);
  const s = await H.s();
  tr.push(`${s.p.map((n) => n.toFixed(1)).join(',')}`);
  const ui = await H.ui();
  if (j % 4 === 0) await H.snap(`a/bungee/w${j}`);
  if (ui.some((u) => /prompt on/.test(u))) { prompted = true; break; }
}
await page.keyboard.up('KeyW');
log('walk', tr.join(' '), 'prompt', prompted);
await tap('KeyE', 10);
log('after E', await H.s());
const ride = [];
let spaced = false;
for (let j = 0; j < 60; j++) {
  await st(30, j % 3 === 0);
  const s = await H.s();
  ride.push(`${s.p.map((n) => n.toFixed(0)).join(',')}:${s.mode[0]}`);
  if (j % 3 === 0) await H.snap(`a/bungee/r${j}`);
  if (!spaced && j === 3) { await tap('Space', 2); spaced = true; ride.push('SPACE'); }
  if (s.mode === 'walk' && j > 6) break;
}
log('ride', ride.join(' '));
log('end', await H.s(), await H.ui());
await H.snap('a/bungee/end');
