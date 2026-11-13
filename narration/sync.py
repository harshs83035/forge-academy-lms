"""Timing + mixing: fits synthesized Hindi clips into the English timeline and renders one audio track.
Pure numpy + ffmpeg (no ML), so it is fully unit-testable."""
from __future__ import annotations
import subprocess
import numpy as np

SR = 44100


def _ff(args: list[str], data: bytes | None = None) -> bytes:
    r = subprocess.run(["ffmpeg", "-v", "error", *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode:
        raise RuntimeError(r.stderr.decode(errors="replace"))
    return r.stdout


def decode(path: str, sr: int = SR) -> np.ndarray:
    """Any audio/video file -> mono float32 at `sr`."""
    return np.frombuffer(_ff(["-i", path, "-vn", "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"]), dtype=np.float32).copy()


def resample(arr: np.ndarray, src_sr: int, dst_sr: int = SR) -> np.ndarray:
    if src_sr == dst_sr:
        return arr.astype(np.float32)
    out = _ff(["-f", "f32le", "-ar", str(src_sr), "-ac", "1", "-i", "-", "-f", "f32le", "-ar", str(dst_sr), "-ac", "1", "-"], arr.astype(np.float32).tobytes())
    return np.frombuffer(out, dtype=np.float32).copy()


def stretch(arr: np.ndarray, speed: float, sr: int = SR) -> np.ndarray:
    """Pitch-preserving tempo change (speed>1 = faster) using ffmpeg atempo (chained for >2x / <0.5x)."""
    if abs(speed - 1) < 0.005:
        return arr
    chain, s = [], speed
    while s > 2.0: chain.append("atempo=2.0"); s /= 2.0
    while s < 0.5: chain.append("atempo=0.5"); s /= 0.5
    chain.append(f"atempo={s:.5f}")
    out = _ff(["-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "-", "-filter:a", ",".join(chain), "-f", "f32le", "-ar", str(sr), "-ac", "1", "-"], arr.tobytes())
    return np.frombuffer(out, dtype=np.float32).copy()


def plan_fit(segments: list[dict], durations: list[float], total: float, *, max_speed: float = 1.25, min_gap: float = 0.15, max_drift: float = 1.5) -> list[dict]:
    """Decide where each clip starts and how much to speed it up.

    segments:  English segments [{start, end, ...}] (the timeline we must stay in step with)
    durations: natural length (s) of each synthesized Hindi clip
    A clip may use the silence up to the next English segment's start. If it still does not fit it is sped up
    (never slowed) to at most `max_speed`; beyond that it is flagged `too_long` so a human can shorten the
    translation. If an earlier clip overran, later clips start late (`drift`) but re-sync at the next English start.
    """
    plans, cursor = [], 0.0
    for i, (seg, d) in enumerate(zip(segments, durations)):
        start = max(seg["start"], cursor)
        nxt = segments[i + 1]["start"] if i + 1 < len(segments) else total
        slot = nxt - start - min_gap
        flags, speed = [], 1.0
        if slot <= 0.2:
            flags.append("no_room"); speed = max_speed
        elif d > slot:
            need = d / slot
            speed = min(need, max_speed)
            if need > max_speed + 1e-9: flags.append("too_long")
        final = d / speed
        if start - seg["start"] > max_drift: flags.append("drift")
        status = "ok" if not flags and speed == 1.0 else ("sped_up" if not flags else "+".join(flags))
        plans.append({"index": i, "start": round(start, 3), "speed": round(speed, 3), "natural": round(d, 3), "final": round(final, 3), "status": status, "flags": flags})
        cursor = start + final + min_gap
    return plans


def render(clips: list[np.ndarray], plans: list[dict], total: float, sr: int = SR, peak: float = 0.7) -> tuple[np.ndarray, list[str]]:
    """Mix stretched clips onto a silent timeline of exactly `total` seconds. Returns (audio, warnings)."""
    out = np.zeros(int(total * sr), dtype=np.float32)
    warnings, fade = [], int(0.01 * sr)
    for clip, p in zip(clips, plans):
        c = stretch(clip, p["speed"], sr).copy()
        if len(c) > 2 * fade:
            c[:fade] *= np.linspace(0, 1, fade); c[-fade:] *= np.linspace(1, 0, fade)
        a = int(p["start"] * sr); b = a + len(c)
        if b > len(out):
            warnings.append(f"clip {p['index']} truncated by {(b - len(out)) / sr:.2f}s at end of video"); c = c[: len(out) - a]; b = len(out)
        out[a:b] += c
    m = float(np.max(np.abs(out))) if len(out) else 0.0
    if m > 0: out *= peak / m
    return out, warnings
