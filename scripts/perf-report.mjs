// Render-cost report: draw calls and triangles per quality level and named view, split by pass:
//   main   = the world scene (ctx.scene) drawn into the colour buffer
//   layer  = the vision layer passes (weak-eye + strong-eye objects, `Vision.*` groups)
//   post   = full-screen passes (bloom, grade, SMAA, the dichoptic compositor)
//   shadow = the sun's shadow map
// The budget (config below) applies to the frame without shadows: main + layer + post.
//
// Deterministic by construction: a fresh browser profile per quality (default hero, the frog, no
// wardrobe items; the hero is checked), time frozen and advanced only by fixed steps, views run in
// one fixed order, and a view is counted only after the network is idle (every streamed model,
// friend and rival fetched) and the counts stayed identical for STABLE consecutive samples.
//
// Usage: npm run build && RG_PORT=4380 node scripts/perf-report.mjs [low,medium,high]
//          [--views=a,b|--views=round] [--detail] [--json[=file]] [--check] [--list]
//   --detail  costliest top-level owners and heaviest meshes per view
//   --json    machine-readable rows on stdout (or into the file)
//   --check   exit 1 when a view is over budget (Low/Medium; High is not budgeted)
//   --list    print the view names and exit
// Subsets (--views) run in the same order, but NPCs and Pip have walked a different amount by then,
// so a subset can differ from the full run by a draw or two; the full run is the reference.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { writeFileSync } from 'node:fs';

/** Frame budget without shadows (main + layer + post). */
export const BUDGET = { low: { draws: 130, tris: 280_000 }, medium: { draws: 230, tris: 500_000 } };
/** Consecutive identical samples (10 fixed steps apart) before a view is counted. */
const STABLE = 3;
const MAX_SAMPLES = 14;

const port = Number(process.env.RG_PORT ?? 4174);
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => args.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);
const detail = flag('--detail');
const check = flag('--check');
const jsonOut = flag('--json') ? '-' : opt('--json');
const qualities = (args.find((a) => !a.startsWith('--')) ?? 'low,medium').split(',');
const viewArg = opt('--views');

/** Landmarks of the seven island-fill zones (copy of src/world/fill/zone-data.ts FILL_ZONES). */
const FILL_ZONES = [
  { id: 'funfair', x: 128, z: -64 }, { id: 'farm', x: -86, z: 106 }, { id: 'cove', x: 96, z: 114 },
  { id: 'lookout', x: 48, z: -132 }, { id: 'rainbow', x: 10, z: 138 }, { id: 'huts', x: -138, z: 54 },
  { id: 'picnic', x: -48, z: -56 },
];

/** Groups of owners (top-level object names; vision layer objects by their registered name). */
const GROUPS = {
  player: ['player', 'skill-sparkles', 'skill-shockwave', 'skill-speedlines'],
  pip: ['pip', 'pip-*', 'buddy*'],
  secrets: ['secret-*', 'vault-*'],
};

/**
 * Views, in run order. Idle views first (no round has run yet), then rounds; every round view is
 * followed by a reset (R twice, exit hooks). `round: true` marks a view taken during a round/ride.
 */
const VIEWS = [
  ['spawn', false], ['plaza-shack', false], ['park', false], ['garage', false], ['balloon', false], ['ranch', false],
  ['bungee', false], ['silly', false], ['silly-side', false], ['road-west', false], ['lighthouse', false],
  ['lh-top', false], ['carnival', false], ['arena', false], ['foam', false], ['foam-blowers', false],
  ['airstrip', false], ['race', false], ['icecream', false], ['vault', false], ['chest', false],
  ['zone-funfair', false], ['zone-farm', false], ['zone-cove', false], ['zone-lookout', false],
  ['zone-rainbow', false], ['zone-huts', false], ['zone-picnic', false],
  ['glasses-gates', false], ['glasses-oddone', false], ['glasses-dotsigns', false], ['glasses-toys', false],
  ['glasses-glowflies', false], ['glasses-lineup', false],
  ['trampoline-round', true], ['rocket-ride', true], ['balloon-ride', true], ['bungee-round', true],
  ['silly-round', true], ['race-round', true], ['sumo-round', true], ['soccer-round', true],
  ['carnival-round', true], ['scoops-round', true], ['foam-round', true], ['plane-contest', true],
  ['dragon-tour', true],
  ['glasses-gates-round', true], ['glasses-oddone-round', true], ['glasses-dotsigns-round', true],
  ['glasses-toys-round', true], ['glasses-glowflies-round', true], ['glasses-lineup-round', true],
];

