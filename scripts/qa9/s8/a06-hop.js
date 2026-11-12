// QA8 A/m10: a patient stone hopper on a secret path: stand still on a stone, face the next, tap jump,
// steer at the next stone in the air (fine steering every 2 frames), let go of W above it, settle.
const I = () => page.evaluate(() => window.__rgSecrets.info());
const paths = globalThis.QA_PATHS ?? [0, 1];
const steer = async (tx, tz, release) => {
  const s = await page.evaluate(([x, z]) => {
    const ctx = window.__rg.ctx;
    const hp = window.__rg.state().playerPosition;
    const f = ctx.camera.getWorldDirection(new ctx.camera.position.constructor());
    return { hp, f: [f.x, f.z], d: Math.hypot(x - hp[0], z - hp[2]) };
  }, [tx, tz]);
  const want = new Set();
  if (s.d > release) {
    const dx = (tx - s.hp[0]) / s.d;
    const dz = (tz - s.hp[2]) / s.d;
    const fl = Math.hypot(s.f[0], s.f[1]) || 1;
    const fx = s.f[0] / fl;
    const fz = s.f[1] / fl;
    const fwd = dx * fx + dz * fz;
    const right = dx * -fz + dz * fx;
    if (fwd > 0.38) want.add('KeyW');
    if (fwd < -0.38) want.add('KeyS');
    if (right > 0.38) want.add('KeyD');
    if (right < -0.38) want.add('KeyA');
  }
  return { s, want };
};
const held = new Set();
const setKeys = async (want) => {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
};
const out = [];
for (const k of paths) {
  let p = (await I()).paths[k];
  const S = p.stones;
  await page.evaluate(([x, z, tx, tz]) => { const rg = window.__rg; rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, Math.atan2(tx - x, tz - z)); rg.step(1 / 60, 30, false); }, [p.start[0], p.start[1], S[0][0], S[0][2]]);
  const onStone = (hp) => S.findIndex((t) => Math.hypot(hp[0] - t[0], hp[2] - t[2]) < t[3] + 0.25 && Math.abs(hp[1] - t[1]) < 1.2);
  let cur = -1;
  let maxI = -1;
  let jumps = 0;
  let falls = 0;
  const t0 = Date.now();
  let gameT = 0;
  while (jumps < (globalThis.QA_MAXJ ?? 120)) {
    const tgt = S[Math.min(cur + 1, S.length - 1)];
    if (cur >= S.length - 1) break;
    // face + small walk-up if far (first stone from the ground)
    jumps++;
    await page.keyboard.down('Space');
    let frames = 0;
    let landed = false;
    while (frames < 150) {
      const { s, want } = await steer(tgt[0], tgt[2], 0.25);
      await setKeys(want);
      if (frames === 6) await page.keyboard.up('Space');
      await st(2, false);
      frames += 2;
      if (frames > 12) {
        const g = await page.evaluate(() => window.__rg.ctx.player.grounded);
        if (g) { landed = true; break; }
      }
    }
    await page.keyboard.up('Space');
    await setKeys(new Set());
    await st(20, false);
    gameT += (frames + 20) / 60;
    const hp = (await H.s()).p;
    const j = onStone(hp);
    if (j >= 0) { cur = j; maxI = Math.max(maxI, j); } else {
      const info = (await I()).paths[k];
      if (info.checkpoint >= 0 && onStone((await H.s()).p) < 0) { /* on ground, path restarts */ }
      falls++;
      cur = onStone((await H.s()).p);
    }
    if (jumps % 15 === 0) await H.snap(`paths9/${k}-j${jumps}`);
    if (globalThis.QA_HOPLOG) log(`j${jumps} tgt=${Math.min(cur + 1, S.length - 1)} landed=${landed} at=${hp.join(',')} on=${j} cur=${cur}`);
  }
  log(k, p.id, 'stones', S.length, 'checkpoints', JSON.stringify(p.checkpoints), 'max stone', maxI, 'jumps', jumps, 'falls', falls, 'gameSecs', gameT.toFixed(0), 'returns', (await I()).paths[k].returns);
  log(k, 'to pedestal', JSON.stringify(await H.walkTo(p.pedestal[0], p.pedestal[2], 4, 0.6)));
  await tap('KeyE', 60); await st(90, false);
  p = (await I()).paths[k];
  await H.snap(`paths9/${k}-end`);
  out.push([p.id, p.claimed, maxI, jumps, falls]);
}
log(JSON.stringify(out));
