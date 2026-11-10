#!/usr/bin/env node
/**
 * Renders every SFX and reward sound offline in Chromium (OfflineAudioContext, via the Vite dev
 * server) and reports duration, peak and RMS, so levels can be checked without listening.
 * Usage: npx vite --port 4222 --strictPort &  then  RG_DEV_PORT=4222 node tests/audio/sfx-render.mjs
 */
/* global OfflineAudioContext */
import { chromium } from '@playwright/test';

const port = process.env.RG_DEV_PORT ?? '5173';
const browser = await chromium.launch({ args: ['--mute-audio'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
const rows = await page.evaluate(async () => {
  const synthMod = await import('/src/audio/synth.ts');
  const fxMod = await import('/src/audio/fx.ts');
  const names = ['gem', 'gemNear', 'jump', 'land', 'boing', 'bigBoing', 'flop', 'splash', 'whoosh', 'chute', 'key', 'chest', 'star', 'click', 'horn', 'bump', 'neigh', 'start', 'fanfare', 'tick'];
  const extras = [['combo', 0], ['combo', 2], ['combo', 4], ['kaching', 0], ['whoop', 0], ['cheer', 0]];
  const render = async (fn) => {
    const sr = 44100;
    const ac = new OfflineAudioContext(1, sr * 3, sr);
    const s = new synthMod.Synth(ac, ac.destination, synthMod.createNoiseBuffer(ac));
    fn(s);
    const b = await ac.startRendering();
    const d = b.getChannelData(0);
    let peak = 0;
    let sum = 0;
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      peak = Math.max(peak, a);
      sum += d[i] * d[i];
      if (a > 1e-3) last = i;
    }
    const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
    return { dur: (last / sr).toFixed(2), peak: db(peak), rms: db(Math.sqrt(sum / Math.max(1, last))) };
  };
  const out = [];
  for (const n of names) out.push({ name: n, ...(await render((s) => synthMod.playSfx(s, n, 0.01, 1, 1))) });
  for (const [n, step] of extras) out.push({ name: `${n}${n === 'combo' ? step : ''}`, ...(await render((s) => fxMod.playExtra(s, n, 0.01, 1, step))) });
  return out;
});
console.table(rows);
await browser.close();
