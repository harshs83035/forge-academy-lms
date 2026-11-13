# Forge Academy — Secure LMS prototype

Secure learning platform for proprietary machinery training: role-based admin, learner dashboard, **encrypted HLS video with dual-language audio**, per-learner watermarking, quizzes and verifiable PDF certificates.

> Prototype for the Saturday client demo. Seeded demo data; media packaging, DRM licensing, facial recognition and email are stubbed (see matrix).

## Quick start

### Docker (recommended)
```bash
cp .env.example .env          # set AUTH_SECRET to 32+ random chars
docker compose up --build     # http://localhost:3000   (add --profile proxy for nginx on :80)
```
The app container creates the schema and seeds demo data on first start (`SEED_DEMO=false` to disable).

### Local development
```bash
npm install
cp .env.example .env                 # point DATABASE_URL at a Postgres 15+ database
npm run db:init && npm run db:seed   # schema (prisma/init.sql) + demo data
npm run dev                          # http://localhost:3000
```
Regenerate the sample video: `npm run sample` (needs ffmpeg + python3/Pillow). `npm run db:reset` wipes and reseeds.

## Demo credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | super@forge.demo | Super@123 |
| Admin | admin@forge.demo | Admin@123 |
| Learner (video 1 done, video 2 half-watched) | learner@forge.demo | Learner@123 |
| Learner (Module 2 fully watched → quiz ready now) | ready@forge.demo | Learner@123 |

Three more learners (rahul/priya/imran@forge.demo, same password) exist so reports look populated. Certificate `FA-2026-DEMO0001` is valid for the verification page. The login page has click-to-fill buttons.

## What's in the box

```
prisma/schema.prisma, init.sql     data model (+ hand-written DDL that mirrors it)
scripts/package-hls.sh             ffmpeg: 1 video + 2 audio tracks -> AES-128 HLS (single stream)
scripts/make-sample.py             generates the placeholder demo footage + 2 audio tracks
scripts/seed.ts, db-init.mjs       demo data, schema bootstrap
src/lib/                           auth/session, RBAC wrapper (api.ts), signed tokens + rate limit + audit (security.ts),
                                   progress engine, certificate PDF, AuthFactor hook (auth-factors.ts)
src/app/api/                       REST handlers; every mutating route is wrapped in guarded(roles, …)
src/app/(learner)/                 dashboard, course, watch, quiz, certificates
src/app/admin/                     dashboard, learners, admins, modules/videos/quiz, reports, audit, settings
src/components/player/             secure-player.tsx (hls.js + protections), watermark.ts
storage/hls/sample/                the encrypted sample package (demo key committed on purpose; real keys never are)
```

Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · PostgreSQL · Prisma 7 (pg driver adapter) · hls.js · jose/bcryptjs. UI primitives are shadcn-style, hand-written in `components/ui`.

## How playback is protected

1. Learner clicks play → `POST /api/videos/:id/playback` checks session, enrolment and sequential unlock, then claims the *active stream* for that session and returns a 120-second HMAC-signed token.
2. hls.js appends `?t=<token>` to **every** request (master, playlists, segments, key). The stream route requires the token **and** the session cookie, and that the session is the one the token was minted for and is still live (so a new login kills streams instantly).
3. Segments are AES-128 encrypted. The key is only served by `/api/stream/:id/key` after those checks; `enc.key` is not reachable by any path (whitelist + traversal guard).
4. A 5-second heartbeat saves position, refreshes the token, and detects a second stream (another tab/device) → the older one is paused.
5. Completion is computed **server-side**: watched seconds only grow by forward movement capped by real elapsed time, so scrubbing to the end can't earn the tick (≥ 90% watched).

## Security feature matrix

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | No direct MP4 URLs; signed short-lived URLs/tokens | ✅ Implemented | 120s HMAC tokens, refreshed by heartbeat |
| 1 | Right-click disabled, no download/PiP/cast controls | ✅ Implemented | custom controls; `controlsList` + `disablePictureInPicture` |
| 2 | AES-128 HLS, key behind authenticated endpoint | ✅ Implemented | per-video key + IV via ffmpeg `-hls_key_info_file` |
| 2 | Widevine / FairPlay DRM | 📋 Planned | see "Path to DRM" |
| 3 | Fullscreen disabled | ✅ Implemented | no button, API neutralised, dblclick blocked, `fullscreenchange` bounce, F11 detected (pauses) |
| 4 | Dynamic watermark (name, ID, email, time) | ✅ Implemented | DOM overlay, moves every 7s, MutationObserver + computed-style poll re-inject/restore; 3 strikes in 30s pauses playback; events audit-logged |
| 5 | Single concurrent session | ✅ Implemented | `replace` or `block` mode (Super Admin setting); old tab is bounced within ~10s |
| 5 | Duplicate-stream detection | ✅ Implemented | heartbeat + stream claim |
| 6 | Device limit + admin reset | ✅ Implemented | global default (2) + per-learner override; learners only |
| 7 | Pause on tab blur | ✅ Implemented | optional toggle, off by default |
| 7 | Screenshot / devtools shortcut blocking | ✅ Implemented (deterrent) | PrintScreen, F12, Ctrl+S/P/U, Ctrl+Shift+I/J/C, ⌘⇧3/4/5 |
| 7 | Rate-limit + audit key/segment requests | ✅ Implemented | key 30/min, segments 400/min per user (in-memory; use Redis for multi-instance); keys, denials, limits, tamper events logged |
| F | Face verification | 🧩 Stubbed | `AuthFactor` interface + simulated pre-playback step (toggle in settings) |
| – | AI Hindi narration (STT → MT → TTS → sync) | 🧩 Partial | sync + packaging tested; model stages unrun, see `narration/README.md` |
| – | Upload → transcode → package pipeline | 🧩 Stubbed | upload stored; new video points at sample package; `package-hls.sh` is the real step |
| – | Email (password reset, notifications) | 📋 Planned | admins set passwords manually for now |
| – | Per-segment key rotation, signed cookies on CDN | 📋 Planned | |

