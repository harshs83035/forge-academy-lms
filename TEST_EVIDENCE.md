# Test evidence

Run date: 2026-11-13 · Environment: Linux sandbox, Node 22, PostgreSQL 16, `next build && next start` (production build). Repeatable with `npm run smoke` (also runs in CI).

## 1. Automated API run — `node scripts/smoke.mjs` (on a freshly seeded DB)
```
== LMS smoke test against http://localhost:3100

PASS  bad password rejected (401)
PASS  learner login
PASS  learner blocked from admin API (403)
PASS  no cookie → 401
PASS  admin cannot create an Admin (403)
PASS  admin cannot change security settings (403)
PASS  admin creates learner
PASS  super admin creates admin
PASS  locked video refused (sequential unlock, 403)
PASS  playback grant issued  → tracks: en,hi
PASS  stream without token → 401
PASS  token without session cookie → 401
PASS  master playlist with token+cookie → 200, two audio renditions
PASS  playlist key URI rewritten to authenticated endpoint
PASS  AES key served with token+session (200)
PASS  AES key refused without session cookie (401)
PASS  segment served (200)
PASS  enc.key not reachable as a file (404)
PASS  path traversal blocked
PASS  token for another video refused
PASS  forged token refused
PASS  heartbeat accepted for active stream
PASS  duplicate stream detected (older stream gets conflict)
PASS  second login (device B) succeeds
PASS  OLD session invalidated (REPLACED)  → {"error":"Not authenticated","reason":"REPLACED"}
PASS  old playback token dead on stream
PASS  device limit enforced on 3rd device (403 DEVICE_LIMIT)  → Device limit reached (2/2). Ask your administrator to reset your registered devices.
PASS  video 2 playback granted (video 1 completed)
PASS  ANTI-SKIP: jumping to the end does NOT complete the video  → pct=53%
PASS  honest real-time watching completes it (≥90%)  → pct=100%
PASS  quiz fail below pass mark  → score=0%
PASS  quiz response never leaks correct answers
PASS  quiz pass → certificate issued  → 100% FA-2026-522BE3D0
PASS  certificate PDF downloads
PASS  other learner cannot download it (403)
PASS  verification page API: valid
PASS  verification: unknown ID invalid
PASS  quiz locked until all videos done (403)
PASS  CSV export
PASS  audit log recorded KEY_ISSUED
PASS  audit log recorded DUPLICATE_STREAM
PASS  audit log recorded STREAM_DENIED
PASS  audit log recorded LOGIN_BLOCKED
PASS  audit log recorded PLAYBACK_START

44 passed, 0 failed
```

Highlights asked for by the reviewer:
- **Anti-skip:** from a saved position of 15s, one heartbeat claiming position 29s credited only ~53% (not completed). Real-time watching to the end completed at ≥90%. (My first run of this test failed — the elapsed-time cap was unbounded after long gaps — fixed by restarting the clock at stream start and capping each heartbeat at 15s.)
- **Single session:** second login invalidates the first session (`reason: REPLACED`), and the old session's playback token stops working on the stream endpoint. A second tab claiming the stream makes the first tab's heartbeat return `conflict`. `block` mode (Super Admin setting) was checked manually earlier: second login is refused with `SESSION_ACTIVE`.
- **Device limit:** third distinct device is refused (2/2) until an admin resets devices.

## 2. Browser run (Playwright + Chromium, H.264/AAC supported)
Observed in a real page, not just API calls:
- hls.js played the encrypted stream: requests for `master.m3u8`, `v/index.m3u8`, `en/index.m3u8`, `key`, then `.ts` segments — all 200 with the token appended.
- Resume: opened a half-watched video; playback started at ~15s.
- Language switch English → हिन्दी while playing: `currentTime` kept advancing (21.7s → 23.2s), no page reload. (Audio *content* is two distinct beep tones; it was verified through the track switch and network requests, not by listening.)
- Auto-completion tick appeared after ≥90% watched.
- Watermark: two overlay nodes present (name, ID, email, IST timestamp); after removing one node and hiding the other via script, both were restored within ~1.5s.
- `video.requestFullscreen()` rejected (`NotAllowedError`); double-click left `document.fullscreenElement` null; no fullscreen button in the DOM.
- Context-menu event and F12 keydown were default-prevented.
- Screenshots (login, dashboard, course, player, quiz, reports, admin screens) were captured and reviewed during the run.

## 3. Narration pipeline — `npm run narration:test` (23 checks, all pass)
Covers: speed-up/flagging/drift/re-sync maths, exact track length, clip landing within 20 ms of plan, glossary protect/restore, sentence merging, rejection of videos with no audio, and an end-to-end run (video → fixture transcript/translation → **mock beep voice** → sync → m4a → encrypted HLS) asserting Hindi duration = English duration (30.00s each), energy inside every speech window, one stream with EN+HI renditions, AES-128.
**Not covered:** Whisper, NLLB and Hindi TTS were never executed (Hugging Face is blocked from the build sandbox; no GPU). A real offline-model failure produces an actionable message (verified). Translation/voice quality is unknown until run on real content.

## 4. Not covered / known gaps
- Docker image and nginx profile were **not built or run** (no Docker daemon in the build sandbox).
- Audio was synthetic tones; no real Hindi narration yet (AI narration pipeline not built).
- No load testing; rate limiter is in-memory (single instance).
- Not tested on Safari/iOS or Firefox.
- Client-side protections (watermark, fullscreen, shortcut blocking) are deterrents; they cannot be proven "unbypassable" by a test.
