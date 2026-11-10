/**
 * Wordless SVG pictograms for the Scoops station (viewBox 0 0 48 48). Thick black outlines and
 * light/dark fills with patterns, so every picture reads through a red or a green lens alone.
 */
import type { ConeId, EffectId, FlavourId, Recipe, SauceId, Stage, Tile, ToppingId } from './logic';

const OUT = 'stroke="#111" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';

export const FLAVOUR_CSS: Readonly<Record<FlavourId, string>> = {
  vanilla: '#fff1cf',
  choc: '#5b3421',
  berry: '#f38fb1',
  mint: '#9fe8c2',
  blue: '#4f69c9',
};
const CHIP_CSS: Readonly<Record<FlavourId, string>> = {
  vanilla: '#2a1a10',
  choc: '#fff4dc',
  berry: '#5a1020',
  mint: '#2a1408',
  blue: '#f4f6ff',
};
const SAUCE_CSS: Readonly<Record<SauceId, string>> = { fudge: '#3a1c0e', strawberry: '#d8486a', caramel: '#f2b84e' };

function coneBody(id: ConeId, x = 24, top = 22, w = 13, h = 22): string {
  const pts = `${x - w},${top} ${x + w},${top} ${x},${top + h}`;
  if (id === 'waffle') {
    let lines = '';
    for (let i = -2; i <= 2; i++) {
      lines += `<path d="M${x - w + 4 + i * 5},${top + 1} l${7},${12}" stroke="#7a4a20" stroke-width="1.6"/>`;
      lines += `<path d="M${x + w - 4 + i * 5},${top + 1} l${-7},${12}" stroke="#7a4a20" stroke-width="1.6"/>`;
    }
    return `<clipPath id="cc${top}${w}"><polygon points="${pts}"/></clipPath><polygon points="${pts}" fill="#dba25c"/><g clip-path="url(#cc${top}${w})">${lines}</g><polygon points="${pts}" fill="none" ${OUT}/>`;
  }
  if (id === 'choco') {
    return `<polygon points="${pts}" fill="#dba25c" ${OUT}/><polygon points="${x - w},${top} ${x + w},${top} ${x + w * 0.55},${top + h * 0.45} ${x - w * 0.55},${top + h * 0.45}" fill="#3b2012" ${OUT}/><circle cx="${x - 5}" cy="${top + 4}" r="1.4" fill="#fff"/><circle cx="${x + 3}" cy="${top + 6}" r="1.4" fill="#fff"/><circle cx="${x + 7}" cy="${top + 3}" r="1.4" fill="#fff"/>`;
  }
  const bands = ['#fff1a8', '#7a2e8a', '#a8f0d0', '#2a5aa8'];
  let b = '';
  bands.forEach((c, i) => {
    const y0 = top + (h * i) / 4;
    const y1 = top + (h * (i + 1)) / 4;
    const w0 = w * (1 - i / 4);
    const w1 = w * (1 - (i + 1) / 4);
    b += `<polygon points="${x - w0},${y0} ${x + w0},${y0} ${x + w1},${y1} ${x - w1},${y1}" fill="${c}"/>`;
  });
  return `${b}<polygon points="${pts}" fill="none" ${OUT}/>`;
}

function scoop(f: FlavourId, cx = 24, cy = 17, r = 12): string {
  let dots = '';
  const n = f === 'berry' ? 7 : f === 'vanilla' ? 4 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.5;
    const rr = r * (0.35 + (i % 2) * 0.25);
    const x = cx + Math.cos(a) * rr;
    const y = cy - 2 + Math.sin(a) * rr * 0.7;
    dots += f === 'berry' ? `<ellipse cx="${x}" cy="${y}" rx="1.2" ry="1.8" fill="${CHIP_CSS[f]}"/>` : `<rect x="${x - 1.6}" y="${y - 1.2}" width="3.2" height="2.4" rx="0.8" fill="${CHIP_CSS[f]}"/>`;
  }
  return `<path d="M${cx - r},${cy + 3} a${r},${r} 0 1 1 ${r * 2},0 q${-3},4 ${-6},1 q${-3},4 ${-6},0 q${-3},4 ${-6},0 q${-3},3 ${-r * 2 + 18},-1 z" fill="${FLAVOUR_CSS[f]}" ${OUT}/>${dots}`;
}

