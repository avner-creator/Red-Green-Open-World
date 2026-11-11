// Character asset pipeline: downloads the CC0 source models, cleans them for a kids' game
// (no weapons, no fighting/hurt clips), recolours for red/green channel readability, adds a few
// hand-keyed procedural clips (dance, wave, fall…), then compresses (meshopt + WebP).
//
// Usage:  cd tools/characters && npm install && npm run build      (writes public/assets/characters)
//         node build.mjs frog rex                                  (only some characters)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, textureCompress, weld, meshopt } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { SOURCES } from './sources.mjs';
import { addProceduralClips } from './clips.mjs';
import { recolour } from './recolour.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const cacheDir = join(here, '.cache');
const outDir = join(root, 'public', 'assets', 'characters');
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

/** Clip names that must never ship: fighting, weapons, getting hurt. */
const BANNED_CLIP = /death|hit|punch|kick|headbutt|gun|weapon|shoot|attack|sword|slash/i;
/** Mesh nodes that must never ship (weapons). */
const BANNED_NODE = /pistol|gun|sword|blade|katana|club|axe/i;
const MAX_BYTES = 600 * 1024;

async function fetchCached(src) {
  if (src.path) return join(root, src.path);
  const file = join(cacheDir, src.cacheName);
  if (!existsSync(file)) {
    const res = await fetch(src.url);
    if (!res.ok) throw new Error(`download failed ${res.status} ${src.url}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  if (src.sha256) {
    const got = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (got !== src.sha256) throw new Error(`checksum mismatch for ${src.url}: ${got}`);
  }
  return file;
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

const wanted = process.argv.slice(2);
for (const src of SOURCES) {
  if (wanted.length && !wanted.includes(src.id)) continue;
  const file = await fetchCached(src);
  const doc = await io.read(file);
  const r = doc.getRoot();

  // Draco is decoded on read; drop the extension so the output is plain + meshopt.
  for (const ext of r.listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  }

  for (const node of r.listNodes()) {
    if (node.getMesh() && BANNED_NODE.test(node.getName())) node.dispose();
  }
  for (const anim of r.listAnimations()) {
    if (BANNED_CLIP.test(anim.getName())) {
      anim.dispose();
      continue;
    }
    // "CharacterArmature|Idle", "Armature|TRex_Walk" → "Idle", "Walk"
    const clean = anim.getName().replace(/^.*\|/, '').replace(/^(TRex|Velociraptor|Triceratops)_/, '');
    anim.setName(clean);
  }
  for (const [from, to] of Object.entries(src.renameClips ?? {})) {
    const a = r.listAnimations().find((x) => x.getName() === from);
    if (a) a.setName(to);
  }

  await recolour(doc, src);
  addProceduralClips(doc, src);

  await doc.transform(
    prune(),
    dedup(),
    resample({ tolerance: 1e-4 }),
    weld(),
    quantize({ quantizeNormal: 10, quantizePosition: 14 }),
    // Palette atlases: lossless so colour patches stay exact.
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], lossless: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  const out = join(outDir, `${src.id}.glb`);
  await io.write(out, doc);
  const bytes = statSync(out).size;
  const clips = doc.getRoot().listAnimations().map((a) => a.getName());
  console.log(`${src.id.padEnd(9)} ${(bytes / 1024).toFixed(0).padStart(4)} KB  clips: ${clips.join(', ')}`);
  if (bytes > MAX_BYTES) throw new Error(`${src.id} is over the 600 KB budget`);
}
