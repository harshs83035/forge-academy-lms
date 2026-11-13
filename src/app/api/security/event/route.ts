import { z } from "zod";
import { body, guarded } from "@/lib/api";
import { audit, clientIp, rateLimit } from "@/lib/security";

// Client-side deterrent events (watermark tampering, blocked shortcuts, fullscreen attempts...) land in the audit log.
export const POST = guarded(["LEARNER"], async ({ req, info }) => {
  const b = await body(req, z.object({ type: z.string().max(40), videoId: z.string().optional(), detail: z.string().max(200).optional() }));
  if (rateLimit(`sec-event:${info.user.id}`, 30, 60_000)) await audit(`CLIENT_${b.type.toUpperCase()}`, { userId: info.user.id, resource: b.videoId, meta: { detail: b.detail }, ip: clientIp(req) });
  return { ok: true };
});
