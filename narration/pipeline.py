#!/usr/bin/env python3
"""English video -> Hindi audio track -> encrypted dual-audio HLS, locally (no cloud APIs).

  extract     video                -> audio_en.m4a (the English track) + 16 kHz wav for speech recognition
  transcribe  audio                -> transcript.en.json          (faster-whisper, or --stt file)
  translate   transcript           -> translation.hi.json         (NLLB + glossary, or --mt file)   <-- HUMAN REVIEW HERE
  synthesize  translation          -> audio_hi.m4a + sync_report.json (Hindi TTS, timing fit to the English timeline)
  package     video + 2 audio      -> storage/hls/<id> (AES-128 HLS, EN+HI renditions) via scripts/package-hls.sh
  run         all of the above (use --stop-after translate to pause for review, then run `synthesize` + `package`)

Edit translation.hi.json between `translate` and `synthesize`: fix the "hi" text, set "status": "reviewed".
"""
from __future__ import annotations
import argparse, json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import backends as B
import sync as S

ROOT = os.path.dirname(HERE)


def jload(p): return json.load(open(p, encoding="utf-8"))
def jsave(p, o): json.dump(o, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
def run(cmd): subprocess.run(cmd, check=True)
def duration(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode().strip())


def cmd_extract(a):
    os.makedirs(a.work, exist_ok=True)
    streams = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", a.video]).decode().strip()
    if not streams: sys.exit(f"{a.video} has no audio track - the English narration must be in the video.")
    run(["ffmpeg", "-y", "-v", "error", "-i", a.video, "-vn", "-c:a", "aac", "-b:a", "128k", "-ac", "2", f"{a.work}/audio_en.m4a"])
    run(["ffmpeg", "-y", "-v", "error", "-i", a.video, "-vn", "-ac", "1", "-ar", "16000", f"{a.work}/audio_en_16k.wav"])
    jsave(f"{a.work}/meta.json", {"video": os.path.abspath(a.video), "duration": duration(a.video)})
    print("extracted English audio")


def cmd_transcribe(a):
    meta = jload(f"{a.work}/meta.json")
    if a.stt == "file":
        segs = jload(a.transcript)["segments"]
    else:
        segs = B.merge_segments(B.stt_faster_whisper(f"{a.work}/audio_en_16k.wav", a.whisper_model, a.device, a.compute_type))
    segs = [{"id": i, **s} for i, s in enumerate(segs)]
    jsave(f"{a.work}/transcript.en.json", {"duration": meta["duration"], "segments": segs})
    print(f"transcribed {len(segs)} segments")


def cmd_translate(a):
    t = jload(f"{a.work}/transcript.en.json"); gl = B.load_glossary(a.glossary)
    segs = t["segments"]
    if a.mt == "file":
        given = {s["id"]: s["hi"] for s in jload(a.translations)["segments"]}
        hi = [given[s["id"]] for s in segs]; flags = [[] for _ in segs]
    else:
        prot = [B.protect(s["text"], gl) for s in segs]
        raw = B.translate_nllb([p[0] for p in prot], a.nllb_model)
        hi, flags = [], []
        for r, (_, mapping) in zip(raw, prot):
            txt, missing = B.restore(r, mapping)
            hi.append(txt); flags.append([f"glossary_term_lost:{m}" for m in missing])
    out = [{**s, "hi": h, "status": "auto", "flags": f} for s, h, f in zip(segs, hi, flags)]
    jsave(f"{a.work}/translation.hi.json", {"duration": t["duration"], "segments": out})
    n = sum(1 for o in out if o["flags"])
    print(f"translated {len(out)} segments ({n} need attention). REVIEW {a.work}/translation.hi.json before synthesizing.")


def cmd_synthesize(a):
    tr = jload(f"{a.work}/translation.hi.json"); segs = tr["segments"]; total = tr["duration"]
    if a.require_review and any(s.get("status") != "reviewed" for s in segs):
        sys.exit("Some segments are not marked \"status\": \"reviewed\". Review translation.hi.json (or drop --require-review).")
    if a.tts == "piper": synth = B.tts_piper(a.piper_model)
    else: synth = B.TTS[a.tts]()
    os.makedirs(f"{a.work}/hi_clips", exist_ok=True)
    clips = [synth(s["hi"]) for s in segs]
    plans = S.plan_fit(segs, [len(c) / S.SR for c in clips], total, max_speed=a.max_speed)
    audio, warns = S.render(clips, plans, total)
    if a.background:
        bg = S.decode(a.background); bg = np.pad(bg, (0, max(0, len(audio) - len(bg))))[: len(audio)]; audio = np.clip(audio + a.bg_gain * bg, -1, 1)
    raw = f"{a.work}/audio_hi.f32"; open(raw, "wb").write(audio.astype(np.float32).tobytes())
    run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(S.SR), "-ac", "1", "-i", raw, "-c:a", "aac", "-b:a", "128k", "-ac", "2", f"{a.work}/audio_hi.m4a"]); os.remove(raw)
    report = [{"id": s["id"], "en": s["text"], "hi": s["hi"], "en_window": [s["start"], s["end"]], **p} for s, p in zip(segs, plans)]
    jsave(f"{a.work}/sync_report.json", {"tts": a.tts, "warnings": warns, "segments": report})
    bad = [r for r in report if r["flags"]]
    print(f"audio_hi.m4a written ({total:.1f}s). sped-up: {sum(r['status']=='sped_up' for r in report)}, need shortening: {len(bad)}")
    for r in bad: print(f"  segment {r['id']}: {r['status']}  (natural {r['natural']}s) -> shorten the Hindi text")
    if a.tts == "mock": print("NOTE: --tts mock produces beeps, not speech (test double).")


