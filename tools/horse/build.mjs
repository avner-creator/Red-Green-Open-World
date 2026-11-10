// Horse asset pipeline: downloads the CC0 Quaternius horse (Ultimate Animated Animal Pack),
// removes fighting/hurt clips, renames clips, adds a diagonal-pair "Trot" clip derived from the
// four-beat Walk, sets neutral non-metal materials (the game tints the coat at runtime), then
// compresses with meshopt.
//
// Usage:  cd tools/horse && npm ci && node build.mjs        (writes public/assets/models/horse.glb)
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const cacheDir = join(here, '.cache');
mkdirSync(cacheDir, { recursive: true });
const OUT = join(root, 'public', 'assets', 'models', 'horse.glb');

export const SOURCE =
  'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/c06a6fa9a1b13576edf3bd62d7b52aba334f8fc0/public/glb/animals_pack/Horse.glb';

/** Clips that never ship: fighting, getting hurt. */
const BANNED_CLIP = /death|hit|kick|attack|headbutt/i;
const MAX_BYTES = 400 * 1024;

/**
 * Neutral palette (linear-ish sRGB hex). Coat parts are set again at runtime from the horse's
 * coat colour (`setColor`); these are the defaults for anything that never gets tinted.
 */
const MATERIALS = {
  Main: '#d9a85f',
  Main_Light: '#f1d9a6',
  Main_Dark: '#a8763c',
  Hair: '#f6f1e4',
  Muzzle: '#4a3a2c',
  Hooves: '#2e2a26',
  Eye_Black: '#141414',
  Eye_White: '#f4f4f4',
};

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const s = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return s.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}

async function fetchCached() {
  const file = join(cacheDir, 'Horse.glb');
  if (!existsSync(file)) {
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`download failed ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

/**
 * Trot from the walk: the source Walk is a lateral four-beat gait (hind L 0.71, fore L 0.93,
 * hind R 0.21, fore R 0.46 of the cycle). Delaying both forelegs by a quarter cycle pairs the
 * diagonals (hind L + fore R, hind R + fore L): a two-beat trot. Keys are uniform, so the delay
 * is a cyclic shift of the key values.
 */
const FORELEG = /^(FrontShoulder|FrontUpperLeg|FrontLowerLeg|IKFrontLeg|FF)\.[LR]$/;

function addTrot(doc) {
  const r = doc.getRoot();
  const walk = r.listAnimations().find((a) => a.getName() === 'Walk');
  if (!walk) throw new Error('no Walk clip');
  const buffer = r.listBuffers()[0];
  const trot = doc.createAnimation('Trot');
  for (const ch of walk.listChannels()) {
    const s = ch.getSampler();
    const input = s.getInput();
    const output = s.getOutput();
    const times = input.getArray();
    const n = times.length; // last key == first key (looping clip)
    const cycle = n - 1;
    const shift = FORELEG.test(ch.getTargetNode().getName()) ? Math.round(cycle / 4) : 0;
    const size = output.getElementSize();
    const src = output.getArray();
    const dst = new src.constructor(src.length);
    for (let i = 0; i < n; i++) {
      const j = ((((i - shift) % cycle) + cycle) % cycle) * size;
      for (let k = 0; k < size; k++) dst[i * size + k] = src[j + k];
    }
    const out = doc.createAccessor().setType(output.getType()).setArray(dst).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation(s.getInterpolation());
    trot.addSampler(sampler);
    trot.addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(sampler));
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

const doc = await io.read(await fetchCached());
const r = doc.getRoot();
for (const anim of r.listAnimations()) {
  if (BANNED_CLIP.test(anim.getName())) {
    anim.dispose();
    continue;
  }
  anim.setName(anim.getName().replace(/^.*\|/, '')); // "AnimalArmature|Gallop" → "Gallop"
}
addTrot(doc);
for (const m of r.listMaterials()) {
  const hex = MATERIALS[m.getName()];
  if (!hex) continue;
  m.setBaseColorFactor([...hexToLinear(hex), 1]);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(m.getName().startsWith('Eye') ? 0.25 : m.getName() === 'Hair' ? 0.8 : 0.62);
}

await doc.transform(
  prune(),
  dedup(),
  resample({ tolerance: 1e-4 }),
  weld(),
  quantize({ quantizeNormal: 10, quantizePosition: 14 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
mkdirSync(dirname(OUT), { recursive: true });
await io.write(OUT, doc);
const bytes = statSync(OUT).size;
console.log(`horse ${(bytes / 1024).toFixed(0)} KB  clips: ${r.listAnimations().map((a) => a.getName()).join(', ')}`);
if (bytes > MAX_BYTES) throw new Error('horse.glb is over budget');
