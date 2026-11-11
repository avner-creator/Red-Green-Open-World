// Pip's spoken voice: renders one small MP3 per line in src/buddy/voiceLines.ts into
// public/assets/voice/ and writes public/assets/voice/manifest.json (id → file, text, seconds).
//
// Usage:
//   node scripts/gen-pip-voice.mjs           render missing or changed clips (incremental)
//   node scripts/gen-pip-voice.mjs --all     re-render every clip
//   node scripts/gen-pip-voice.mjs --check   no rendering: fail if a line has no clip
//
// Engine: Kokoro-82M (Apache-2.0), quantized ONNX export, run offline by the `kokoro-onnx` Python
// package (MIT) with espeak-ng phonemes (bundled by `espeakng-loader`). Everything comes from the
// npm and PyPI registries (pinned + sha256-checked) and is cached in node_modules/.cache/pip-voice/:
//   - model:  npm kokoro-q8-shards@1.0.0 (onnx-community/Kokoro-82M-v1.0-ONNX model_quantized.onnx)
//   - voice:  npm kokoro-local-runtime@0.1.0 voices/af_heart.bin (hexgrad/Kokoro-82M voice pack)
//   - python: a venv with kokoro-onnx==0.6.1 + soundfile
// Needs python3 (with venv) and ffmpeg (with librubberband + libmp3lame) on PATH.
// Post-processing makes the voice small and puppy-like: pitch up ~3.5 semitones (part formant shift,
// part formant-preserving), ~12% faster, trimmed, compressed, levelled, mono 24 kHz MP3 at 32 kbps.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runnerImport } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/assets/voice');
const CACHE = join(ROOT, 'node_modules/.cache/pip-voice');
const MANIFEST = join(OUT, 'manifest.json');
/** Bump when the voice, the engine or the post-processing changes (forces a full re-render). */
const RECIPE = 'kokoro-q8/af_heart/v2:speed0.92+asetrate1.12+rb1.09+comp+mp3-32k';
const MODEL_SHA = 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478';
const VOICE = 'af_heart';
/** Budget for the whole clip set (bytes). */
export const BUDGET = 2.5 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const sh = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, ...opts }).toString();
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function loadLines() {
  const { module } = await runnerImport(join(ROOT, 'src/buddy/voiceLines.ts'), { configFile: false, logLevel: 'error' });
  return module.allVoiceLines();
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { recipe: '', clips: {} };
  }
}

function check(lines, manifest) {
  const missing = lines.filter((l) => !manifest.clips[l.id] || !existsSync(join(OUT, manifest.clips[l.id].file)));
  const total = Object.values(manifest.clips).reduce((s, c) => s + (existsSync(join(OUT, c.file)) ? statSync(join(OUT, c.file)).size : 0), 0);
  console.log(`${lines.length} lines, ${Object.keys(manifest.clips).length} clips, ${(total / 1024).toFixed(0)} KB`);
  if (missing.length) {
    console.error(`No clip for ${missing.length} line(s):\n  ${missing.map((l) => `${l.id}: ${l.text}`).join('\n  ')}`);
    process.exit(1);
  }
  if (total > BUDGET) {
    console.error(`Voice clips are ${total} bytes, over the ${BUDGET} byte budget.`);
    process.exit(1);
  }
}

function setup() {
  mkdirSync(CACHE, { recursive: true });
  const model = join(CACHE, 'kokoro-q8.onnx');
  if (!existsSync(model) || sha256(model) !== MODEL_SHA) {
    console.log('Fetching the Kokoro model from npm (kokoro-q8-shards@1.0.0)…');
    const dir = join(CACHE, 'npm-model');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const tgz = sh('npm', ['pack', 'kokoro-q8-shards@1.0.0', '--silent', '--pack-destination', dir]).trim().split('\n').pop();
    sh('tar', ['xzf', join(dir, tgz), '-C', dir]);
    const parts = readdirSync(join(dir, 'package')).filter((f) => /^kokoro-q8\.part\d+\.bin$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    writeFileSync(model, Buffer.concat(parts.map((p) => readFileSync(join(dir, 'package', p)))));
    if (sha256(model) !== MODEL_SHA) throw new Error('Kokoro model sha256 mismatch');
  }
  const voice = join(CACHE, `${VOICE}.bin`);
  if (!existsSync(voice) || statSync(voice).size !== 510 * 256 * 4) {
    console.log('Fetching the Kokoro voice pack from npm (kokoro-local-runtime@0.1.0)…');
    const dir = join(CACHE, 'npm-voice');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const tgz = sh('npm', ['pack', 'kokoro-local-runtime@0.1.0', '--silent', '--pack-destination', dir]).trim().split('\n').pop();
    sh('tar', ['xzf', join(dir, tgz), '-C', dir, `package/voices/${VOICE}.bin`]);
    writeFileSync(voice, readFileSync(join(dir, 'package/voices', `${VOICE}.bin`)));
    if (statSync(voice).size !== 510 * 256 * 4) throw new Error('Kokoro voice pack has an unexpected size');
  }
  const py = process.env.PIP_TTS_PYTHON ?? join(CACHE, 'venv/bin/python');
  if (!existsSync(py)) {
    console.log('Creating the Python venv (kokoro-onnx)…');
    sh('python3', ['-m', 'venv', join(CACHE, 'venv')]);
    sh(join(CACHE, 'venv/bin/pip'), ['install', '-q', 'kokoro-onnx==0.6.1', 'soundfile']);
  }
  return { model, voice, py };
}

/** Mean and peak level (dB) of an audio file, from ffmpeg's volumedetect report (on stderr). */
function volumeStats(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = r.stderr ?? '';
  const mean = Number(log.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -20);
  const max = Number(log.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? 0);
  return { mean, max };
}

function postProcess(wav, mp3, work) {
  const mid = join(work, 'mid.wav');
  const chain = [
    'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.02',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.08',
    'areverse',
    'asetrate=26880', // 24000 × 1.12: +2 semitones with a slightly smaller "mouth", 12% quicker
    'aresample=24000',
    'rubberband=pitch=1.09:formant=preserved', // +1.5 semitones more, formants kept
    'highpass=f=110',
    'acompressor=threshold=-20dB:ratio=3:attack=4:release=80:makeup=2',
    'afade=t=in:d=0.008',
    'apad=pad_dur=0.06',
  ].join(',');
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', chain, '-ac', '1', '-ar', '24000', mid]);
  const { mean, max } = volumeStats(mid);
  // Level to about −18 dB mean with peaks at most −1.5 dBFS.
  const gain = Math.min(-18 - mean, -1.5 - max);
  sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', mid, '-af', `volume=${gain.toFixed(2)}dB`, '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '32k', mp3]);
  const dur = Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).trim());
  return Math.round(dur * 100) / 100;
}