def cmd_package(a):
    meta = jload(f"{a.work}/meta.json")
    run(["bash", os.path.join(ROOT, "scripts", "package-hls.sh"), meta["video"], f"{a.work}/audio_en.m4a", f"{a.work}/audio_hi.m4a", a.out])
    print("packaged ->", a.out)


def cmd_run(a):
    cmd_extract(a); cmd_transcribe(a); cmd_translate(a)
    if a.stop_after == "translate": return print("Paused for review. Next: synthesize, then package.")
    cmd_synthesize(a)
    if a.out: cmd_package(a)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    def add(name, fn, *args):
        s = sub.add_parser(name); s.set_defaults(fn=fn); s.add_argument("--work", required=True, help="working directory for this video")
        for x in args: x(s)
        s.add_argument("--video"); s.add_argument("--stt", choices=["faster-whisper", "file"], default="faster-whisper"); s.add_argument("--transcript")
        s.add_argument("--whisper-model", default="small"); s.add_argument("--device", default="auto"); s.add_argument("--compute-type", default="int8")
        s.add_argument("--mt", choices=["nllb", "file"], default="nllb"); s.add_argument("--translations"); s.add_argument("--nllb-model", default="facebook/nllb-200-distilled-600M")
        s.add_argument("--glossary", default=os.path.join(HERE, "glossary.tsv"))
        s.add_argument("--tts", choices=["mms", "parler", "piper", "mock"], default="mms"); s.add_argument("--piper-model")
        s.add_argument("--max-speed", type=float, default=1.25); s.add_argument("--require-review", action="store_true")
        s.add_argument("--background", help="optional music/effects stem (wav) to mix under the Hindi voice"); s.add_argument("--bg-gain", type=float, default=0.8)
        s.add_argument("--out", help="package output dir, e.g. storage/hls/<video-id>"); s.add_argument("--stop-after", choices=["translate"])
    for n, f in [("extract", cmd_extract), ("transcribe", cmd_transcribe), ("translate", cmd_translate), ("synthesize", cmd_synthesize), ("package", cmd_package), ("run", cmd_run)]:
        add(n, f)
    a = p.parse_args()
    try:
        a.fn(a)
    except Exception as e:  # model download / load problems get an actionable message instead of a traceback
        msg = f"{type(e).__name__}: {e}"
        if any(k in msg.lower() for k in ("403", "proxy", "connect", "resolve", "offline", "huggingface", "not a local folder", "couldn't connect")):
            sys.exit("Could not load a model (no network / blocked / not found).\n"
                     "On a machine WITHOUT internet access: download the model once on a connected machine, copy the folder across and pass its path\n"
                     "(--whisper-model /models/faster-whisper-small  --nllb-model /models/nllb-200-distilled-600M), and set HF_HUB_OFFLINE=1.\n"
                     f"Original error: {msg[:200]}")
        raise


if __name__ == "__main__":
    main()
