# Local AI Hindi narration (English video → Hindi audio track)

Goal: the client supplies **only an English video**; we produce a Hindi narration track **locally** (no cloud APIs, content never leaves the machine) and package both into the single encrypted HLS stream the LMS already plays.

```
English video ─► extract audio ─► Whisper (STT, timestamps) ─► sentence merge
   ─► glossary-protected NLLB translation ─► ★ human review of translation.hi.json ★
   ─► Hindi TTS per sentence ─► timing fit to the English timeline ─► audio_hi.m4a
   ─► scripts/package-hls.sh (video + audio_en + audio_hi → AES-128 HLS) ─► storage/hls/<id>
```

## Honest status

| Stage | Status |
|---|---|
| Orchestration, CLI, work-dir artifacts, review gate | ✅ built, tested (23 checks, `npm run narration:test`) |
| **Timing fit / sync** (speed-up ≤1.25×, never slowed, drift + re-sync, truncation guard, exact track length) | ✅ built, tested |
| Glossary protection of machinery terms + lost-term flagging | ✅ built, tested |
| Mux into the dual-audio encrypted HLS | ✅ tested (one stream, EN+HI renditions, AES-128) |
| **Whisper STT** (`faster-whisper`) | ⚠️ written against the installed library's real signature; **never run** (weights unreachable from the build sandbox) |
| **NLLB translation** | ⚠️ written to the documented transformers API; **never run** |
| **Hindi TTS** (`mms`, `parler`, `piper`) | ⚠️ written to documented APIs; **never run** |
| Quality of Hindi translation/voice on real machinery content | ❓ unknown until run; plan for human review |

The end-to-end test uses **test doubles**: transcript and Hindi text come from fixture files and the "voice" is beeps sized to the text. That proves the plumbing and the sync maths — **not** the AI quality. The first run on a real clip is the real validation.

## Setup (on the machine that will run the models)
```bash
pip install -r narration/requirements.txt      # + ffmpeg on PATH; GPU strongly recommended
python3 narration/tests/test_narration.py      # plumbing check, no models needed
```
Offline / on-prem: download the models once on a connected machine (`faster-whisper-small`/`medium`, `facebook/nllb-200-distilled-600M`, `facebook/mms-tts-hin`, optionally `ai4bharat/indic-parler-tts`), copy them over, set `HF_HUB_OFFLINE=1`, and pass local paths (`--whisper-model`, `--nllb-model`).

## Use
```bash
# 1. English video -> reviewable Hindi translation
python3 narration/pipeline.py run --work work/m1v01 --video english.mp4 --stop-after translate
#    open work/m1v01/translation.hi.json : fix "hi" text, check "flags", set "status": "reviewed"
# 2. Hindi voice + sync + package into the LMS media folder
python3 narration/pipeline.py synthesize --work work/m1v01 --tts mms --require-review
python3 narration/pipeline.py package    --work work/m1v01 --out storage/hls/m1v01
#    work/m1v01/sync_report.json lists every segment: speed applied, or "too_long" -> shorten that Hindi sentence and re-run synthesize
```
Then point the video's `hlsDir` at `m1v01` (the admin upload step is still stubbed — see main README).

Dry run with no models: `python3 narration/pipeline.py run --work /tmp/w --video v.mp4 --stt file --transcript narration/tests/fixtures/transcript.en.json --mt file --translations narration/tests/fixtures/translation.hi.json --tts mock --out /tmp/hls`

## Design decisions
- **Review gate is mandatory in practice.** Machine Hindi for technical/safety content (lock-out/tag-out, pressure limits) must be checked by a subject-matter expert. `--require-review` refuses to synthesize unreviewed text.
- **Glossary** (`glossary.tsv`) pins approved Hindi (or transliterated English) terms; terms the model drops are flagged.
- **Sync strategy:** Hindi is usually longer than English. Each clip may use the silence up to the next English sentence; if still too long it is sped up (pitch-preserving, ≤1.25×, configurable) rather than slowed; beyond that it is flagged for rewording instead of becoming unintelligible. Late clips re-sync at the next English start so errors never accumulate.
- **Background audio:** if the source has music/effects, supply a separated stem with `--background` (e.g. produced with Demucs); otherwise the Hindi track is voice-only.
- **Single voice** for all videos keeps the course consistent; Parler allows a chosen voice description.

## Rough planning numbers (estimates, NOT measured)
Module 1 ≈ 80–100 videos × 3–4 min ≈ 4–6 hours of audio. Whisper-small on GPU is much faster than real time; on CPU expect roughly real-time or slower. NLLB-600M and MMS-TTS are light. Parler is the slowest. Budget an SME review pass per video (~10–15 min each) — that is the real bottleneck, not compute.

## Risks to raise with the client
Hindi voice naturalness (MMS is intelligible but plain; Parler better), mixed Hindi/English technical vocabulary, voice consent/IP if a cloned voice is ever wanted (not used here), and the need for a Hindi-speaking reviewer.
