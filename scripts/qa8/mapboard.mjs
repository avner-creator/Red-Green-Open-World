// QA7 A (m10): the map board as a child sees it right after PLAY, at 640x360 and 1280x720; then walk 4 m
// toward it and look again. Usage: RG_PORT=4398 node scripts/qa8/mapboard.mjs
import { open } from './lib.mjs';

for (const [w, h] of [[640, 360], [1280, 720]]) {
  const { page, shot, close, errors } = await open(`mapboard-${w}`, { query: '&quality=low&freeze=1', width: w, height: h });
  try {
    await page.evaluate(() => { window.__rg.freeze(true); window.__rg.step(1 / 60, 1, true); });
    await page.getByTestId('play').click();
    await page.evaluate(() => { window.__rg.step(1 / 60, 90, true); window.__rg.setRemaining(3000); });
    await shot('00-spawn', { channels: true });
    const board = await page.evaluate(() => { const p = window.__rg.state().playerPosition; const v = new window.__rg.ctx.camera.position.constructor(8.25, window.__rg.ctx.world.heightAt(8.25, 3.75) + 1.5, 3.75); const s = v.clone().project(window.__rg.ctx.camera); return { pos: [v.x, v.y, v.z], dist: Math.hypot(v.x - p[0], v.z - p[2]), ndc: [s.x, s.y, s.z] }; });
    console.log(w, 'board', JSON.stringify(board));
    if (board) {
      // turn to face the board (a child turns the camera), then walk toward it with W until 5 m away.
      await page.evaluate(([x, z]) => { const rg = window.__rg; const p = rg.state().playerPosition; rg.teleport(p[0], p[1] + 0.1, p[2], Math.atan2(x - p[0], z - p[2])); rg.step(1 / 60, 60, true); }, [board.pos[0], board.pos[2]]);
      await shot('01-facing', { channels: true });
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 40; i++) {
        const d = await page.evaluate(([x, z]) => { window.__rg.step(1 / 60, 10, false); const p = window.__rg.state().playerPosition; return Math.hypot(x - p[0], z - p[2]); }, [board.pos[0], board.pos[2]]);
        if (d < 4.5) break;
      }
      await page.keyboard.up('KeyW');
      await page.evaluate(() => window.__rg.step(1 / 60, 30, true));
      await shot('02-near', { channels: true });
    }
  } finally {
    console.log('errors', errors.length);
    await close();
  }
}
