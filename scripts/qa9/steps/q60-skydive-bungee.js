// QA6 B: balloon skydive as a child (walk in, wait, Space to jump when Pip/the prompt says, steer W,
// Space for chute), then bungee (walk up the tower stairs? teleport near the board, walk on, E/W).
const ia = (await page.evaluate(() => window.__rg.interactables())).find((i) => i.id === 'balloon');
await H.near(ia.position[0], ia.position[2], 10, -Math.PI / 2);
log('walk', await H.walkTo(ia.position[0], ia.position[2], 12, 0.4));
const tl = [];
let jumped = false, chute = false, shots = 0;
for (let j = 0; j < 240; j++) {
  await st(30, false);
  const s = await H.s();
  const ui = (await H.ui()).filter((x) => !/hud:|toasts/.test(x)).join('|').slice(0, 80);
  const pip = await page.evaluate(() => { const b = document.querySelector('[data-testid="pip-bubble"]'); return b?.classList.contains('on') ? `${b.dataset.id}:${b.dataset.action}` : ''; });
  tl.push(`${(j / 2).toFixed(1)} y${s.p[1].toFixed(0)} ${s.mode} ${ui} ${pip}`);
  // child: press Space when Pip/prompt shows the jump action (or after 3 s at the top)
  if (!jumped && (pip.endsWith(':jump') || /jump|space/i.test(ui))) { await page.keyboard.press('Space'); jumped = true; tl.push('>> SPACE (jump)'); }
  if (jumped && !chute && /chute|parachute/i.test(pip + ui)) { await page.keyboard.press('Space'); chute = true; tl.push('>> SPACE (chute)'); }
  if (jumped) await page.keyboard.down('KeyW');
  if (j % 8 === 0 && shots < 14) { shots++; await H.snap('sky6/t' + String(j).padStart(3, '0')); }
  if (j > 20 && s.mode === 'walk') break;
}
await page.keyboard.up('KeyW');
await st(60);
await H.snap('sky6/99-landed');
log(tl.join('\n'));
log('skydive end', await H.s(), await H.ui());
