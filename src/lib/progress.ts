import { db } from "./db";

export const COMPLETE_THRESHOLD = 0.9;

export type VideoStatus = "not_started" | "in_progress" | "completed";

/** Course overview for a learner: ordered videos with status, lock state, and overall %. */
export async function courseState(userId: string, courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { videos: { orderBy: { position: "asc" }, include: { tracks: true } }, quiz: { include: { _count: { select: { questions: true } } } } },
  });
  if (!course) return null;
  const prog = await db.progress.findMany({ where: { userId, videoId: { in: course.videos.map((v) => v.id) } } });
  const byVideo = new Map(prog.map((p) => [p.videoId, p]));
  let prevDone = true;
  const videos = course.videos.map((v) => {
    const p = byVideo.get(v.id);
    const status: VideoStatus = p?.completed ? "completed" : p && p.watchedSec > 0 ? "in_progress" : "not_started";
    const locked = course.sequential && !prevDone;
    prevDone = !!p?.completed;
    const pct = p?.completed ? 100 : v.durationSec ? Math.min(99, Math.round(((p?.watchedSec ?? 0) / v.durationSec) * 100)) : 0;
    return { ...v, status, locked, pct, positionSec: p?.positionSec ?? 0 };
  });
  const done = videos.filter((v) => v.status === "completed").length;
  const percent = videos.length ? Math.round((done / videos.length) * 100) : 0;
  const [attempt, cert] = await Promise.all([
    course.quiz ? db.attempt.findFirst({ where: { userId, quizId: course.quiz.id }, orderBy: [{ passed: "desc" }, { score: "desc" }] }) : null,
    db.certificate.findUnique({ where: { userId_courseId: { userId, courseId } } }),
  ]);
  return { course, videos, done, percent, allDone: videos.length > 0 && done === videos.length, bestAttempt: attempt, certificate: cert };
}

/**
 * Applies a heartbeat. watchedSec only grows by (forward movement) capped by wall-clock time since the
 * previous heartbeat (x2 for 2x playback), so scrubbing to the end cannot fake completion.
 */
export async function applyHeartbeat(userId: string, video: { id: string; durationSec: number }, positionSec: number, final: boolean) {
  const now = new Date();
  const existing = await db.progress.findUnique({ where: { userId_videoId: { userId, videoId: video.id } } });
  const pos = Math.max(0, Math.min(positionSec, video.durationSec || positionSec));
  let watched = existing?.watchedSec ?? 0;
  if (existing) {
    // the clock restarts at stream start (see playback route) and a heartbeat covers at most ~15s of real time
    const elapsed = Math.min(15, (now.getTime() - existing.updatedAt.getTime()) / 1000);
    const forward = pos - existing.positionSec;
    if (forward > 0) watched += Math.min(forward, elapsed * 2 + 1);
  }
  watched = Math.min(watched, video.durationSec || watched);
  const completed = existing?.completed || (video.durationSec > 0 && watched >= video.durationSec * COMPLETE_THRESHOLD);
  const justCompleted = completed && !existing?.completed;
  // once completed, leave the resume position at 0 when finished so a re-watch starts at the beginning
  const savedPos = video.durationSec && pos >= video.durationSec - 1 ? 0 : pos;
  const row = await db.progress.upsert({
    where: { userId_videoId: { userId, videoId: video.id } },
    create: { userId, videoId: video.id, positionSec: savedPos, watchedSec: watched, completed, completedAt: completed ? now : null },
    update: { positionSec: savedPos, watchedSec: watched, completed, completedAt: justCompleted ? now : existing?.completedAt ?? null },
  });
  return { row, justCompleted, pct: video.durationSec ? Math.round((watched / video.durationSec) * 100) : 0 };
}
