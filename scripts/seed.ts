import "./env";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

const meta = JSON.parse(fs.readFileSync(path.join(process.env.MEDIA_ROOT ?? "./storage/hls", "sample", "meta.json"), "utf8"));
const DUR: number = meta.durationSec ?? 30;

const M1 = {
  title: "Module 1 — Hydraulic Press Fundamentals",
  description: "Core components, hydraulic circuits, safe start-up and routine maintenance of the 200-tonne press line.",
  videos: [
    ["Introduction & safety briefing", "PPE, lock-out/tag-out and the emergency stop chain."],
    ["Anatomy of the press frame", "Frame, bolster, ram and guide-rail alignment."],
    ["Hydraulic power unit", "Pump, reservoir, filtration and pressure relief."],
    ["Control valves & circuits", "Directional valves, flow control and reading the circuit diagram."],
    ["Daily start-up checklist", "Pre-shift inspection and warm-up cycle."],
  ],
  quiz: [
    ["What must be done BEFORE performing maintenance on the press?", ["Reduce the speed", "Apply lock-out/tag-out", "Switch off the lights", "Inform the canteen"], 1],
    ["Which component stores hydraulic fluid?", ["Ram", "Bolster", "Reservoir", "Guide rail"], 2],
    ["The pressure relief valve protects the system from…", ["Over-pressure", "Low oil level", "Noise", "Rust"], 0],
    ["A directional control valve is used to…", ["Filter oil", "Change flow direction", "Cool the oil", "Measure temperature"], 1],
    ["How often is the start-up checklist completed?", ["Monthly", "Weekly", "Every shift", "Yearly"], 2],
  ],
};
const M2 = {
  title: "Module 2 — CNC Lathe Operation & Safety",
  description: "Set-up, tooling, work-holding and safe operation of the CNC turning centre.",
  videos: [
    ["Machine overview & axes", "X/Z axes, spindle, turret and tailstock."],
    ["Work-holding and tooling", "Chuck jaws, collets and insert selection."],
    ["Safe operation & coolant", "Door interlocks, chip management and coolant handling."],
  ],
  quiz: [
    ["Which axis controls movement along the spindle centre-line?", ["X axis", "Z axis", "Y axis", "C axis"], 1],
    ["Before opening the machine door you should…", ["Wait for spindle to stop", "Increase feed", "Disable interlock", "Turn on coolant"], 0],
    ["Chips should be cleared using…", ["Bare hands", "Compressed air at face level", "A chip hook/brush", "A cloth"], 2],
    ["Worn inserts primarily cause…", ["Better finish", "Poor finish and tool breakage", "Lower noise", "Faster cycle"], 1],
  ],
};

async function main() {
  if (process.argv.includes("--if-empty") && (await db.user.count()) > 0) { console.log("Database already has data - skipping seed."); return; }
  await db.$transaction([
    db.auditLog.deleteMany(), db.certificate.deleteMany(), db.attempt.deleteMany(), db.progress.deleteMany(),
    db.enrollment.deleteMany(), db.question.deleteMany(), db.quiz.deleteMany(), db.videoAudioTrack.deleteMany(),
    db.video.deleteMany(), db.course.deleteMany(), db.session.deleteMany(), db.device.deleteMany(),
    db.user.deleteMany(), db.setting.deleteMany(),
  ]);

  const mk = async (code: string, name: string, email: string, pw: string, role: "SUPER_ADMIN" | "ADMIN" | "LEARNER", by?: string) =>
    db.user.create({ data: { code, name, email, role, passwordHash: await hashPassword(pw), createdById: by } });

  const sa = await mk("SA-0001", "Meera Kapoor", "super@forge.demo", "Super@123", "SUPER_ADMIN");
  const ad = await mk("ADM-0101", "Vikram Rao", "admin@forge.demo", "Admin@123", "ADMIN", sa.id);
  const learner = await mk("LRN-1001", "Arjun Sharma", "learner@forge.demo", "Learner@123", "LEARNER", ad.id);
  const ready = await mk("LRN-1002", "Neha Verma", "ready@forge.demo", "Learner@123", "LEARNER", ad.id);
  const others = [
    await mk("LRN-1003", "Rahul Singh", "rahul@forge.demo", "Learner@123", "LEARNER", ad.id),
    await mk("LRN-1004", "Priya Nair", "priya@forge.demo", "Learner@123", "LEARNER", ad.id),
    await mk("LRN-1005", "Imran Khan", "imran@forge.demo", "Learner@123", "LEARNER", ad.id),
  ];

  const courses = [];
  for (const [i, m] of [M1, M2].entries()) {
    const c = await db.course.create({ data: { title: m.title, description: m.description, position: i + 1, passMark: 70, sequential: true } });
    const vids = [];
    for (const [j, [title, description]] of m.videos.entries()) {
      vids.push(await db.video.create({
        data: { courseId: c.id, title, description, position: j + 1, durationSec: DUR, hlsDir: "sample",
          tracks: { create: [{ lang: "en", label: "English", isDefault: true }, { lang: "hi", label: "हिन्दी", isDefault: false }] } },
      }));
    }
    const quiz = await db.quiz.create({
      data: { courseId: c.id, title: `${m.title.split("—")[0].trim()} assessment`,
        questions: { create: m.quiz.map(([text, options, correctIndex], k) => ({ text: text as string, options: options as string[], correctIndex: correctIndex as number, position: k })) } },
    });
    courses.push({ c, vids, quiz });
  }

  for (const u of [learner, ready, ...others]) for (const { c } of courses) await db.enrollment.create({ data: { userId: u.id, courseId: c.id, assignedBy: ad.id } });

  const done = (userId: string, videoId: string) =>
    db.progress.create({ data: { userId, videoId, positionSec: 0, watchedSec: DUR, completed: true, completedAt: new Date(Date.now() - Math.random() * 6 * 864e5) } });

  // demo learner: video 1 done, video 2 half-watched (shows resume)
  await done(learner.id, courses[0].vids[0].id);
  await db.progress.create({ data: { userId: learner.id, videoId: courses[0].vids[1].id, positionSec: Math.floor(DUR / 2), watchedSec: DUR / 2 } });

  // "ready" learner: Module 2 fully watched -> quiz available immediately; Module 1 half done
  for (const v of courses[1].vids) await done(ready.id, v.id);
  for (const v of courses[0].vids.slice(0, 2)) await done(ready.id, v.id);

  // report data for the others
  for (const v of courses[0].vids) await done(others[0].id, v.id);
  for (const v of courses[1].vids) await done(others[0].id, v.id);
  for (const q of courses.map((c) => c.quiz)) {
    await db.attempt.create({ data: { userId: others[0].id, quizId: q.id, score: 100, passed: true, answers: [] } });
  }
  for (const [i, { c }] of courses.entries()) {
    await db.certificate.create({ data: { certId: `FA-2026-DEMO000${i + 1}`, userId: others[0].id, courseId: c.id, score: 100 } });
  }
  for (const v of courses[0].vids.slice(0, 3)) await done(others[1].id, v.id);
  await db.attempt.create({ data: { userId: others[1].id, quizId: courses[0].quiz.id, score: 40, passed: false, answers: [] } });
  await done(others[2].id, courses[0].vids[0].id);

  await db.auditLog.create({ data: { userId: ad.id, action: "SEED", resource: "system", meta: { note: "demo data created" } } });
  console.log("Seeded. Demo logins:\n  super@forge.demo / Super@123\n  admin@forge.demo / Admin@123\n  learner@forge.demo / Learner@123\n  ready@forge.demo / Learner@123 (Module 2 ready for quiz)");
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