### What browser-level protection can and cannot do — honestly
- **It stops** casual saving (no URL to right-click/“Save as”, no download button), link sharing (tokens expire, are bound to one live session), account sharing (one session, device cap), and deters photos/screenshots (watermark identifies the learner).
- **It cannot stop** screen recording, a phone camera pointed at the monitor, or HDMI capture. A determined user can also read the key and segments from the network tab *while authenticated* and decrypt them with ffmpeg — AES-128 HLS protects against passive copying, not against a logged-in attacker.
- Keyboard-shortcut blocking is a speed bump (devtools can still be opened from the menu), and a user with devtools can hide the watermark node for a moment; the integrity checks re-assert it and log it, but this is a deterrent and forensic trail, not DRM.
- Fullscreen can't be fully prevented for F11 in every browser; we detect it and pause.
- iOS Safari (native HLS, no MSE on older iPads) can't carry the per-request token; use Chrome/Edge/Firefox/modern Safari with MSE.

### Path to Widevine / FairPlay DRM (production)
1. Package CMAF/fMP4 with CENC (`shaka-packager`) instead of AES-128 TS; keep the dual-audio master playlist.
2. Run a licence service (BuyDRM, EZDRM, Axinom, or self-hosted Shaka + Widevine proxy). Keys live in the DRM KMS, not on disk.
3. Replace the `/key` route with a licence-request proxy that performs the same session/enrolment/device checks and issues short-lived licences (offline disabled, `HDCP`/security-level policy).
4. hls.js (or Shaka Player) gets `drmSystems` config; Widevine L1 / FairPlay make screen capture blank on supported devices. Everything else here (tokens, watermark, sessions, audit) stays.

## Hosting recommendation notes (on-prem vs private cloud)

| | On-premises server | Private cloud (e.g. dedicated VPC) |
|---|---|---|
| Content control / compliance | Strongest: media and keys never leave the premises | Strong if region/tenancy is controlled; keys in cloud KMS/HSM |
| Cost profile | Capex + ops staff; cheap at steady load | Opex; scales for 12 modules × concurrent users |
| Availability | Single site unless a second node is funded; power/network on you | Multi-AZ, managed Postgres, snapshots |
| Remote learners / bandwidth | Limited by site uplink (240 min × bitrate × concurrent users) | Better; CDN optional with signed URLs |
| DRM licensing | Possible but self-managed | Easier with managed licence services |
| Time to launch | Hardware + network setup | Days |

**Recommendation:** private cloud (managed Postgres, object-storage volume for `MEDIA_ROOT`, nginx/ALB in front) unless contractual rules require on-prem. The same Docker images run in both; on-prem just swaps managed services for the compose file (+ a nightly `pg_dump` and a mirrored media volume). Sizing hint: ~1 vCPU / 1 GB per 50 concurrent streams (segments are static files) — move media to a CDN/object store before moving CPU.

## Local AI Hindi narration (English-only source videos)
`narration/` turns an English video into a Hindi audio track locally (Whisper → glossary-protected NLLB translation → human review → Hindi TTS → timing sync) and packages both languages into the single encrypted HLS stream. The sync/packaging stages are built and tested; the Whisper/NLLB/TTS model stages are written to the libraries' real APIs but **have not been run** (model weights were unreachable from the build sandbox). Read `narration/README.md` for status, usage and risks.

## Project timeline alignment
Videos land end of December. Until then the seed uses one sample package for all 8 sample videos. When real content arrives: run `scripts/package-hls.sh <video> <audio_en> <audio_hi> storage/hls/<video-id>` per video, then wire the admin upload to enqueue that job (the only stubbed step).

## Notes
- Permissions are enforced in the UI (layouts redirect by role) **and** in every API route (`guarded()`); the UI is never the only gate. Admins can only manage learners; Super Admin can manage everyone and security settings.
- `prisma/init.sql` is the applied schema (so setup doesn't depend on downloading Prisma's schema-engine); `prisma/schema.prisma` is the typed source of truth — keep them in sync, or switch to `prisma migrate` once the schema stabilises.
- See `DEMO_SCRIPT.md` and `ASSUMPTIONS.md`.
