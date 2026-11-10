import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every file under public/assets/, as repo-relative paths with forward slashes. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p.split('\\').join('/'));
  }
  return out;
}

/** First-column paths of the ASSETS.md table rows that name a file in public/assets/. */
function manifestRows(): string[] {
  const md = readFileSync('ASSETS.md', 'utf8');
  const rows: string[] = [];
  for (const line of md.split('\n')) {
    const m = /^\|\s*(public\/assets\/[^|]+?)\s*\|/.exec(line);
    if (m) rows.push(m[1]);
  }
  return rows;
}

describe('ASSETS.md covers public/assets/ exactly', () => {
  const files = listFiles('public/assets').filter((f) => !/(^|\/)\.[^/]*$/.test(f)); // dotfiles (e.g. .gitkeep) aren't assets
  const rows = manifestRows();

  it('every row names a file that exists (no rows for missing files)', () => {
    const missing = rows.filter((r) => !files.includes(r));
    expect(missing).toEqual([]);
  });

  it('every file in public/assets/ has a row', () => {
    const unlisted = files.filter((f) => !rows.includes(f));
    expect(unlisted).toEqual([]);
  });

  it('no file has more than one row', () => {
    const dupes = rows.filter((r, i) => rows.indexOf(r) !== i);
    expect(dupes).toEqual([]);
  });
});
