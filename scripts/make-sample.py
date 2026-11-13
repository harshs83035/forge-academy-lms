#!/usr/bin/env python3
"""Generates the placeholder demo footage: a 30s animated 'machinery' clip plus two distinguishable
audio tracks (English = single beeps, Hindi = triple beeps). Real content comes from the client's
video team; this only exists so the prototype can demonstrate HLS + dual audio without assets."""
import math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 960, 540, 24, 30
out = os.path.join(os.path.dirname(__file__), "..", "storage", "source")
os.makedirs(out, exist_ok=True)
NAVY, ORANGE, STEEL = (10, 22, 46), (255, 122, 26), (150, 165, 190)
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
f_big, f_mid, f_sm = (ImageFont.truetype(F, s) for s in (40, 24, 18))

def gear(d, cx, cy, ro, ri, teeth, ang, fill, hub):
    pts = []
    for i in range(teeth * 4):
        a = ang + i * math.pi * 2 / (teeth * 4)
        r = ro if i % 4 in (0, 1) else ri
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=fill)
    d.ellipse([cx - ri * .55, cy - ri * .55, cx + ri * .55, cy + ri * .55], fill=hub)
    d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=NAVY)

enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
    "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20",
    os.path.join(out, "sample_video.mp4")], stdin=subprocess.PIPE)

for n in range(FPS * DUR):
    t = n / FPS
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    for y in range(0, H, 6):  # subtle gradient
        c = int(18 + 22 * y / H); d.line([(0, y), (W, y)], fill=(8, c, c + 28))
    for x in range(0, W, 60): d.line([(x, 0), (x, H)], fill=(20, 36, 70))
    for y in range(0, H, 60): d.line([(0, y), (W, y)], fill=(20, 36, 70))
    a = t * 1.1
    gear(d, 330, 290, 130, 108, 12, a, STEEL, (110, 125, 150))
    gear(d, 330 + 238 * math.cos(-0.5), 290 + 238 * math.sin(-0.5), 86, 70, 8, -a * 1.5 + 0.2, ORANGE, (200, 90, 10))
    gear(d, 560, 420, 60, 48, 6, a * 2.2, (90, 110, 150), (60, 75, 105))
    d.text((60, 40), "SAMPLE TRAINING CLIP", font=f_big, fill=(255, 255, 255))
    d.text((60, 92), "Hydraulic press · drive train overview (placeholder footage)", font=f_mid, fill=STEEL)
    d.rectangle([640, 170, 910, 330], outline=ORANGE, width=3)
    d.text((660, 185), "AUDIO CHECK", font=f_mid, fill=ORANGE)
    d.text((660, 225), "English = single beep", font=f_sm, fill=(255, 255, 255))
    d.text((660, 255), "Hindi   = triple beep", font=f_sm, fill=(255, 255, 255))
    d.text((660, 290), "Switch language in player", font=f_sm, fill=STEEL)
    bw = int((W - 120) * t / DUR)
    d.rectangle([60, H - 50, W - 60, H - 42], fill=(30, 48, 88)); d.rectangle([60, H - 50, 60 + bw, H - 42], fill=ORANGE)
    d.text((60, H - 36), f"{int(t // 60):02d}:{int(t % 60):02d} / 00:{DUR:02d}", font=f_sm, fill=STEEL)
    enc.stdin.write(im.tobytes())
enc.stdin.close(); enc.wait()

def audio(name, expr):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"aevalsrc={expr}:s=44100:d={DUR}",
        "-ac", "2", "-c:a", "aac", "-b:a", "128k", os.path.join(out, name)], check=True)
audio("audio_en.m4a", "'0.3*sin(2*PI*440*t)*lt(mod(t,1),0.3)'")
audio("audio_hi.m4a", "'0.3*sin(2*PI*660*t)*(lt(mod(t,1.5),0.15)+between(mod(t,1.5),0.3,0.45)+between(mod(t,1.5),0.6,0.75))'")
print("sample sources written to", os.path.abspath(out))
