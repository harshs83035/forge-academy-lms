"""Run: python3 narration/tests/test_narration.py   (needs numpy + ffmpeg only; no ML models)"""
import json, os, shutil, subprocess, sys, tempfile
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "narration"))
import sync as S, backends as B

ok = fail = 0
def check(name, cond, extra=""):
    global ok, fail
    ok, fail = (ok + 1, fail) if cond else (ok, fail + 1)
    print(f"{'PASS' if cond else 'FAIL'}  {name}{('  → ' + extra) if extra else ''}")

# ---------- unit: plan_fit
segs = [{"start": 1, "end": 5}, {"start": 6, "end": 10}, {"start": 11, "end": 15}]
p = S.plan_fit(segs, [3.0, 3.0, 3.0], 20)
check("clip that fits keeps speed 1.0 and its start", all(x["speed"] == 1 for x in p) and p[0]["start"] == 1 and p[1]["start"] == 6)
p = S.plan_fit(segs, [6.0, 3.0, 3.0], 20)   # slot = 6-1-0.15 = 4.85 ; need 1.237x
check("slightly long clip is sped up (not flagged)", 1.2 < p[0]["speed"] <= 1.25 and p[0]["status"] == "sped_up", f"speed={p[0]['speed']}")
check("sped-up clip ends before next segment", p[0]["start"] + p[0]["final"] <= 6 - 0.1)
p = S.plan_fit(segs, [9.0, 3.0, 3.0], 20)   # needs 1.86x > 1.25
check("much-too-long clip is flagged too_long and capped at max_speed", p[0]["status"] == "too_long" and p[0]["speed"] == 1.25)
check("overrun pushes the next clip later (drift) then it re-syncs", p[1]["start"] > 6 and p[2]["start"] == 11, f"{p[1]['start']}")
p = S.plan_fit(segs, [0.5, 0.5, 0.5], 20)
check("never slows speech down", all(x["speed"] == 1 for x in p))

# ---------- unit: render exactness
t = np.arange(int(2 * S.SR)) / S.SR; tone = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
plans = S.plan_fit([{"start": 1, "end": 3}], [2.0], 10)
audio, w = S.render([tone], plans, 10)
check("rendered track has exactly the video's length", len(audio) == 10 * S.SR)
env = np.abs(audio); first = np.argmax(env > 0.05) / S.SR
check("clip lands at its planned start (±20 ms)", abs(first - 1.0) < 0.02, f"{first:.3f}s")
check("silence before the clip", np.max(env[: int(0.9 * S.SR)]) < 1e-4)
st = S.stretch(tone, 1.25); check("ffmpeg atempo shortens by ~1.25x", abs(len(st) / S.SR - 2.0 / 1.25) < 0.05, f"{len(st)/S.SR:.3f}s")
check("peak normalised", abs(np.max(np.abs(audio)) - 0.7) < 0.01)

# ---------- unit: glossary protect/restore
gl = B.load_glossary(os.path.join(ROOT, "narration", "glossary.tsv"))
txt, mp = B.protect("Apply lock-out and tag-out to the hydraulic press.", gl)
check("glossary terms are protected before translation", "lock-out" not in txt and len(mp) == 3, txt)
out, miss = B.restore(txt.replace("Apply", "लगाएँ"), mp); check("terms restored with approved Hindi", "लॉक-आउट" in out and "हाइड्रोलिक प्रेस" in out and not miss)
_, miss = B.restore("translation lost the placeholders", mp); check("lost glossary terms are reported for review", len(miss) == 3)
m = B.merge_segments([{"start": 0, "end": 2, "text": "Hello there"}, {"start": 2.1, "end": 4, "text": "and welcome."}, {"start": 6, "end": 7, "text": "Next."}])
check("segments merged into sentences", len(m) == 2 and m[0]["text"] == "Hello there and welcome.")

# ---------- end-to-end with test doubles: video -> transcript/translation files -> mock TTS -> sync -> m4a -> encrypted HLS
src = os.path.join(ROOT, "storage", "source", "sample_video.mp4")
if not os.path.exists(src): subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "make-sample.py")], check=True)
work = tempfile.mkdtemp(); out_hls = os.path.join(work, "hls")
en_audio = os.path.join(ROOT, "storage", "source", "audio_en.m4a"); muxed = os.path.join(work, "english_source.mp4")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-i", en_audio, "-c", "copy", "-shortest", muxed], check=True)   # a video WITH an English track
silent = subprocess.run([sys.executable, os.path.join(ROOT, "narration", "pipeline.py"), "extract", "--work", f"{work}/s", "--video", src], capture_output=True, text=True)
check("video without audio is rejected with a clear message", silent.returncode != 0 and "no audio track" in (silent.stderr + silent.stdout))
src = muxed
cli = [sys.executable, os.path.join(ROOT, "narration", "pipeline.py"), "run", "--work", f"{work}/w", "--video", src,
       "--stt", "file", "--transcript", os.path.join(HERE, "fixtures", "transcript.en.json"),
       "--mt", "file", "--translations", os.path.join(HERE, "fixtures", "translation.hi.json"), "--tts", "mock", "--out", out_hls]
r = subprocess.run(cli, capture_output=True, text=True); check("pipeline `run` completes", r.returncode == 0, (r.stderr or r.stdout)[-300:] if r.returncode else "")
rep = json.load(open(f"{work}/w/sync_report.json"))
check("sync report has one entry per segment with Hindi text", len(rep["segments"]) == 5 and all(s["hi"] for s in rep["segments"]))
hi = S.decode(f"{work}/w/audio_hi.m4a"); en = S.decode(f"{work}/w/audio_en.m4a")
check("Hindi track duration == English track duration (±0.1s)", abs(len(hi) - len(en)) / S.SR < 0.1, f"hi={len(hi)/S.SR:.2f}s en={len(en)/S.SR:.2f}s")
ok_windows = True
for s in rep["segments"]:
    a, b = int(s["start"] * S.SR), int((s["start"] + s["final"]) * S.SR)
    ok_windows &= float(np.sqrt(np.mean(hi[a + 2000:b - 2000] ** 2))) > 0.05
check("audio energy present inside every planned speech window", ok_windows)
gaps_quiet = np.sqrt(np.mean(hi[int(0.0 * S.SR): int(0.9 * S.SR)] ** 2)) < 0.01 and np.sqrt(np.mean(hi[int(29.9*S.SR):] ** 2)) < 0.05
check("silence outside speech windows (lead-in)", gaps_quiet)
master = open(f"{out_hls}/master.m3u8").read()
check("HLS master has EN + HI audio renditions in ONE stream", 'LANGUAGE="en"' in master and 'LANGUAGE="hi"' in master and master.count("EXT-X-STREAM-INF") == 1)
check("segments are AES-128 encrypted", "METHOD=AES-128" in open(f"{out_hls}/hi/index.m3u8").read())
shutil.rmtree(work)
print(f"\n{ok} passed, {fail} failed"); sys.exit(1 if fail else 0)
