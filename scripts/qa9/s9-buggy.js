for (let i = 0; i < 3 && (await H.s()).mode !== 'walk'; i++) { await page.keyboard.press('KeyE'); await st(60, false); }
// stand at the workshop (tool cart), face west toward the parked buggy and away from it
for (const [nm, yaw] of [['face-buggy', Math.atan2(-18.5 - 30, 8.2 - 16)], ['face-east', Math.PI / 2]]) {
  await page.evaluate(([yaw]) => { const rg = window.__rg; rg.teleport(30, rg.ctx.world.heightAt(30, 16) + 0.4, 16, yaw); rg.step(1 / 60, 90, false); }, [yaw]);
  await H.snap(`buggy9/${nm}`);
}
const ndc = await page.evaluate(() => { const c = window.__rg.ctx.vehicles.all.find((v) => v.kind === 'car'); const v = c.position.clone().project(window.__rg.ctx.camera); return [v.x, v.y, v.z]; });
log('buggy ndc from workshop', JSON.stringify(ndc));
// walk with keys from the workshop to the buggy
const w = await H.walkTo(-18.5, 8.2, 30, 3, true);
log('walk workshop->buggy', JSON.stringify(w));
await H.snap('buggy9/arrive');
log('ui', await H.ui());
await page.keyboard.press('KeyE'); await st(60, true);
log('mode', (await H.s()).mode);
await H.snap('buggy9/in');
// drive straight 6 s with W
const tr = await hold(['KeyW'], 360, 60);
log('drive', JSON.stringify(tr.map((s) => s.playerPosition.map((v) => +v.toFixed(0)))));
await H.snap('buggy9/drive6');
await page.keyboard.press('KeyE'); await st(60, false);
log('after exit', (await H.s()).mode);
