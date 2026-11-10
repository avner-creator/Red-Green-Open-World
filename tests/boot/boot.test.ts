import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOT_STAGES, CREEP, nextProgress, stageRange, stageTarget } from '../../src/boot/stages';
import { SECURITY_HEADERS } from '../../vite.config';

describe('boot stages', () => {
  it('cover the whole bar in order without gaps', () => {
    let end = 0;
    for (const s of BOOT_STAGES) {
      const [a, b] = stageRange(s.id);
      expect(a).toBeCloseTo(end, 9);
      expect(b).toBeGreaterThan(a);
      end = b;
    }
    expect(end).toBeCloseTo(1, 9);
  });

  it('creep stays inside the stage and below the next stage start', () => {
    for (let i = 0; i < BOOT_STAGES.length; i++) {
      const t = stageTarget(BOOT_STAGES[i].id);
      const [a, b] = stageRange(BOOT_STAGES[i].id);
      expect(t.from).toBe(a);
      expect(t.to).toBeCloseTo(a + (b - a) * CREEP, 9);
      expect(t.to).toBeLessThan(b);
      expect(t.ms).toBeGreaterThan(0);
    }
  });

  it('progress never runs backwards and never passes 100 %', () => {
    expect(nextProgress(0.5, 0.2)).toBe(0.5);
    expect(nextProgress(0.2, 0.5)).toBe(0.5);
    expect(nextProgress(0.9, 1.4)).toBe(1);
  });
});

/** Minimal netlify.toml reader: `[[headers]]` blocks → { for, values }. */
function netlifyHeaders(): { for: string; values: Record<string, string> }[] {
  const text = readFileSync('netlify.toml', 'utf8');
  return text
    .split('[[headers]]')
    .slice(1)
    .map((block) => {
      const path = /for\s*=\s*"([^"]+)"/.exec(block)?.[1] ?? '';
      const values: Record<string, string> = {};
      const body = block.split('[headers.values]')[1] ?? '';
      for (const m of body.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/gm)) values[m[1]] = m[2];
      return { for: path, values };
    });
}

describe('netlify.toml', () => {
  const blocks = netlifyHeaders();
  const at = (path: string): Record<string, string> => blocks.find((b) => b.for === path)?.values ?? {};

  it('sends the same security headers as vite preview (where e2e runs)', () => {
    expect(at('/*')).toEqual(SECURITY_HEADERS);
  });

  it('lets WASM compile and audio/models load under the CSP', () => {
    const csp = SECURITY_HEADERS['Content-Security-Policy'];
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toMatch(/connect-src 'self'/);
    expect(csp).toMatch(/media-src 'self'/);
  });

  it('caches hashed build output forever and public assets briefly', () => {
    expect(at('/build/*')['Cache-Control']).toContain('immutable');
    expect(at('/assets/*')['Cache-Control']).toMatch(/max-age=\d{1,5},/);
    expect(at('/index.html')['Cache-Control']).toContain('max-age=0');
  });

  it('only uses `*` at the end of a path (Netlify does not match mid-path wildcards)', () => {
    for (const b of blocks) expect(b.for.indexOf('*')).toBeOneOf([-1, b.for.length - 1]);
  });

  it('types models and audio explicitly', () => {
    expect(at('/assets/characters/*')['Content-Type']).toBe('model/gltf-binary');
    expect(at('/assets/audio/*')['Content-Type']).toBe('audio/ogg');
  });
});
