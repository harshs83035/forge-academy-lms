# Client demo script (~9 minutes)

**Before you start:** `docker compose up --build` (or `npm run db:reset && npm run dev`). Open two different browsers (or one normal + one private window). Have the login page ready. Optional: set *Security settings → Pause when window loses focus* **off** (default) so screen-sharing isn't interrupted.

## 1. Learner experience (3.5 min) — Browser A
1. Sign in as **Learner** (click the chip). *"Each learner sees only their assigned modules."* Point at progress bars. Toggle **हिन्दी** in the header (UI language).
2. Open **Module 1**. Show ordered videos: ✔ done, in-progress with bar, 🔒 locked. *"Next video unlocks only after the previous one is completed — configurable per module."*
3. Click **Resume**. The player resumes at ~15s. Point out: the **watermark** (name, ID, email, live timestamp) drifting around; **no fullscreen button**; double-click does nothing; right-click does nothing.
4. Click **हिन्दी** in the player: audio switches instantly, position and playback continue. *"One encrypted stream, two audio tracks — not two files."* Switch back.
5. Let it play past 90% (video is 30s): **✔ Completed** appears, "Next video" button shows, module % updates.

## 2. Quiz & certificate (1.5 min)
6. Sign out, sign in as **Learner (quiz-ready)** → Module 2 → **Take assessment**. Submit with one wrong answer first (fail, retry), then pass (≥ 70%).
7. Download the **PDF certificate** (name, module, date, unique ID, QR). Open `/verify`, paste the ID → **Valid**; try a made-up ID → **Invalid**.

## 3. Security story (2 min)
8. Browser A, Learner playing a video. Open **Browser B**, sign in as the same learner → Browser A shows *"You were signed out"* within seconds (single session). *"Switchable to 'block second login' in settings."*
9. In devtools Network tab (optional): segments are encrypted `.ts`, every request carries a short-lived token, the key request is authenticated. Try opening a segment URL in a new tab with no token → 401.
10. Try F12 / Ctrl+S / PrintScreen → shortcut toast. *"These are deterrents; the watermark identifies the learner if someone records the screen. DRM closes the remaining gap — see README."*

## 4. Admin (1.5 min) — sign in as **Admin**
11. **Learners → Add learner**, assign Module 1. **Manage** an existing learner: reset password, view devices / **Reset devices**, deactivate.
12. **Modules & videos → Module 1**: **Add video** (title, audio tracks EN/HI, optional file) then remove it. Show the quiz editor.
13. **Reports**: progress, quiz scores, completion rates → **Export CSV**. **Audit log**: show KEY_ISSUED, LOGIN_BLOCKED, tamper events.

## 5. Super Admin (0.5 min) — sign in as **Super Admin**
14. **Admins → Add admin**. **Security settings**: session policy, device limit (10), pause-on-blur, face verification stub. *"Admins can't see or change these."*

## Closing (30 s)
Version 2: face verification before/during playback (the hook is already in the flow), Widevine/FairPlay DRM, real upload→packaging pipeline, email. Stubs today: media packaging, DRM, facial recognition, email.

## If something goes wrong
- Player spinner forever → check `storage/hls/sample/enc.key` exists (`npm run sample`).
- "Device limit reached" → Admin → Learners → Manage → Reset all devices.
- Reset everything: `npm run db:reset`.
