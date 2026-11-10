#!/usr/bin/env node
/**
 * Browser check for the music: loads the built game (not test mode) from a running preview
 * server, clicks the page (first gesture → title music), presses Play, and verifies in Chromium
 * that every track decodes with decodeAudioData and that the page logs no console errors.
 *
 * Usage: RG_PORT=4221 npx vite preview --port 4221 &  then  RG_PORT=4221 node tests/audio/browser-check.mjs
 */
/* global OfflineAudioContext */
import { chromium } from '@playwright/test';

const port = process.env.RG_PORT ?? '4173';
const base = `http://localhost:${port}/`;
const files = ['music-explore', 'music-action', 'music-air', 'music-urgent', 'jingle-win'];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
const audioRequests = [];
page.on('request', (r) => {
  if (r.url().includes('/assets/audio/')) audioRequests.push(r.url().split('/').pop());
});

await page.goto(base);
await page.waitForTimeout(4000);
const beforeGesture = [...audioRequests];
await page.mouse.click(5, 5);
await page.waitForTimeout(1000);
const afterGesture = [...audioRequests];
await page.getByTestId('play').click();
await page.waitForTimeout(5000);
const afterPlay = [...audioRequests];

const decoded = await page.evaluate(async (names) => {
  const ac = new OfflineAudioContext(2, 44100, 44100);
  const out = [];
  for (const n of names) {
    try {
      const buf = await (await fetch(`assets/audio/${n}.ogg`)).arrayBuffer();
      const a = await ac.decodeAudioData(buf);
      let peak = 0;
      const d = a.getChannelData(0);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      out.push({ n, ok: true, dur: a.duration.toFixed(3), ch: a.numberOfChannels, peak: peak.toFixed(3) });
    } catch (e) {
      out.push({ n, ok: false, err: String(e) });
    }
  }
  return out;
}, files);

console.table(decoded);
console.log('audio requests before gesture:', beforeGesture, 'after gesture (title, before Play):', afterGesture);
console.log('after Play:', afterPlay);
console.log('console errors:', errors);
await browser.close();
const bad = decoded.some((d) => !d.ok) || errors.length > 0 || beforeGesture.length > 0 || afterGesture.length > 0 || afterPlay[0] !== 'music-explore.ogg';
process.exit(bad ? 1 : 0);