function sauceBottle(s: SauceId): string {
  const c = SAUCE_CSS[s];
  return `<path d="M17 18 h14 v22 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3z" fill="${c}" ${OUT}/><rect x="17" y="24" width="14" height="6" fill="#fafafa" stroke="#111" stroke-width="2"/><path d="M20 18 l2 -8 h4 l2 8z" fill="#fafafa" ${OUT}/><path d="M24 10 v-5" ${OUT} fill="none"/><path d="M31 33 q5 1 4 7 q-1 3 -3 0 q-2 -3 -1 -7z" fill="${c}" stroke="#111" stroke-width="2"/>`;
}

function topping(t: ToppingId): string {
  switch (t) {
    case 'worms':
      return `<path d="M8 30 q6 -12 12 0 t12 0 t10 -6" fill="none" stroke="#111" stroke-width="9" stroke-linecap="round"/><path d="M8 30 q6 -12 12 0 t12 0 t10 -6" fill="none" stroke="#fff07a" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 5"/><path d="M8 30 q6 -12 12 0 t12 0 t10 -6" fill="none" stroke="#6a1a4a" stroke-width="5" stroke-linecap="round" stroke-dasharray="5 5" stroke-dashoffset="5"/><circle cx="41" cy="23" r="1.4" fill="#111"/>`;
    case 'popcorn':
      return `<path d="M14 26 h20 l-3 16 h-14z" fill="#fff" ${OUT}/><path d="M18 26 l1.5 16 M24 26 v16 M30 26 l-1.5 16" stroke="#c8233a" stroke-width="3"/><g fill="#fffbea" ${OUT}><circle cx="17" cy="22" r="5"/><circle cx="25" cy="18" r="6"/><circle cx="32" cy="23" r="5"/><circle cx="21" cy="13" r="4"/></g>`;
    case 'pickle':
      return `<rect x="9" y="17" width="30" height="14" rx="7" fill="#3f6a2a" ${OUT} transform="rotate(-20 24 24)"/><g fill="#a8d870"><circle cx="16" cy="27" r="1.6"/><circle cx="22" cy="23" r="1.6"/><circle cx="28" cy="21" r="1.6"/><circle cx="33" cy="18" r="1.6"/><circle cx="19" cy="20" r="1.4"/><circle cx="27" cy="26" r="1.4"/></g>`;
    case 'duck':
      return `<path d="M8 30 q0 10 16 10 q16 0 16 -10 q-4 2 -9 0 q4 -4 2 -11 q-2 -8 -10 -8 q-8 0 -9 8 q0 5 3 8 q-6 1 -9 3z" fill="#ffd93b" ${OUT}/><path d="M12 19 q-6 0 -6 3 q3 2 7 0z" fill="#e0701a" stroke="#111" stroke-width="2"/><circle cx="19" cy="17" r="2" fill="#111"/>`;
    case 'sprinkles':
      return `<rect x="6" y="24" width="20" height="10" rx="5" fill="#2f6f8f" ${OUT} transform="rotate(-30 16 29)"/><circle cx="13" cy="37" r="5" fill="#ffd93b" ${OUT}/><g stroke-width="3" stroke-linecap="round"><path d="M28 14 l3 -3" stroke="#fff"/><path d="M34 20 l4 -1" stroke="#ffd93b"/><path d="M33 9 l2 -4" stroke="#111"/><path d="M40 12 l3 1" stroke="#fff"/><path d="M27 7 l-1 -3" stroke="#ffd93b"/><path d="M39 26 l3 2" stroke="#111"/></g>`;
    case 'marsh':
      return `<g ${OUT}><rect x="9" y="20" width="14" height="18" rx="5" fill="#fff8fb"/><rect x="25" y="14" width="14" height="18" rx="5" fill="#f2b2cc"/></g><path d="M10 25 h12 M26 19 h12" stroke="#111" stroke-width="1.6"/>`;
  }
}

