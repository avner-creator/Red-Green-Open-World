#!/usr/bin/env node
/**
 * Validates music files: each must decode (via the system ffmpeg), and we report duration,
 * sample rate, channels, size, bitrate, loudness (RMS / peak dBFS), a rough tempo estimate and
 * the loop seam (jump from the last sample back to the first, compared with the typical
 * sample-to-sample step). Exit code 1 if a file fails to decode or a loop seam would click.
 *
 * Usage: node tests/audio/validate-tracks.mjs [files...]   (default: public/assets/audio/*)
 * Loop files are those whose name does not contain "jingle".
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const SR = 44100;
const DEFAULT_DIR = 'public/assets/audio';

function listFiles() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;
  try {
    return readdirSync(DEFAULT_DIR)
      .filter((f) => /\.(ogg|mp3|wav|flac|m4a)$/i.test(f))
      .map((f) => join(DEFAULT_DIR, f));
  } catch {
    return [];
  }
}

function probe(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=sample_rate,channels,codec_name:format=duration,bit_rate', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  const j = JSON.parse(out);
  const s = j.streams?.[0] ?? {};
  return {
    codec: s.codec_name,
    sampleRate: Number(s.sample_rate),
    channels: Number(s.channels),
    duration: Number(j.format?.duration),
  };
}

/** Decodes to interleaved stereo float32 at SR (fails loudly if the file cannot be decoded). */
function decode(file) {
  const buf = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(SR), '-'],
    { maxBuffer: 1 << 30 },
  );
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

function loudness(x) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  return { rms: Math.sqrt(sum / Math.max(1, x.length)), peak };
}

/**
 * Loop seam: the jump from the last frame to the first, per channel, relative to the 99th
 * percentile of ordinary sample-to-sample steps. A ratio <= 1 means the seam is no bigger than
 * the steps the music already makes, so it cannot click. Also reports the RMS of the first and
 * last 20 ms (a loud end next to a silent start would be a level jump).
 */
function seam(x) {
  const frames = x.length / 2;
  const steps = [];
  for (let i = 1; i < frames; i += 7) {
    steps.push(Math.abs(x[2 * i] - x[2 * (i - 1)]), Math.abs(x[2 * i + 1] - x[2 * (i - 1) + 1]));
  }
  steps.sort((a, b) => a - b);
  const p99 = steps[Math.floor(steps.length * 0.99)] || 1e-9;
  const jumpL = Math.abs(x[0] - x[2 * (frames - 1)]);
  const jumpR = Math.abs(x[1] - x[2 * (frames - 1) + 1]);
  const win = Math.floor(SR * 0.02);
  const head = loudness(x.subarray(0, win * 2)).rms;
  const tail = loudness(x.subarray((frames - win) * 2)).rms;
  return { ratio: Math.max(jumpL, jumpR) / p99, jump: Math.max(jumpL, jumpR), headDb: db(head), tailDb: db(tail) };
}

/** Rough tempo: autocorrelation of a spectral-flux-like onset envelope (energy rises, 10 ms hops). */
function tempo(x) {
  const hop = Math.floor(SR / 100);
  const frames = Math.floor(x.length / 2 / hop);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      const m = x[2 * i] + x[2 * i + 1];
      e += m * m;
    }
    e = Math.log1p(e * 100);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  let best = 0;
  let bestBpm = 0;
  for (let bpm = 70; bpm <= 190; bpm += 0.5) {
    const lag = (60 / bpm) * 100;
    const l0 = Math.floor(lag);
    const fr = lag - l0;
    let s = 0;
    for (let f = 0; f + l0 + 1 < frames; f++) s += env[f] * ((1 - fr) * env[f + l0] + fr * env[f + l0 + 1]);
    s /= frames - l0;
    if (s > best) {
      best = s;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

const files = listFiles();
if (files.length === 0) {
  console.error('No audio files found.');
  process.exit(1);
}
const rows = [];
let failed = false;
let total = 0;
for (const file of files) {
  const name = basename(file);
  const size = statSync(file).size;
  total += size;
  try {
    const p = probe(file);
    const x = decode(file);
    const frames = x.length / 2;
    const l = loudness(x);
    const isLoop = !/jingle/i.test(name);
    const s = seam(x);
    const clickFree = !isLoop || (s.ratio <= 1.5 && Math.abs(s.headDb - s.tailDb) <= 12);
    if (!clickFree) failed = true;
    rows.push({
      file: name,
      codec: p.codec,
      'dur s': (frames / SR).toFixed(2),
      sr: p.sampleRate,
      ch: p.channels,
      KB: (size / 1024).toFixed(0),
      kbps: ((size * 8) / 1000 / (frames / SR)).toFixed(0),
      'rms dB': db(l.rms).toFixed(1),
      'peak dB': db(l.peak).toFixed(1),
      bpm: tempo(x).toFixed(1),
      seam: isLoop ? `${s.ratio.toFixed(2)}x (${s.headDb.toFixed(0)}/${s.tailDb.toFixed(0)} dB)` : 'n/a (one-shot)',
      ok: clickFree ? 'yes' : 'CLICK',
    });
  } catch (err) {
    failed = true;
    rows.push({ file: name, ok: `DECODE FAILED: ${String(err).slice(0, 80)}` });
  }
}
console.table(rows);
console.log(`Total: ${(total / 1024 / 1024).toFixed(2)} MB in ${files.length} files`);
process.exit(failed ? 1 : 0);
