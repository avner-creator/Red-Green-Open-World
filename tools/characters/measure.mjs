// Prints the rest-pose box of the vertices skinned mainly to the Head joint (or its children),
// in model units and in metres after the catalog scale. Used to place head/face anchors.
// Usage: node measure.mjs id:scale ...   e.g. node measure.mjs frog:0.6 rex:0.11
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const here = dirname(fileURLToPath(import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const apply = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);

for (const arg of process.argv.slice(2)) {
  const [id, scaleStr] = arg.split(':');
  const scale = Number(scaleStr);
  const doc = await io.read(join(here, '..', '..', 'public', 'assets', 'characters', `${id}.glb`));
  const root = doc.getRoot();
  const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of root.listNodes()) {
    const skin = node.getSkin();
    const mesh = node.getMesh();
    if (!skin || !mesh) continue;
    const joints = skin.listJoints();
    const head = joints.find((j) => j.getName() === 'Head');
    if (!head) continue;
    const under = new Set();
    const mark = (n) => {
      under.add(n);
      n.listChildren().forEach(mark);
    };
    mark(head);
    const ibm = skin.getInverseBindMatrices();
    all.node = all.node ?? node;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const J = prim.getAttribute('JOINTS_0');
      const W = prim.getAttribute('WEIGHTS_0');
      for (let i = 0; i < pos.getCount(); i++) {
        const j = J.getElement(i, []);
        const w = W.getElement(i, []);
        const k = w.indexOf(Math.max(...w));
        const joint = joints[j[k]];
        const m = mul(joint.getWorldMatrix(), ibm.getElement(j[k], []));
        const p = apply(m, pos.getElement(i, []));
        for (let a = 0; a < 3; a++) {
          all.min[a] = Math.min(all.min[a], p[a]);
          all.max[a] = Math.max(all.max[a], p[a]);
        }
        if (!under.has(joint)) continue;
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], p[a]);
          max[a] = Math.max(max[a], p[a]);
        }
      }
    }
  }
  const m = (v) => v.map((x) => +(x * scale).toFixed(3));
  console.log(id, 'body box (m): min', m(all.min), 'max', m(all.max));
  console.log(id, 'head box (m): min', m(min), 'max', m(max), ' centreY', +(((min[1] + max[1]) / 2) * scale).toFixed(3));
}
