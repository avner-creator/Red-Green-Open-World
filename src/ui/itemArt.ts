/**
 * Item pictures: the item's own rendered preview when it has one, else its icon.
 * `preview()` can be slow the first time (it may compile shaders), so screens are always built
 * with the icon (or an already cached picture) and pictures are filled in afterwards by a queue
 * that calls one `preview()` per tick and swaps the icon for the `<img>` with a small pop.
 */
import type { IconName, ShopItem } from '../types';
import { h } from './dom';
import { icon } from './icons';

/** id → picture URL (null = the item has none). Survives screen openings. */
const cache = new Map<string, string | null>();

/** Call the item's preview once (try/catch) and remember the result. */
export function previewUrl(it: ShopItem | undefined): string | null {
  if (!it) return null;
  const hit = cache.get(it.id);
  if (hit !== undefined) return hit;
  let url: string | null = null;
  if (it.preview) {
    try {
      const v = it.preview();
      url = typeof v === 'string' && v.length > 0 ? v : null;
    } catch {
      url = null;
    }
  }
  cache.set(it.id, url);
  return url;
}

/** True when a picture may exist but has not been asked for yet. */
export function picturePending(it: ShopItem | undefined): boolean {
  return !!it?.preview && !cache.has(it.id);
}

function img(url: string, fallback: IconName): HTMLImageElement {
  const el = h('img', 'pic', { src: url, alt: '', draggable: 'false', decoding: 'async', 'data-testid': 'item-pic' });
  el.addEventListener('error', () => el.replaceWith(icon(fallback)), { once: true });
  return el;
}

/** Picture without waiting: the cached image if there is one, else the icon. Never calls preview(). */
export function itemPicture(it: ShopItem | undefined, fallback: IconName): HTMLElement {
  const url = it ? cache.get(it.id) : undefined;
  return url ? img(url, fallback) : icon(fallback);
}

/** Swap the icon inside `host` for the picture (with a pop). Returns false if there is none. */
export function swapInPicture(host: HTMLElement, it: ShopItem, fallback: IconName): boolean {
  const url = cache.get(it.id);
  if (!url || !host.isConnected) return false;
  const old = host.querySelector(':scope > .ic, :scope > .pic');
  const pic = img(url, fallback);
  pic.classList.add('pic-in');
  if (old) old.replaceWith(pic);
  else host.append(pic);
  host.classList.add('has-pic');
  host.querySelector(':scope > .sw')?.remove();
  host.style.removeProperty('--sw');
  return true;
}

export interface PictureQueue {
  /** Ask for a picture; `onReady` runs (later, one item per tick) if the item has one. */
  request(it: ShopItem, onReady: () => void): void;
  /** Drop everything still waiting (screen closed, tab changed). */
  clear(): void;
}

/**
 * One `preview()` call per timer tick, in request order. `active` (optional) is checked before
 * each call: when it says no (the screen closed), the queue empties itself.
 */
export function createPictureQueue(active: () => boolean = () => true, tickMs = 16): PictureQueue {
  const jobs: { it: ShopItem; onReady: () => void }[] = [];
  let timer = 0;
  const run = (): void => {
    timer = 0;
    if (!active()) {
      jobs.length = 0;
      return;
    }
    const job = jobs.shift();
    if (!job) return;
    if (previewUrl(job.it)) job.onReady();
    if (jobs.length) timer = window.setTimeout(run, tickMs);
  };
  return {
    request(it, onReady) {
      if (!it.preview) return;
      if (cache.has(it.id)) {
        if (cache.get(it.id)) onReady();
        return;
      }
      jobs.push({ it, onReady });
      if (!timer) timer = window.setTimeout(run, tickMs);
    },
    clear() {
      jobs.length = 0;
      window.clearTimeout(timer);
      timer = 0;
    },
  };
}