if (flag('--list')) {
  for (const [v, r] of VIEWS) console.log(`${v}${r ? '  (round)' : ''}`);
  process.exit(0);
}
const wanted = viewArg === 'round' ? VIEWS.filter((v) => v[1]) : viewArg === 'idle' ? VIEWS.filter((v) => !v[1]) : viewArg ? VIEWS.filter((v) => viewArg.split(',').includes(v[0])) : VIEWS;
if (viewArg && !wanted.length) throw new Error(`no such view: ${viewArg} (see --list)`);

/** Installed in the page once: counters, views, resets. Serialised by Playwright (self-contained). */
function install(groups) {
  const rg = window.__rg;
  const ctx = rg.ctx;
  const r = ctx.renderer;
  const W = window;
  rg.freeze(true);
  rg.start();
  rg.setRemaining(36000);
  rg.step(1 / 60, 5, false);
  rg.step(1 / 30, 360, false); // let the wordless tutorial finish
  r.info.autoReset = false;

  // ── Counting: every draw goes through renderBufferDirect (the shadow map's too). ──
  const sm = r.shadowMap;
  const origSm = sm.render;
  let inShadow = false;
  sm.render = function (...a) {
    inShadow = true;
    try {
      origSm.apply(this, a);
    } finally {
      inShadow = false;
    }
  };
  let tally = null;
  const sceneRenders = new Map();
  const origRender = r.render;
  r.render = function (scene, camera) {
    if (tally) sceneRenders.set(scene, (sceneRenders.get(scene) ?? 0) + 1);
    return origRender.call(this, scene, camera);
  };
  const origRBD = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (!tally) return origRBD.call(this, camera, scene, geometry, material, object, group);
    const t0 = r.info.render.triangles;
    origRBD.call(this, camera, scene, geometry, material, object, group);
    const tris = r.info.render.triangles - t0;
    let top = object;
    let second = object;
    while (top.parent && top.parent.parent) {
      second = top;
      top = top.parent;
    }
    const root = top.parent ?? top;
    const nm = (o) => o.name || o.type;
    const isVision = nm(top).startsWith('Vision.');
    const pass = inShadow ? 'shadow' : isVision ? 'layer' : root === ctx.scene ? 'main' : 'post';
    const p = tally.passes[pass];
    p.draws++;
    p.tris += tris;
    if (isVision) tally.passes[nm(top).includes('Strong') ? 'strong' : 'weak'].draws++;
    if (pass === 'post') return;
    const owner = isVision && second !== top ? nm(second) : nm(top);
    const ownerKey = isVision ? `${nm(top).replace('Vision.', '')}:${owner}` : owner;
    let o = tally.owners.get(ownerKey);
    if (!o) tally.owners.set(ownerKey, (o = { owner, main: 0, mainTris: 0, layer: 0, layerTris: 0, shadow: 0, shadowTris: 0 }));
    const k = pass === 'shadow' ? 'shadow' : pass === 'layer' ? 'layer' : 'main';
    o[k]++;
    o[k + 'Tris'] += tris;
    if (tally.meshes && pass !== 'shadow') {
      const mk = `${ownerKey}${second !== top ? ' > ' + nm(second) : ''}${object !== second && object !== top ? ' > ' + nm(object) : ''}${object.frustumCulled ? '' : ' [nofc]'}${object.castShadow ? ' [cast]' : ''}`;
      let m = tally.meshes.get(mk);
      if (!m) tally.meshes.set(mk, (m = { name: mk, draws: 0, tris: 0, r: object.geometry?.boundingSphere?.radius ?? 0 }));
      m.draws++;
      m.tris += tris;
    }
  };
  const zero = () => ({ draws: 0, tris: 0 });
  const measure = (meshes = false) => {
    tally = { passes: { main: zero(), layer: zero(), post: zero(), shadow: zero(), weak: zero(), strong: zero() }, owners: new Map(), meshes: meshes ? new Map() : null };
    sceneRenders.clear();
    r.info.reset();
    rg.render();
    const t = tally;
    tally = null;
    return t;
  };

  // ── Placing the hero / camera. ──
  const A = ctx.world.anchors;
  const ground = (x, z) => ctx.world.heightAt(x, z);
  const at = (x, z, tx, tz, y) => rg.teleport(x, y ?? ground(x, z) + 0.2, z, Math.atan2(tx - x, tz - z));
  const standBack = (a, dist) => {
    const x = a.position.x + Math.sin(a.yaw) * dist;
    const z = a.position.z + Math.cos(a.yaw) * dist;
    rg.teleport(x, ground(x, z) + 0.2, z, a.yaw + Math.PI);
  };
  /** Stand `dist` metres from `a` on the side of `from`, facing `a`. */
  const lookAt = (a, from, dist) => {
    const dx = from.x - a.position.x;
    const dz = from.z - a.position.z;
    const l = Math.hypot(dx, dz) || 1;
    at(a.position.x + (dx / l) * dist, a.position.z + (dz / l) * dist, a.position.x, a.position.z);
  };
  const pressUse = () => {
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
  };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  /** Real-time wait (streamed friends/rivals) while stepping, until `done()` or 60 s. */
  const until = async (done, dt = 1 / 60) => {
    for (let i = 0; i < 600 && !done(); i++) {
      await sleep(100);
      rg.step(dt, 1, false);
    }
  };
  const zone = (id) => {
    // Seven island-fill zones: stand 12 m out from the landmark (away from the island centre),
    // looking back across it at the island; inland at 18 m when that spot is in the sea.
    const z = W.__rgPerfZones?.find((q) => q.id === id);
    if (!z) return;
    const l = Math.hypot(z.x, z.z) || 1;
    const ox = z.x + (z.x / l) * 12;
    const oz = z.z + (z.z / l) * 12;
    if (ground(ox, oz) > 0.4) at(ox, oz, 0, 0);
    else at(z.x - (z.x / l) * 18, z.z - (z.z / l) * 18, z.x, z.z);
  };
  const glasses = (id, round) => async () => {
    const g = W.__rgGlasses;
    const v = g?.boothPadView(id);
    if (!v) return 'missing';
    rg.teleport(v.x, v.y + 0.05, v.z, v.yaw);
    rg.step(1 / 60, 50, false);
    if (!round) return;
    g.boothPlay(id);
    rg.step(1 / 60, 360, false); // past the 3-2-1
  };
  const buggyRoot = ctx.scene.getObjectByName('buggy');
  const views = {
    spawn: () => rg.teleport(A.spawn.position.x, ground(A.spawn.position.x, A.spawn.position.z) + 0.2, A.spawn.position.z, A.spawn.yaw),
    // Plaza side of the Gear Shack (its gift board, the plaza chest and posts in view).
    'plaza-shack': () => lookAt(A.gearShack, A.spawn.position, 10),
    park: () => lookAt(A.trampoline, A.bouncePads.position, 16),
    garage: () => (buggyRoot ? lookAt({ position: buggyRoot.position }, A.spawn.position, 8) : standBack(A.garage, 10)),
    balloon: () => standBack(A.balloon, 26),
    ranch: () => lookAt(A.ranch, A.spawn.position, 14),
    bungee: () => lookAt(A.bungee, A.bungeeLanding.position, 18),
    silly: () => lookAt(A.sillyZone, A.spawn.position, 16),
    'silly-side': () => at(-22, 88, 8, 98),
    'road-west': () => at(-20, 9, -52, 30),
    lighthouse: () => at(-43, -127, -62, -134),
    'lh-top': () => at(-65.6, -134.6, -62, -134, ground(-62, -134) + 1.1 + 13.2 + 0.25 + 0.3),
    carnival: () => lookAt(A.carnivalRow, A.spawn.position, 20),
    arena: () => at(25, 38, 25, 58),
    foam: () => at(-25.5, -10, -25.5, -40),
    // Foam course: on the cannon walkway, looking along the three blowers.
    'foam-blowers': () => {
      const f = W.__rgFoam;
      if (!f) return 'missing';
      const [x, y, z] = f.toWorld(-6.4, 1.2, 8);
      const [tx, , tz] = f.toWorld(-6.4, 0, 20);
      at(x, z, tx, tz, y);
    },
    airstrip: () => at(-12, 20, -12, 46),
    race: () => lookAt(A.raceStart, A.spawn.position, 12),
    icecream: () => lookAt(A.iceCream, A.spawn.position, 12),
    vault: () => {
      const d = W.__rgSecrets?.info().doors[0];
      if (!d) return 'missing';
      lookAt({ position: { x: d.x, z: d.z } }, { x: d.x + Math.sin(d.yaw) * 20, z: d.z + Math.cos(d.yaw) * 20 }, 12);
    },
    chest: () => {
      const c = W.__rgChests;
      if (!c) return 'missing';
      const [x, z] = c.sidePoint(0, 0, 6);
      const i = c.info()[0];
      at(x, z, i.x, i.z);
    },
    'zone-funfair': () => zone('funfair'),
    'zone-farm': () => zone('farm'),
    'zone-cove': () => zone('cove'),
    'zone-lookout': () => zone('lookout'),
    'zone-rainbow': () => zone('rainbow'),
    'zone-huts': () => zone('huts'),
    'zone-picnic': () => zone('picnic'),
    'glasses-gates': glasses('gates', false),
    'glasses-oddone': glasses('oddone', false),
    'glasses-dotsigns': glasses('dotsigns', false),
    'glasses-toys': glasses('toys', false),
    'glasses-glowflies': glasses('glowflies', false),
    'glasses-lineup': glasses('lineup', false),
    // ── During a round / ride ──
    'trampoline-round': () => {
      const c = W.__rgThrills?.trampoline();
      if (!c) return 'missing';
      rg.teleport(c.x, c.y + 3, c.z, 0);
      rg.step(1 / 60, 400, false); // bouncing high
    },
    'rocket-ride': () => {
      ctx.profile.earn(10, 'test');
      W.__rgThrills?.launchRocket(0);
      rg.step(1 / 60, 150, false); // mid-flight
    },
    'balloon-ride': () => {
      const a = A.balloon.position;
      rg.teleport(a.x + 1.7, ground(a.x, a.z) + 0.4, a.z, -Math.PI / 2);
      rg.step(1 / 60, 10, false);
      pressUse();
      rg.step(1 / 30, 360, false); // 12 s of the climb
    },
    'bungee-round': () => {
      const b = W.__rgBungee;
      const info = b?.info();
      if (!info) return 'missing';
      rg.teleport(info.board[0] + 2.6, info.deck + 0.3, info.board[2], -Math.PI / 2);
      rg.step(1 / 60, 20, false);
      pressUse();
      for (let i = 0; i < 900 && b.phase() !== 'fall'; i++) rg.step(1 / 30, 1, false);
      rg.step(1 / 30, 30, false);
    },
    'silly-round': () => {
      const s = W.__rgSilly;
      if (!s) return 'missing';
      const [x, , z] = s.startPad();
      rg.teleport(x, ground(x, z) + 0.2, z, 0);
      rg.step(1 / 60, 10, false);
      s.startRound();
      rg.step(1 / 60, 300, false);
    },
    'race-round': async () => {
      const race = W.__rgRace;
      if (!race) return 'missing';
      race.setLaps(3);
      race.start();
      race.autopilot(true);
      await until(() => race.state().phase === 'race');
      rg.step(1 / 60, 600, false); // 10 s into the race
    },
    'sumo-round': async () => {
      const g = W.__rgDinoSumo;
      if (!g) return 'missing';
      const [x, y, z] = g.booth();
      rg.teleport(x, y + 0.2, z, 0);
      rg.step(1 / 60, 10, false);
      g.start();
      await until(() => g.phase() !== 'loading');
      rg.step(1 / 60, 300, false);
    },
    'soccer-round': async () => {
      const g = W.__rgBubbleBall;
      if (!g) return 'missing';
      const [x, y, z] = g.booth();
      rg.teleport(x, y + 0.2, z, 0);
      rg.step(1 / 60, 10, false);
      g.start();
      await until(() => g.phase() !== 'loading');
      rg.step(1 / 60, 300, false);
    },
    'carnival-round': async () => {
      const c = W.__rgCarnival;
      const booth = c?.info().booths.find((b) => b.playable);
      if (!booth) return 'missing';
      rg.teleport(booth.stand[0], booth.stand[1] + 0.2, booth.stand[2], booth.yaw);
      rg.step(1 / 60, 10, false);
      c.start(booth.id);
      c.autopilot(true);
      await until(() => c.info().phase !== 'loading');
      rg.step(1 / 60, 300, false);
    },
    'scoops-round': () => {
      const t = rg.interactables().find((q) => q.id === 'scoops-counter');
      if (!t) return 'missing';
      rg.teleport(t.position[0], ground(t.position[0], t.position[2]) + 0.2, t.position[2], 0);
      rg.step(1 / 60, 20, false);
      pressUse();
      rg.step(1 / 60, 240, false);
    },
    'foam-round': () => {
      const f = W.__rgFoam;
      if (!f) return 'missing';
      const [bx, by, bz] = f.booth();
      rg.teleport(bx, by - 1.1, bz, 0);
      rg.step(1 / 60, 10, false);
      f.start();
      f.autopilot('main');
      for (let i = 0; i < 1500 && f.sim.cp < 3; i++) rg.step(1 / 60, 6, false);
      rg.step(1 / 60, 60, false); // at the blowers, mid-run
    },
    'plane-contest': () => {
      const sky = W.__rgSky;
      if (!sky) return 'missing';
      rg.teleport(-16, ground(-16, 41) + 0.3, 41, Math.PI / 2);
      rg.step(1 / 60, 10, false);
      pressUse();
      for (let i = 0; i < 600 && sky.plane.phase !== 'race'; i++) rg.step(1 / 30, 1, false);
      rg.step(1 / 30, 150, false);
    },
    'dragon-tour': () => {
      const sky = W.__rgSky;
      if (!sky) return 'missing';
      sky.dragon.tourSeconds = 30;
      rg.teleport(-32.6, ground(-32.6, -125.2) + 0.3, -125.2, Math.PI);
      rg.step(1 / 60, 10, false);
      pressUse();
      for (let i = 0; i < 900 && sky.dragon.phase !== 'tour'; i++) rg.step(1 / 30, 1, false);
      rg.step(1 / 30, 240, false);
    },
    'glasses-gates-round': glasses('gates', true),
    'glasses-oddone-round': glasses('oddone', true),
    'glasses-dotsigns-round': glasses('dotsigns', true),
    'glasses-toys-round': glasses('toys', true),
    'glasses-glowflies-round': glasses('glowflies', true),
    'glasses-lineup-round': glasses('lineup', true),
  };
  /** Leave whatever round/ride is running: exit hooks, then R twice, back at spawn. */
  const reset = () => {
    try {
      W.__rgRace?.exit();
      W.__rgCarnival?.exit();
      for (const id of ['gates', 'oddone', 'dotsigns', 'toys', 'glowflies', 'lineup']) W.__rgGlasses?.boothCancel(id);
    } catch {
      /* a hook without a running round */
    }
    for (let k = 0; k < 2; k++) {
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 90, false);
    }
    views.spawn();
    rg.step(1 / 60, 60, false);
  };

  const match = (name, pats) => pats.some((n) => (n.endsWith('*') ? name.startsWith(n.slice(0, -1)) : name === n));
  const summarise = (t) => {
    const p = t.passes;
    const parts = {};
    for (const [g, pats] of Object.entries(groups)) {
      const s = { draws: 0, tris: 0, shadow: 0 };
      for (const o of t.owners.values()) {
        if (!match(o.owner, pats)) continue;
        s.draws += o.main + o.layer;
        s.tris += o.mainTris + o.layerTris;
        s.shadow += o.shadow;
      }
      parts[g] = s;
    }
    const mainRenders = sceneRenders.get(ctx.scene) ?? 0;
    return {
      frame: { draws: p.main.draws + p.layer.draws + p.post.draws, tris: p.main.tris + p.layer.tris + p.post.tris },
      main: p.main, layer: { ...p.layer, weak: p.weak.draws, strong: p.strong.draws }, post: p.post, shadow: p.shadow, parts, mainRenders,
    };
  };
  W.__perf = {
    async go(name) {
      const f = views[name];
      if (!f) return 'unknown';
      const res = await f();
      rg.step(1 / 60, 90, false); // camera and Pip settle
      return res ?? 'ok';
    },
    /** 10 more fixed steps, compile anything new, then count one frame. */
    sample() {
      rg.step(1 / 60, 10, false);
      rg.render();
      return summarise(measure());
    },
    detail() {
      const t = measure(true);
      const owners = [...t.owners.entries()].map(([k, o]) => ({ name: k, ...o }));
      return {
        top: owners.filter((o) => o.main + o.layer >= 2).sort((a, b) => b.main + b.layer - (a.main + a.layer) || b.mainTris - a.mainTris).slice(0, 25),
        topTris: owners.sort((a, b) => b.mainTris + b.layerTris - (a.mainTris + a.layerTris)).slice(0, 12),
        meshes: [...t.meshes.values()].sort((a, b) => b.tris - a.tris).slice(0, 20),
        shadowTop: owners.filter((o) => o.shadow > 0).sort((a, b) => b.shadow - a.shadow).slice(0, 12),
      };
    },
    reset,
    info: () => ({
      hero: ctx.player.characterId,
      equipped: Object.entries(ctx.profile.data?.equipped ?? {}).filter(([k, v]) => v && k !== 'character' && k !== 'power').map(([k, v]) => `${k}=${v}`),
      quality: ctx.settings.get().quality,
      shadows: ctx.renderer.shadowMap.enabled && ctx.scene.children.some((o) => o.isDirectionalLight && o.castShadow),
      size: [ctx.renderer.domElement.width, ctx.renderer.domElement.height],
    }),
  };
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
const rows = [];
const log = jsonOut === '-' ? (...a) => console.error(...a) : (...a) => console.log(...a);
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  for (const quality of qualities) {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    let pending = 0;
    let lastNet = Date.now();
    page.on('request', () => {
      pending++;
      lastNet = Date.now();
    });
    const done = () => {
      pending = Math.max(0, pending - 1);
      lastNet = Date.now();
    };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    const netIdle = async () => {
      for (let i = 0; i < 600 && (pending > 0 || Date.now() - lastNet < 400); i++) await new Promise((r) => setTimeout(r, 100));
    };
    await page.goto(`http://localhost:${port}/?test=1&quality=${quality}`);
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
    await page.evaluate((z) => (window.__rgPerfZones = z), FILL_ZONES);
    await page.evaluate(install, GROUPS);
    await netIdle();
    const info = await page.evaluate(() => window.__perf.info());
    log(`[${quality}] hero=${info.hero} items=[${info.equipped.join(',')}] quality=${info.quality} shadows=${info.shadows} canvas=${info.size.join('x')}`);
    if (info.hero !== 'frog' || info.equipped.length || info.quality !== quality) {
      throw new Error(`[${quality}] not the reference setup (want frog, no items, quality ${quality})`);
    }
    for (const [view, round] of wanted) {
      const status = await page.evaluate((v) => window.__perf.go(v), view);
      if (status !== 'ok') log(`[${quality}] ${view}: ${status}`);
      const samples = [];
      let stable = false;
      for (let i = 0; i < MAX_SAMPLES && !stable; i++) {
        await netIdle();
        samples.push(await page.evaluate(() => window.__perf.sample()));
        const last = samples.slice(-STABLE);
        const key = (s) => `${s.main.draws}/${s.main.tris}/${s.layer.draws}/${s.layer.tris}/${s.shadow.draws}`;
        stable = pending === 0 && last.length === STABLE && last.every((s) => key(s) === key(last[0]));
      }
      // Never stable (something animated keeps changing what is drawn): count the worst recent sample.
      const tail = samples.slice(-STABLE);
      const pick = stable ? tail[tail.length - 1] : tail.reduce((a, b) => (b.frame.draws > a.frame.draws || (b.frame.draws === a.frame.draws && b.frame.tris > a.frame.tris) ? b : a));
      const row = { quality, view, round, stable, samples: samples.length, status, ...pick };
      if (detail) row.detail = await page.evaluate(() => window.__perf.detail());
      rows.push(row);
      if (round) await page.evaluate(() => window.__perf.reset());
      const b = BUDGET[quality];
      const over = b && (pick.frame.draws > b.draws || pick.frame.tris > b.tris);
      log(`${quality.padEnd(6)} ${view.padEnd(24)} ${String(pick.frame.draws).padStart(4)} / ${fmt(pick.frame.tris).padStart(5)}${over ? ' OVER' : '     '}${stable ? ' ' : '~'}  main ${pick.main.draws}/${fmt(pick.main.tris)}  layer ${pick.layer.draws}/${fmt(pick.layer.tris)} (w${pick.layer.weak} s${pick.layer.strong})  post ${pick.post.draws}  shadow ${pick.shadow.draws}/${fmt(pick.shadow.tris)}  [hero ${pick.parts.player.draws}/${fmt(pick.parts.player.tris)} pip ${pick.parts.pip.draws}/${fmt(pick.parts.pip.tris)}]${pick.mainRenders !== 1 ? ` mainRenders=${pick.mainRenders}` : ''}`);
      if (detail) printDetail(row);
    }
    if (errors.length) log(`[${quality}] page errors:`, errors.slice(0, 3));
    await context.close();
  }
} finally {
  await browser?.close();
  // vite's preview close can wait on keep-alive sockets; don't hang the report on it.
  await Promise.race([server.close(), new Promise((r) => setTimeout(r, 2000))]);
}

