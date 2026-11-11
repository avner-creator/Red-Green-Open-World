"""Render Pip's lines with Kokoro-82M (ONNX, Apache-2.0) into raw WAV files.

Called by scripts/gen-pip-voice.mjs:
    python tts.py <model.onnx> <voice.bin> <jobs.json> <out_dir>
jobs.json is a list of {"id": "...", "spoken": "..."}; writes <out_dir>/<id>.wav (24 kHz mono).
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro


def main() -> None:
    model, voice_bin, jobs_path, out_dir = sys.argv[1:5]
    style = np.fromfile(voice_bin, dtype=np.float32).reshape(-1, 1, 256)
    voices_npz = out_dir + "/_voice.npz"
    np.savez(voices_npz, pip=style)
    tts = Kokoro(model, voices_npz)
    with open(jobs_path, encoding="utf-8") as f:
        jobs = json.load(f)
    for i, job in enumerate(jobs):
        audio, sr = tts.create(job["spoken"], voice=style, speed=1.0, lang="en-us")
        sf.write(f"{out_dir}/{job['id']}.wav", audio, sr, subtype="FLOAT")
        print(f"[{i + 1}/{len(jobs)}] {job['id']} {len(audio) / sr:.2f}s", flush=True)


if __name__ == "__main__":
    main()