function jar(index: number): string {
  let dots = '';
  for (let d = 0; d <= index; d++) dots += `<circle cx="${24 + (d - index / 2) * 7}" cy="31" r="3" fill="#2f3b52"/>`;
  return `<rect x="12" y="15" width="24" height="27" rx="5" fill="#d6ecf2" ${OUT}/><rect x="10" y="9" width="28" height="7" rx="2" fill="#2f3b52" ${OUT}/><circle cx="24" cy="7" r="3" fill="#ffd93b" stroke="#111" stroke-width="2"/>${dots}`;
}

const NEXT = `<path d="M8 20 h18 v-9 l15 13 l-15 13 v-9 h-18z" fill="#ffd93b" ${OUT}/>`;
/** Open mouth taking a bite: "eat it!" */
const EAT = `<circle cx="24" cy="24" r="17" fill="#ffd93b" ${OUT}/><path d="M13 22 q11 17 22 0z" fill="#5a1020" ${OUT}/><path d="M15 22 h18 l-2 3 h-14z" fill="#fff"/><circle cx="18" cy="15" r="2.4" fill="#111"/><circle cx="30" cy="15" r="2.4" fill="#111"/>`;
export const EXIT_SVG = `<svg viewBox="0 0 48 48"><rect x="10" y="7" width="20" height="34" rx="2" fill="#2f3b52" ${OUT}/><rect x="13" y="10" width="14" height="28" fill="#ffd93b"/><path d="M26 24 h16 m-6 -6 l6 6 l-6 6" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 24 h16 m-6 -6 l6 6 l-6 6" fill="none" stroke="#111" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function tileSvg(t: Tile, eatNext = false): string {
  let body: string;
  switch (t.kind) {
    case 'cone':
      body = coneBody(t.id, 24, 10, 14, 30);
      break;
    case 'flavour':
      body = coneBody('waffle', 24, 26, 9, 16) + scoop(t.id, 24, 18, 13);
      break;
    case 'sauce':
      body = sauceBottle(t.id);
      break;
    case 'topping':
      body = topping(t.id);
      break;
    case 'jar':
      body = jar(t.index);
      break;
    case 'next':
      body = eatNext ? EAT : NEXT;
      break;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${body}</svg>`;
}

export function stageSvg(s: Stage): string {
  switch (s) {
    case 'cone':
      return `<svg viewBox="0 0 48 48">${coneBody('waffle', 24, 10, 13, 30)}</svg>`;
    case 'scoops':
      return `<svg viewBox="0 0 48 48">${scoop('berry', 24, 30, 11)}${scoop('vanilla', 24, 16, 11)}</svg>`;
    case 'sauce':
      return `<svg viewBox="0 0 48 48">${sauceBottle('fudge')}</svg>`;
    case 'toppings':
      return `<svg viewBox="0 0 48 48">${topping('sprinkles')}</svg>`;
    case 'eat':
      return `<svg viewBox="0 0 48 48">${EAT}</svg>`;
  }
}

