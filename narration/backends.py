"""Pluggable model backends. Heavy libraries are imported lazily so the pipeline (and its tests) run without them.

Each real backend is written against the library's documented API. Offline model files can be used by pointing
the model arguments at local directories (set HF_HUB_OFFLINE=1) - nothing is sent to any external service.
"""
from __future__ import annotations
import json, os, re, shutil, subprocess, tempfile
import numpy as np
from sync import resample, SR

# ------------------------------------------------------------------ speech-to-text
def stt_faster_whisper(audio_path: str, model: str = "small", device: str = "auto", compute_type: str = "int8", language: str = "en") -> list[dict]:
    from faster_whisper import WhisperModel  # CTranslate2 runtime: CPU-friendly with int8, fast on GPU with float16
    m = WhisperModel(model, device=device, compute_type=compute_type)
    segs, _info = m.transcribe(audio_path, language=language, vad_filter=True, beam_size=5)
    return [{"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()} for s in segs if s.text.strip()]


def merge_segments(segs: list[dict], max_gap: float = 0.35, max_len: float = 12.0) -> list[dict]:
    """Whisper often splits sentences; translation and voice sound better per full sentence."""
    out: list[dict] = []
    for s in segs:
        if out and s["start"] - out[-1]["end"] <= max_gap and s["end"] - out[-1]["start"] <= max_len and not re.search(r"[.!?।]\s*$", out[-1]["text"]):
            out[-1] = {"start": out[-1]["start"], "end": s["end"], "text": f"{out[-1]['text']} {s['text']}"}
        else:
            out.append(dict(s))
    return out

# ------------------------------------------------------------------ glossary (keep machinery terms consistent)
def load_glossary(path: str | None) -> list[tuple[str, str]]:
    """TSV: english_term <TAB> hindi_rendering. Longest terms first."""
    if not path or not os.path.exists(path): return []
    rows = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "\t" in line:
            en, hi = line.split("\t", 1); rows.append((en.strip(), hi.strip()))
    return sorted(rows, key=lambda r: -len(r[0]))


def protect(text: str, glossary: list[tuple[str, str]]) -> tuple[str, dict[str, str]]:
    mapping = {}
    for n, (en, hi) in enumerate(glossary):
        tok = f"QZ{n}QZ"
        text, c = re.subn(rf"\b{re.escape(en)}\b", tok, text, flags=re.I)
        if c: mapping[tok] = hi
    return text, mapping


def restore(text: str, mapping: dict[str, str]) -> tuple[str, list[str]]:
    missing = []
    for tok, hi in mapping.items():
        if tok in text: text = text.replace(tok, hi)
        else: missing.append(hi)
    return text, missing

# ------------------------------------------------------------------ translation
def translate_nllb(texts: list[str], model_name: str = "facebook/nllb-200-distilled-600M", device: str | None = None, batch: int = 8) -> list[str]:
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    tok = AutoTokenizer.from_pretrained(model_name, src_lang="eng_Latn")
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name).to(device).eval()
    out: list[str] = []
    for i in range(0, len(texts), batch):
        enc = tok(texts[i:i + batch], return_tensors="pt", padding=True, truncation=True, max_length=256).to(device)
        with torch.no_grad():
            gen = model.generate(**enc, forced_bos_token_id=tok.convert_tokens_to_ids("hin_Deva"), max_new_tokens=256, num_beams=4)
        out += tok.batch_decode(gen, skip_special_tokens=True)
    return out

# ------------------------------------------------------------------ text-to-speech: each returns a callable text -> float32 mono @ SR
def tts_mms(model_name: str = "facebook/mms-tts-hin", device: str | None = None):
    """Light CPU-capable Hindi VITS voice (single speaker, plain but intelligible)."""
    import torch
    from transformers import AutoTokenizer, VitsModel
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    tok = AutoTokenizer.from_pretrained(model_name); model = VitsModel.from_pretrained(model_name).to(device).eval()
    def synth(text: str) -> np.ndarray:
        with torch.no_grad():
            wav = model(**tok(text, return_tensors="pt").to(device)).waveform[0].cpu().numpy()
        return resample(wav.astype(np.float32), model.config.sampling_rate)
    return synth


def tts_parler(model_name: str = "ai4bharat/indic-parler-tts", device: str | None = None,
               voice: str = "Divya's voice is monotone yet slightly fast in delivery, with a very close recording that almost has no background noise."):
    """Higher-quality, controllable Hindi voice. Heavier: use a GPU."""
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    model = ParlerTTSForConditionalGeneration.from_pretrained(model_name).to(device).eval()
    tok = AutoTokenizer.from_pretrained(model_name); dtok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
    def synth(text: str) -> np.ndarray:
        d = dtok(voice, return_tensors="pt").to(device); p = tok(text, return_tensors="pt").to(device)
        with torch.no_grad():
            g = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask, prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
        return resample(g.cpu().numpy().squeeze().astype(np.float32), model.config.sampling_rate)
    return synth


def tts_piper(model_path: str):
    """Piper CLI (ONNX voices, very fast on CPU). Needs `piper` on PATH and a Hindi .onnx voice you supply."""
    if not shutil.which("piper"): raise RuntimeError("piper CLI not found on PATH")
    def synth(text: str) -> np.ndarray:
        with tempfile.TemporaryDirectory() as d:
            wav = os.path.join(d, "o.wav")
            subprocess.run(["piper", "--model", model_path, "--output_file", wav], input=text.encode(), check=True, capture_output=True)
            from sync import decode
            return decode(wav)
    return synth


def tts_mock(chars_per_sec: float = 13.0):
    """TEST DOUBLE - not speech. Emits beeps whose length is proportional to the text, so timing/sync/packaging can be
    exercised without any model. Never ship this."""
    def synth(text: str) -> np.ndarray:
        dur = max(0.6, len(text) / chars_per_sec)
        t = np.arange(int(dur * SR)) / SR
        return (0.4 * np.sin(2 * np.pi * 660 * t) * (np.mod(t, 0.5) < 0.35)).astype(np.float32)
    return synth

TTS = {"mms": tts_mms, "parler": tts_parler, "mock": tts_mock}
