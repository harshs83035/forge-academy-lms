# Assumptions and open questions

## Assumptions made
1. **Brand:** no client brand provided → dark navy + orange, placeholder name "Forge Academy" (`BRAND_NAME`). Certificate uses the same.
2. **Quiz scope:** one assessment per module, unlocked when all its videos are complete (per-video quizzes not built; schema can extend).
3. **Certificate** is issued when all videos are complete **and** the quiz is passed; courses without a quiz certify on the last video.
4. **Completion** = ≥ 90% *watched* (server-validated watch time, not just seek position).
5. **Sequential unlock** is per module (default on).
6. **Admin scope:** an Admin manages *all* learners (not only ones they created). Admins cannot be learners of the same account.
7. **Device limit** applies to learners only (default 2); Admin/Super Admin are exempt. A "device" is a browser profile (random ID in localStorage) — clearing storage registers a new device.
8. **Single session** applies to every role; default policy = new login replaces the old one.
9. **Sample media:** all 8 seeded videos share one 30-second placeholder package (English = single beep, Hindi = triple beep); durations are therefore 0:30 rather than 3–4 min.
10. **Upload** is accepted and stored but not transcoded in the prototype.
11. **Passwords** are set/reset by admins (no email). bcrypt hashing; no password-complexity policy beyond 8 characters.
12. **Languages:** English + Hindi for audio; UI translation covers learner-facing screens only (stretch goal), admin UI is English.
13. UI components are shadcn-style but hand-written (no CLI/Radix) to keep the prototype dependency-light.
14. Time zone for display: Asia/Kolkata.

## Open questions for the client
- **Hosting:** on-prem or private cloud? Internet-facing for learners or intranet-only? Expected concurrent viewers and total learner count?
- **DRM:** is Widevine/FairPlay licensing budget approved? Which devices must be supported (Windows/Android only? iPads? shared kiosks)?
- **Screen recording:** what threat level is acceptable? (Browser protections can't stop it; DRM stops it only on supported devices.)
- **Identity:** can learners be asked for a webcam (face verification)? Privacy/consent and biometric-data storage rules?
- **Device policy:** how many devices per learner, and who may reset them? Should admins also be limited?
- **Session policy:** replace vs block second login? Kiosk/shared-PC scenarios?
- **Content:** final audio masters for Hindi and English, bitrates, subtitles? Will content ever update (versioning of videos and certificates)?
- **Assessments:** pass mark per module, retake limits/cool-down, question banks/randomisation, per-video quizzes?
- **Certificates:** client template, signatory, expiry/re-certification period, logo?
- **Roles:** should Admins be scoped to groups/plants? Any manager/reporting-only role? Reporting fields required for audits?
- **Identity provider:** SSO (Azure AD / Google) or local accounts only? Password rules and rotation?
- **Data:** retention periods for audit logs and progress; backup/DR expectations; data residency.
- **Languages:** more than Hindi + English later (regional languages)?
