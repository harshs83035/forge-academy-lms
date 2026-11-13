import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, guarded } from "@/lib/api";
import { applyHeartbeat } from "@/lib/progress";
import { signPlaybackToken, rateLimit, audit } from "@/lib/security";
import { maybeIssueCertificate } from "@/lib/certificate";

const schema = z.object({ videoId: z.string(), streamId: z.string(), positionSec: z.number().min(0), final: z.boolean().optional() });

/**
 * Heartbeat (every ~5s while the player is open): saves resume position + validated watch time,
 * refreshes the short-lived playback token, and detects duplicate streams.
 */
export const POST = guarded(["LEARNER"], async ({ req, info }) => {
  const { user, session } = info;
  if (!rateLimit(`hb:${user.id}`, 60, 60_000)) throw new ApiError(429, "Slow down");
  const b = await body(req, schema);
  const fresh = await db.session.findUnique({ where: { id: session.id } });
  if (!fresh || fresh.streamId !== b.streamId) {
    await audit("DUPLICATE_STREAM", { userId: user.id, resource: b.videoId });
    return { conflict: true };
  }
  const video = await db.video.findUnique({ where: { id: b.videoId } });
  if (!video) throw new ApiError(404, "Video not found");
  await db.session.update({ where: { id: session.id }, data: { streamAt: new Date() } });
  const r = await applyHeartbeat(user.id, video, b.positionSec, !!b.final);
  let certificate = null;
  if (r.justCompleted) certificate = await maybeIssueCertificate(user.id, video.courseId); // only issues for quiz-less courses
  return {
    token: signPlaybackToken({ u: user.id, s: session.id, v: video.id, x: b.streamId }),
    completed: r.row.completed, justCompleted: r.justCompleted, pct: r.pct, certId: certificate?.certId ?? null,
  };
});