function fmt(n) {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : String(n);
}
function printDetail(row) {
  const d = row.detail;
  log(`  costliest owners (main+layer draws/tris | shadow draws/tris):`);
  const line = (t) => log(`    ${t.name.slice(0, 58).padEnd(58)} ${String(t.main + t.layer).padStart(4)} / ${String(t.mainTris + t.layerTris).padStart(7)} | ${String(t.shadow).padStart(3)} / ${String(t.shadowTris).padStart(7)}`);
  d.top.forEach(line);
  log('  -- by triangles');
  d.topTris.forEach(line);
  log('  -- heaviest meshes (draws / tris, bounding radius)');
  for (const m of d.meshes) log(`    ${m.name.slice(0, 80).padEnd(80)} ${String(m.draws).padStart(3)} / ${String(m.tris).padStart(7)} r${m.r.toFixed(1)}`);
  if (d.shadowTop.length) {
    log('  -- shadow casters');
    d.shadowTop.forEach(line);
  }
}

// ── Summary, worst views, JSON, budget check ──
const over = rows.filter((r) => BUDGET[r.quality] && (r.frame.draws > BUDGET[r.quality].draws || r.frame.tris > BUDGET[r.quality].tris));
const score = (r) => Math.max(r.frame.draws / (BUDGET[r.quality]?.draws ?? 1e9), r.frame.tris / (BUDGET[r.quality]?.tris ?? 1e9));
for (const q of qualities) {
  const qr = rows.filter((r) => r.quality === q);
  if (!qr.length || !BUDGET[q]) continue;
  log(`\nWorst five views at ${q} (budget ${BUDGET[q].draws} draws / ${fmt(BUDGET[q].tris)} triangles, frame without shadows):`);
  for (const r of [...qr].sort((a, b) => score(b) - score(a)).slice(0, 5)) log(`  ${r.view.padEnd(24)} ${String(r.frame.draws).padStart(4)} / ${fmt(r.frame.tris).padStart(5)}  (${Math.round(score(r) * 100)}% of budget)`);
}
const unstable = rows.filter((r) => !r.stable).map((r) => `${r.quality}/${r.view}`);
if (unstable.length) log(`\nNot stable within ${MAX_SAMPLES} samples (worst recent sample counted): ${unstable.join(', ')}`);
if (jsonOut) {
  const out = JSON.stringify({ budget: BUDGET, rows: rows.map(({ detail: _d, ...r }) => r) }, null, 1);
  if (jsonOut === '-') console.log(out);
  else writeFileSync(jsonOut, out);
}
if (check) {
  if (over.length) {
    log(`\nperf-report --check: ${over.length} view(s) over budget: ${over.map((r) => `${r.quality}/${r.view} ${r.frame.draws}/${fmt(r.frame.tris)}`).join(', ')}`);
    process.exit(1);
  }
  log('\nperf-report --check: every view within budget');
}
process.exit(0);
