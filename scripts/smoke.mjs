// NOTE: run against a freshly seeded DB (npm run db:reset) - it registers devices/sessions, so a 2nd run on the same data hits the device limit.
// End-to-end API smoke test: node scripts/smoke.mjs [baseUrl]   (server running + seeded DB required)
// Covers RBAC, stream protection, single-session, duplicate stream, device limit, anti-skip, quiz, certificate.
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
try { process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env")); } catch {}
const B = process.argv[2] ?? "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const q = async (sql) => (await db.query(sql)).rows;
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`); };
const call = async (method, url, { cookie, body, form } = {}) => {
  const r = await fetch(B + url, { method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const ct = r.headers.get("content-type") ?? ""; const data = ct.includes("json") ? await r.json() : await r.text();
  return { status: r.status, data, headers: r.headers };
};
const login = async (email, pw, dev) => { const r = await call("POST", "/api/auth/login", { body: { email, password: pw, deviceId: dev } }); const c = r.headers.get("set-cookie")?.split(";")[0]; return { ...r, cookie: c }; };
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const run = Date.now().toString(36);

console.log(`== LMS smoke test against ${B}\n`);
// --- auth & RBAC
ok("bad password rejected (401)", (await login("learner@forge.demo", "nope", "dev-smoke-" + run)).status === 401);
const L = await login("learner@forge.demo", "Learner@123", "dev-smoke-A-" + run); ok("learner login", L.status === 200 && !!L.cookie);
ok("learner blocked from admin API (403)", (await call("POST", "/api/admin/users", { cookie: L.cookie, body: { name: "X Y", email: "x@y.com", password: "12345678" } })).status === 403);
ok("no cookie → 401", (await call("GET", "/api/auth/me")).status === 401);
const AD = await login("admin@forge.demo", "Admin@123", "dev-smoke-adm-" + run), SA = await login("super@forge.demo", "Super@123", "dev-smoke-sa-" + run);
ok("admin cannot create an Admin (403)", (await call("POST", "/api/admin/users", { cookie: AD.cookie, body: { name: "Evil Admin", email: `e${run}@forge.demo`, password: "Passw0rd!", role: "ADMIN" } })).status === 403);
ok("admin cannot change security settings (403)", (await call("PUT", "/api/admin/settings", { cookie: AD.cookie, body: { sessionMode: "block", deviceLimit: 1, pauseOnBlur: true, faceVerification: false } })).status === 403);
ok("admin creates learner", (await call("POST", "/api/admin/users", { cookie: AD.cookie, body: { name: "Smoke Learner", email: `s${run}@forge.demo`, password: "Passw0rd!", role: "LEARNER", courseIds: [] } })).status === 200);
ok("super admin creates admin", (await call("POST", "/api/admin/users", { cookie: SA.cookie, body: { name: "Smoke Admin", email: `a${run}@forge.demo`, password: "Passw0rd!", role: "ADMIN" } })).status === 200);

// --- playback protection
const [v1] = await q(`select v.id from "Video" v join "Course" c on c.id=v."courseId" where c.position=1 and v.position=1`);
const [v3] = await q(`select v.id from "Video" v join "Course" c on c.id=v."courseId" where c.position=1 and v.position=3`);
const [v2] = await q(`select v.id from "Video" v join "Course" c on c.id=v."courseId" where c.position=1 and v.position=2`);
ok("locked video refused (sequential unlock, 403)", (await call("POST", `/api/videos/${v3.id}/playback`, { cookie: L.cookie })).status === 403);
const g = (await call("POST", `/api/videos/${v1.id}/playback`, { cookie: L.cookie })).data; ok("playback grant issued", !!g.token && g.tracks?.length === 2, `tracks: ${g.tracks?.map((t) => t.lang)}`);
const s = (p, t, c) => call("GET", `/api/stream/${v1.id}/${p}${t ? "?t=" + t : ""}`, { cookie: c });
ok("stream without token → 401", (await s("master.m3u8", null, L.cookie)).status === 401);
ok("token without session cookie → 401", (await s("master.m3u8", g.token, null)).status === 401);
const m = await s("master.m3u8", g.token, L.cookie); ok("master playlist with token+cookie → 200, two audio renditions", m.status === 200 && /LANGUAGE="en"/.test(m.data) && /LANGUAGE="hi"/.test(m.data));
const pl = await s("v/index.m3u8", g.token, L.cookie); ok("playlist key URI rewritten to authenticated endpoint", /URI="\/api\/stream\/[^/]+\/key"/.test(pl.data));
const key = await call("GET", `/api/stream/${v1.id}/key?t=${g.token}`, { cookie: L.cookie }); ok("AES key served with token+session (200)", key.status === 200);
ok("AES key refused without session cookie (401)", (await call("GET", `/api/stream/${v1.id}/key?t=${g.token}`)).status === 401);
ok("segment served (200)", (await s("v/seg_000.ts", g.token, L.cookie)).status === 200);
ok("enc.key not reachable as a file (404)", (await s("enc.key", g.token, L.cookie)).status === 404);
ok("path traversal blocked", (await s("v/..%2f..%2fenc.key", g.token, L.cookie)).status >= 400);
ok("token for another video refused", (await call("GET", `/api/stream/other/master.m3u8?t=${g.token}`, { cookie: L.cookie })).status === 403);
ok("forged token refused", (await s("master.m3u8", g.token.slice(0, -1) + "x", L.cookie)).status === 401);

// --- duplicate stream
const hb = (c, vid, sid, pos) => call("POST", "/api/progress", { cookie: c, body: { videoId: vid, streamId: sid, positionSec: pos } });
ok("heartbeat accepted for active stream", !(await hb(L.cookie, v1.id, g.streamId, 2)).data.conflict);
await call("POST", `/api/videos/${v1.id}/playback`, { cookie: L.cookie }); // second tab claims the stream
ok("duplicate stream detected (older stream gets conflict)", (await hb(L.cookie, v1.id, g.streamId, 3)).data.conflict === true);

// --- single concurrent session
const L2 = await login("learner@forge.demo", "Learner@123", "dev-smoke-B-" + run); ok("second login (device B) succeeds", L2.status === 200);
const old = await call("GET", "/api/auth/me", { cookie: L.cookie }); ok("OLD session invalidated (REPLACED)", old.status === 401 && old.data.reason === "REPLACED", JSON.stringify(old.data));
ok("old playback token dead on stream", (await s("master.m3u8", g.token, L.cookie)).status === 401);
// Temporarily lower global device limit so the 3rd device is refused (default is 10)
ok("super admin lowers device limit for test", (await call("PUT", "/api/admin/settings", { cookie: SA.cookie, body: { sessionMode: "replace", deviceLimit: 2, pauseOnBlur: false, faceVerification: false } })).status === 200);
const L3 = await login("learner@forge.demo", "Learner@123", "dev-smoke-C-" + run);
ok("device limit enforced on 3rd device (403 DEVICE_LIMIT)", L3.status === 403 && L3.data.code === "DEVICE_LIMIT", L3.data.error);
await call("PUT", "/api/admin/settings", { cookie: SA.cookie, body: { sessionMode: "replace", deviceLimit: 10, pauseOnBlur: false, faceVerification: false } });

// --- anti-skip + honest watching (uses new session L2)
const g2 = (await call("POST", `/api/videos/${v2.id}/playback`, { cookie: L2.cookie })); ok("video 2 playback granted (video 1 completed)", g2.status === 200);
const skip = (await hb(L2.cookie, v2.id, g2.data.streamId, 29)).data;
ok("ANTI-SKIP: jumping to the end does NOT complete the video", skip.completed === false, `pct=${skip.pct}%`);
let last; for (const p of [20, 25, 30]) { await sleep(5); last = (await hb(L2.cookie, v2.id, g2.data.streamId, p)).data; }
ok("honest real-time watching completes it (≥90%)", last.completed === true, `pct=${last.pct}%`);

// --- quiz + certificate (ready learner, module 2)
const R = await login("ready@forge.demo", "Learner@123", "dev-smoke-R-" + run);
const [c2] = await q(`select id from "Course" where position=2`); const qs = await q(`select id,"correctIndex" from "Question" where "quizId" in (select id from "Quiz" where "courseId"='${c2.id}')`);
const wrong = Object.fromEntries(qs.map((x) => [x.id, (x.correctIndex + 1) % 4])), right = Object.fromEntries(qs.map((x) => [x.id, x.correctIndex]));
const f = (await call("POST", `/api/quiz/${c2.id}/attempt`, { cookie: R.cookie, body: { answers: wrong } })).data; ok("quiz fail below pass mark", f.passed === false && f.score === 0, `score=${f.score}%`);
ok("quiz response never leaks correct answers", !JSON.stringify(f).includes("correctIndex"));
const p = (await call("POST", `/api/quiz/${c2.id}/attempt`, { cookie: R.cookie, body: { answers: right } })).data; ok("quiz pass → certificate issued", p.passed === true && /^FA-\d{4}-[0-9A-F]{8}$/.test(p.certId), `${p.score}% ${p.certId}`);
const pdf = await call("GET", `/api/certificates/${p.certId}/pdf`, { cookie: R.cookie }); ok("certificate PDF downloads", pdf.status === 200 && String(pdf.data).startsWith("%PDF"));
ok("other learner cannot download it (403)", (await call("GET", `/api/certificates/${p.certId}/pdf`, { cookie: (await login("rahul@forge.demo", "Learner@123", "dev-smoke-RA-" + run)).cookie })).status === 403);
const ver = (await call("GET", `/api/verify?id=${p.certId}`)).data; ok("verification page API: valid", ver.valid === true && ver.name === "Neha Verma");
ok("verification: unknown ID invalid", (await call("GET", "/api/verify?id=FA-2026-NOPE0000")).data.valid === false);
const [c1] = await q(`select id from "Course" where position=1`); ok("quiz locked until all videos done (403)", (await call("POST", `/api/quiz/${c1.id}/attempt`, { cookie: R.cookie, body: { answers: {} } })).status === 403);

// --- admin reports
const csv = await call("GET", "/api/admin/reports/export?type=progress", { cookie: AD.cookie }); ok("CSV export", csv.status === 200 && csv.data.startsWith("Learner ID,"));
await sleep(1); // audit writes for denials are fire-and-forget
const seen = new Set((await q(`select distinct action from "AuditLog"`)).map((r) => r.action));
for (const a of ["KEY_ISSUED", "DUPLICATE_STREAM", "STREAM_DENIED", "LOGIN_BLOCKED", "PLAYBACK_START"]) ok(`audit log recorded ${a}`, seen.has(a));

console.log(`\n${pass} passed, ${fail} failed`); await db.end(); process.exit(fail ? 1 : 0);