async function main() {
  const lines = await loadLines();
  const ids = new Set();
  for (const l of lines) {
    if (ids.has(l.id)) throw new Error(`Duplicate clip id ${l.id}`);
    ids.add(l.id);
  }
  let manifest = readManifest();
  if (args.has('--check')) return check(lines, manifest);
  if (args.has('--all') || manifest.recipe !== RECIPE) manifest = { recipe: RECIPE, clips: {} };
  mkdirSync(OUT, { recursive: true });
  const todo = lines.filter((l) => {
    const c = manifest.clips[l.id];
    return !c || c.spoken !== l.spoken || !existsSync(join(OUT, c.file));
  });
  console.log(`${lines.length} lines, ${todo.length} to render`);
  if (todo.length) {
    const { model, voice, py } = setup();
    const work = join(CACHE, 'work');
    // Raw WAVs are named by clip id (= the line's text), so ones left by an interrupted run are
    // reused; `--all` starts clean.
    if (args.has('--all')) rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const fresh = todo.filter((l) => !existsSync(join(work, `${l.id}.wav`)));
    // Render in a few parallel shards (PIP_TTS_SHARDS, default 3): much quicker on a busy machine.
    const shards = Math.max(1, Math.min(8, Number(process.env.PIP_TTS_SHARDS ?? 3) || 1));
    const runs = [];
    for (let k = 0; k < shards; k++) {
      const part = fresh.filter((_, i) => i % shards === k);
      if (!part.length) continue;
      const dir = join(work, `s${k}`);
      mkdirSync(dir, { recursive: true });
      const jobs = join(dir, 'jobs.json');
      writeFileSync(jobs, JSON.stringify(part.map((l) => ({ id: l.id, spoken: l.spoken }))));
      runs.push(
        new Promise((ok, fail) => {
          const p = spawn(py, ['-I', join(ROOT, 'scripts/pip-voice/tts.py'), model, voice, jobs, work], { stdio: ['ignore', 'inherit', 'inherit'] });
          p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`tts shard ${k} exited with ${code}`))));
        }),
      );
    }
    await Promise.all(runs);
    for (const l of todo) {
      const file = `${l.id}.mp3`;
      const dur = postProcess(join(work, `${l.id}.wav`), join(OUT, file), work);
      manifest.clips[l.id] = { file, text: l.text, spoken: l.spoken, dur };
    }
  }
  // Drop clips for lines that no longer exist.
  for (const id of Object.keys(manifest.clips)) if (!ids.has(id)) delete manifest.clips[id];
  const keep = new Set(Object.values(manifest.clips).map((c) => c.file));
  for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !keep.has(f)) rmSync(join(OUT, f));
  const sorted = Object.fromEntries(Object.entries(manifest.clips).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify({ recipe: RECIPE, voice: `Kokoro-82M ${VOICE}`, clips: sorted }, null, 1)}\n`);
  writeAssetRows(Object.values(sorted).map((c) => c.file));
  check(lines, readManifest());
}

/** One ASSETS.md row per voice file (replacing the old ones), after the last row of the table. */
function writeAssetRows(files) {
  const path = join(ROOT, 'ASSETS.md');
  const prefix = '| public/assets/voice/';
  const kept = readFileSync(path, 'utf8').split('\n').filter((l) => !l.startsWith(prefix));
  const src = `Generated by scripts/gen-pip-voice.mjs: Kokoro-82M TTS (https://huggingface.co/hexgrad/Kokoro-82M), voice ${VOICE}; see "Pip's voice" below`;
  const rows = ['manifest.json', ...files].map((f) => `${prefix}${f} | ${src} | hexgrad (model); our own text | Apache-2.0 (model) |`);
  let last = -1;
  kept.forEach((l, i) => {
    if (l.startsWith('| public/assets/')) last = i;
  });
  kept.splice(last + 1, 0, ...rows);
  writeFileSync(path, kept.join('\n'));
}

await main();
