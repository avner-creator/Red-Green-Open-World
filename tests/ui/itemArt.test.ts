import { describe, expect, it } from 'vitest';
import { picturePending, previewUrl } from '../../src/ui/itemArt';
import type { ShopItem } from '../../src/types';

const item = (id: string, preview: () => string | null): ShopItem =>
  ({ id, name: id, slot: 'head', price: 1, icon: 'gem', preview }) as unknown as ShopItem;

describe('itemArt cache', () => {
  it('does not remember "no picture yet": a later preview() that works is used (QA5 M4)', () => {
    let on = false;
    let calls = 0;
    const it1 = item('qa5-hat', () => {
      calls++;
      return on ? 'data:image/png;base64,AAAA' : null;
    });
    expect(previewUrl(it1)).toBeNull();
    // Still pending: a screen opened later asks again.
    expect(picturePending(it1)).toBe(true);
    on = true;
    expect(previewUrl(it1)).toBe('data:image/png;base64,AAAA');
    expect(picturePending(it1)).toBe(false);
    expect(previewUrl(it1)).toBe('data:image/png;base64,AAAA');
    expect(calls).toBe(2);
  });

  it('remembers a thrown preview as no picture (never retried)', () => {
    const it2 = item('qa5-bad', () => {
      throw new Error('no gl');
    });
    expect(previewUrl(it2)).toBeNull();
    expect(picturePending(it2)).toBe(false);
  });
});
