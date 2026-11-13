import { db } from "@/lib/db";
import { ApiError, guarded } from "@/lib/api";
import { courseState } from "@/lib/progress";
import { audit, clientIp, signPlaybackToken, rateLimit } from "@/lib/security";
import { getSettings } from "@/lib/settings";
import { runFactors } from "@/lib/auth-factors";
import crypto from "node:crypto";

/** Issues a playback grant: enrolment + sequential-unlock checks, claims the "active stream" for this session. */
export const POST = guarded<{ id: string }>(["LEARNER"], async ({ req, info, params }) => {
  const { user, session } = info;
  if (!rateLimit(`play:${user.id}`, 30, 60_000)) throw new ApiError(429, "Too many playback requests");
  const video = await db.video.findUnique({ where: { id: params.id }, include: { tracks: true } });
  if (!video || video.status !== "READY") throw new ApiError(404, "Video not available");
  const enrolled = await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: video.courseId } } });
  if (!enrolled) throw new ApiError(403, "This course is not assigned to you");
  const state = await courseState(user.id, video.courseId);
  const entry = state?.videos.find((v) => v.id === video.id);
  if (!entry || entry.locked) throw new ApiError(403, "Complete the previous video to unlock this one");

  const settings = await getSettings();
  const face = settings.faceVerification ? await runFactors("pre-playback", { userId: user.id, sessionId: session.id, videoId: video.id }) : null;
  if (face && !face.verified) throw new ApiError(403, "Identity verification failed");

  const streamId = crypto.randomUUID();
  await db.session.update({ where: { id: session.id }, data: { streamId, streamVideoId: video.id, streamAt: new Date() } });
  // restart the watch-time clock so time spent away from the player can't be credited as watched
  await db.progress.updateMany({ where: { userId: user.id, videoId: video.id }, data: { updatedAt: new Date() } });
  await audit("PLAYBACK_START", { userId: user.id, resource: video.id, ip: clientIp(req) });

  const token = signPlaybackToken({ u: user.id, s: session.id, v: video.id, x: streamId });
  return {
    streamId, token,
    manifestUrl: `/api/stream/${video.id}/master.m3u8`,
    resumeSec: entry.status === "completed" ? 0 : entry.positionSec,
    durationSec: video.durationSec,
    tracks: video.tracks.map((t) => ({ lang: t.lang, label: t.label, isDefault: t.isDefault })),
    video: { id: video.id, title: video.title, courseId: video.courseId },
    security: { pauseOnBlur: settings.pauseOnBlur, faceVerification: settings.faceVerification, face },
    watermark: { name: user.name, code: user.code, email: user.email },
  };
});
