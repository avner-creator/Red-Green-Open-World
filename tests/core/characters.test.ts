import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, getCharacter } from '../../src/core/characters/catalog';
import type { PlayerAnim } from '../../src/types';

const ANIMS: PlayerAnim[] = ['idle', 'walk', 'run', 'jump', 'fall', 'flop', 'dance', 'wave', 'cheer', 'sit'];
const SKILLS = ['doubleJump', 'glide', 'dash', 'superBounce', 'groundPound'];

interface GltfJson {
  animations?: { name?: string }[];
  nodes: { name?: string; mesh?: number }[];
  extensionsUsed?: string[];
}

/** The JSON chunk of a .glb (readable without decoding the meshopt-compressed buffers). */
function glbJson(file: string): GltfJson {
  const b = readFileSync(file);
  expect(b.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString('utf8')) as GltfJson;
}

describe('character catalog', () => {
  it('has six characters with unique ids, two of them free', () => {
    expect(CHARACTERS).toHaveLength(6);
    expect(new Set(CHARACTER_IDS).size).toBe(6);
    expect(CHARACTERS.filter((c) => c.price === 0)).toHaveLength(2);
    expect(getCharacter(DEFAULT_CHARACTER).price).toBe(0);
    for (const c of CHARACTERS) if (c.price > 0) expect(c.price).toBeGreaterThanOrEqual(5);
    for (const c of CHARACTERS) expect(c.price).toBeLessThanOrEqual(100);
  });

  it('uses every skill at least once and only known skills', () => {
    for (const c of CHARACTERS) expect(SKILLS).toContain(c.skill);
    for (const s of SKILLS) expect(CHARACTERS.some((c) => c.skill === s)).toBe(true);
  });

  it('has short names and kid-friendly backstories with no health wording', () => {
    for (const c of CHARACTERS) {
      expect(c.name.length).toBeGreaterThanOrEqual(2);
      expect(c.name.length).toBeLessThanOrEqual(8);
      expect(c.backstory.length).toBeLessThanOrEqual(110);
      expect(c.backstory).not.toMatch(/therap|patient|medic|health|doctor|treat|cure|eye|vision|amblyop|lazy|weapon|fight|kill|hurt/i);
    }
  });

  it('sizes characters to fit the player capsule height', () => {
    for (const c of CHARACTERS) {
      expect(c.height).toBeGreaterThan(1.4);
      expect(c.height).toBeLessThan(1.9);
      expect(c.scale).toBeGreaterThan(0);
    }
  });

  for (const c of CHARACTERS) {
    describe(`${c.id}.glb`, () => {
      const file = `public/${c.modelUrl}`;
      const json = glbJson(file);
      const clips = new Set((json.animations ?? []).map((a) => a.name));
      const names = new Set(json.nodes.map((n) => n.name));

      it('is at most 600 KB and meshopt-compressed', () => {
        expect(statSync(file).size).toBeLessThanOrEqual(600 * 1024);
        expect(json.extensionsUsed).toContain('EXT_meshopt_compression');
      });

      it('maps every PlayerAnim and the emote to a clip in the file', () => {
        for (const a of ANIMS) expect(clips, `${a} → ${c.anims[a].clip}`).toContain(c.anims[a].clip);
        expect(clips).toContain(c.emote.clip);
        for (const core of ['idle', 'walk', 'run', 'jump'] as const) expect(c.anims[core].clip).toBeTruthy();
      });

      it('ships no fighting, hurt or weapon clips or meshes', () => {
        for (const clip of clips) expect(clip).not.toMatch(/death|hit|punch|kick|gun|weapon|shoot|attack|sword|slash/i);
        for (const n of json.nodes) if (n.mesh !== undefined) expect(n.name ?? '').not.toMatch(/pistol|gun|sword|blade|katana|axe/i);
      });

      it('has the attach bones', () => {
        for (const part of ['head', 'face', 'back'] as const) expect(names).toContain(c.attach[part].bone);
      });
    });
  }
});