/** A recipe card picture: the whole cone stacked (cone, scoops, sauce, topping). */
export function recipeSvg(r: Recipe): string {
  const n = r.scoops.length;
  const step = 14;
  const coneTop = 24 + n * step;
  let s = coneBody(r.cone, 30, coneTop, 13, 26);
  r.scoops.forEach((f, i) => {
    s += scoop(f, 30, coneTop - 6 - i * step, 12);
  });
  const topY = coneTop - 6 - (n - 1) * step;
  if (r.sauce) s += `<path d="M18 ${topY - 3} q12 -16 24 0 q-2 6 -4 1 q-3 6 -6 0 q-3 6 -6 0 q-3 5 -5 0z" fill="${SAUCE_CSS[r.sauce]}" ${OUT}/>`;
  s += `<g transform="translate(36 ${topY - 30}) scale(0.55)">${topping(r.topping)}</g>`;
  const h = coneTop + 30;
  return `<svg viewBox="0 0 60 ${h}" aria-hidden="true">${s}</svg>`;
}

export function effectSvg(e: EffectId): string {
  switch (e) {
    case 'bigHead':
      return `<svg viewBox="0 0 48 48"><circle cx="24" cy="18" r="15" fill="#ffd93b" ${OUT}/><rect x="19" y="33" width="10" height="11" rx="3" fill="#fff" ${OUT}/><circle cx="19" cy="16" r="2.5" fill="#111"/><circle cx="29" cy="16" r="2.5" fill="#111"/><path d="M18 24 q6 5 12 0" fill="none" ${OUT}/></svg>`;
    case 'tiny':
      return `<svg viewBox="0 0 48 48"><path d="M6 8 l8 8 m0 -7 v7 h-7 M42 40 l-8 -8 m0 7 v-7 h7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="21" r="5" fill="#ffd93b" ${OUT}/><rect x="21" y="26" width="6" height="8" rx="2" fill="#fff" ${OUT}/></svg>`;
    case 'rainbow':
      return `<svg viewBox="0 0 48 48"><g fill="none" stroke-width="5"><path d="M5 40 a19 19 0 0 1 38 0" stroke="#111"/><path d="M5 40 a19 19 0 0 1 38 0" stroke="#fff6c8" stroke-width="3"/><path d="M10 40 a14 14 0 0 1 28 0" stroke="#7a2e8a"/><path d="M15 40 a9 9 0 0 1 18 0" stroke="#ffd93b"/></g></svg>`;
    case 'speed':
      return `<svg viewBox="0 0 48 48"><path d="M27 4 l-14 22 h10 l-4 18 l16 -24 h-10z" fill="#ffd93b" ${OUT}/><path d="M4 18 h8 M2 26 h9 M5 34 h7" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
    case 'moon':
      return `<svg viewBox="0 0 48 48"><path d="M30 6 a17 17 0 1 0 12 26 a14 14 0 1 1 -12 -26z" fill="#fff6c8" ${OUT}/><path d="M14 42 v-10 m-4 4 l4 -4 l4 4" fill="none" stroke="#ffd93b" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'burps':
      return `<svg viewBox="0 0 48 48"><g fill="#eaf6ff" ${OUT}><circle cx="16" cy="30" r="10"/><circle cx="32" cy="18" r="8"/><circle cx="36" cy="36" r="5"/></g><path d="M12 26 a5 5 0 0 1 5 -4" fill="none" stroke="#fff" stroke-width="2.4"/></svg>`;
  }
}

export const GEM_SVG = `<svg viewBox="0 0 48 48"><path d="M12 8 h24 l9 12 l-21 22 l-21 -22z" fill="#9ff3ff" ${OUT}/><path d="M3 20 h42 M12 8 l6 12 l6 -12 l6 12 l6 -12 M18 20 l6 22 l6 -22" fill="none" stroke="#111" stroke-width="1.8"/></svg>`;
export const STAR_SVG = `<svg viewBox="0 0 48 48"><path d="M24 3 l6 14 l15 1 l-12 10 l4 15 l-13 -8 l-13 8 l4 -15 l-12 -10 l15 -1z" fill="#ffd93b" ${OUT}/></svg>`;
export const CHECK_SVG = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#7ee08a" ${OUT}/><path d="M14 25 l7 7 l13 -15" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
