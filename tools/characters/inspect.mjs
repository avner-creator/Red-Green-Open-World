// Prints a source model's clips, joints, materials, meshes and bounds (for adding a character).
// Usage: node inspect.mjs <file.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/core';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(process.argv[2]);
const r = doc.getRoot();
console.log('clips:', r.listAnimations().map((a) => `${a.getName()}(${a.listSamplers()[0]?.getInput().getMax([])[0]?.toFixed(2)})`).join(', '));
console.log('joints:', r.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName())).join(', '));
console.log('materials:', r.listMaterials().map((m) => `${m.getName()}=${m.getBaseColorFactor().map((c) => c.toFixed(2)).join('/')}${m.getBaseColorTexture() ? '+tex' : ''}`).join(', '));
let tris = 0;
for (const m of r.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
console.log('meshes:', r.listMeshes().map((m) => m.getName()).join(', '), 'tris', tris);
console.log('bounds:', JSON.stringify(getBounds(r.listScenes()[0])));
