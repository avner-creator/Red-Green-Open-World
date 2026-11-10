// Recolouring and proportion tweaks, applied before compression.
//  - materials: { MaterialName: '#rrggbb' } sets baseColorFactor (untextured models)
//  - swatches:  [{ uv: [u, v], color: '#rrggbb' }] repaints the flat colour patch of a palette
//               atlas under that UV (flood fill of the exact colour), for atlas-textured models
//  - boneScale: { BoneName: s } scales a joint's rest transform (big-head look). Only safe for
//               joints no clip scales; checked here.
import sharp from 'sharp';

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  const s = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return s.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function repaintAtlas(texture, swatches) {
  const { data, info } = await sharp(Buffer.from(texture.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  for (const sw of swatches) {
    const x0 = Math.min(w - 1, Math.floor(sw.uv[0] * w));
    const y0 = Math.min(h - 1, Math.floor(sw.uv[1] * h));
    const i0 = (y0 * w + x0) * 4;
    const target = [data[i0], data[i0 + 1], data[i0 + 2]];
    const rgb = hexToRgb(sw.color);
    const seen = new Uint8Array(w * h);
    const stack = [[x0, y0]];
    let count = 0;
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
      seen[y * w + x] = 1;
      const i = (y * w + x) * 4;
      if (Math.abs(data[i] - target[0]) + Math.abs(data[i + 1] - target[1]) + Math.abs(data[i + 2] - target[2]) > 6) continue;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      count++;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (count === 0) throw new Error(`swatch at ${sw.uv} matched no pixels`);
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  texture.setImage(new Uint8Array(png)).setMimeType('image/png');
}

export async function recolour(doc, src) {
  const root = doc.getRoot();
  for (const [name, hex] of Object.entries(src.materials ?? {})) {
    const m = root.listMaterials().find((x) => x.getName() === name);
    if (!m) throw new Error(`${src.id}: no material ${name}`);
    m.setBaseColorFactor([...hexToLinear(hex), 1]);
    if (src.roughness !== undefined) m.setRoughnessFactor(src.roughness);
    m.setMetallicFactor(0);
  }
  if (src.swatches?.length) {
    const tex = root.listTextures()[0];
    await repaintAtlas(tex, src.swatches);
  }
  if (src.boneScale) {
    for (const [name, s] of Object.entries(src.boneScale)) {
      const node = root.listNodes().find((n) => n.getName() === name);
      if (!node) throw new Error(`${src.id}: no bone ${name}`);
      for (const a of root.listAnimations()) {
        for (const c of a.listChannels()) {
          if (c.getTargetNode() === node && c.getTargetPath() === 'scale') throw new Error(`${src.id}: ${name} has scale keys`);
        }
      }
      node.setScale([s, s, s]);
    }
  }
}
