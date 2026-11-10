/** Item pictures: the item's own rendered preview when it has one, else its icon. */
import type { IconName, ShopItem } from '../types';
import { h } from './dom';
import { icon } from './icons';

/** The item's picture URL, or null. Called only when a card is built (previews may render lazily). */
export function previewUrl(it: ShopItem | undefined): string | null {
  if (!it?.preview) return null;
  try {
    const url = it.preview();
    return typeof url === 'string' && url.length > 0 ? url : null;
  } catch {
    return null;
  }
}

/** `<img class="pic">` for the item's preview, falling back to the icon (also if the image fails). */
export function itemPicture(it: ShopItem | undefined, fallback: IconName): HTMLElement {
  const url = previewUrl(it);
  if (!url) return icon(fallback);
  const img = h('img', 'pic', { src: url, alt: '', draggable: 'false', decoding: 'async', 'data-testid': 'item-pic' });
  img.addEventListener('error', () => img.replaceWith(icon(fallback)), { once: true });
  return img;
}
