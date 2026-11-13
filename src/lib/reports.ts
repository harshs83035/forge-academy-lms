import { db } from "./db";

export async function progressRows() {
  const [users, courses, progress, enrollments] = await Promise.all([
    db.user.findMany({ where: { role: "LEARNER" }, orderBy: { code: "asc" } }),
    db.course.findMany({ include: { videos: { select: { id: true } } }, orderBy: { position: "asc" } }),
    db.progress.findMany({ where: { completed: true }, select: { userId: true, videoId: true, updatedAt: true } }),
    db.enrollment.findMany(),
  ]);
  const doneBy = new Map<string, Set<string>>();
  const lastBy = new Map<string, Date>();
  for (const p of progress) {
    (doneBy.get(p.userId) ?? doneBy.set(p.userId, new Set()).get(p.userId)!).add(p.videoId);
    if (!lastBy.get(p.userId) || lastBy.get(p.userId)! < p.updatedAt) lastBy.set(p.userId, p.updatedAt);
  }
  const rows = [];
  for (const e of enrollments) {
    const u = users.find((x) => x.id === e.userId), c = courses.find((x) => x.id === e.courseId);
    if (!u || !c) continue;
    const done = c.videos.filter((v) => doneBy.get(u.id)?.has(v.id)).length;
    rows.push({ userId: u.id, code: u.code, name: u.name, email: u.email, active: u.active, course: c.title, done, total: c.videos.length,
      percent: c.videos.length ? Math.round((done / c.videos.length) * 100) : 0, last: lastBy.get(u.id) ?? null });
  }
  return rows;
}

export async function quizRows() {
  const attempts = await db.attempt.findMany({ include: { user: true, quiz: { include: { course: true } } }, orderBy: { createdAt: "desc" } });
  return attempts.map((a) => ({ code: a.user.code, name: a.user.name, course: a.quiz.course.title, score: a.score, passed: a.passed, at: a.createdAt }));
}

export async function completionRows() {
  const [courses, enrollments, certs, prog] = await Promise.all([
    db.course.findMany({ orderBy: { position: "asc" } }), db.enrollment.findMany(), db.certificate.findMany(), progressRows(),
  ]);
  return courses.map((c) => {
    const enrolled = enrollments.filter((e) => e.courseId === c.id).length;
    const completed = certs.filter((x) => x.courseId === c.id).length;
    const rows = prog.filter((r) => r.course === c.title);
    return { course: c.title, enrolled, completed, rate: enrolled ? Math.round((completed / enrolled) * 100) : 0,
      avg: rows.length ? Math.round(rows.reduce((s, r) => s + r.percent, 0) / rows.length) : 0 };
  });
}
