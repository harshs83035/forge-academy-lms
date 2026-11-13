import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE, resolveSession } from "@/lib/auth";
import { audit, clientIp, rateLimit, verifyPlaybackToken } from "@/lib/security";

const MEDIA_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_ROOT ?? "./storage/hls");
// Whitelist: master playlist, rendition playlists/segments, and the virtual "key" endpoint. Nothing else (enc.key, meta.json, ../ ...) is reachable.
const ALLOWED = /^(master\.m3u8|[a-z_]{1,12}\/index\.m3u8|[a-z_]{1,12}\/seg_\d{1,6}\.ts|key)$/;
const noStore = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" };

function deny(status: number, reason: string, ip: string | null, userId?: string, videoId?: string) {
  if (rateLimit(`deny-audit:${ip}`, 10, 60_000)) void audit("STREAM_DENIED", { userId, resource: videoId, meta: { reason, status }, ip });
  return new Response(JSON.stringify({ error: reason }), { status, headers: { "Content-Type": "application/json", ...noStore } });
}

export async function GET(req: Request, ctx: { params: Promise<{ videoId: string; path: string[] }> }) {
  const { videoId, path: parts } = await ctx.params;
  const rel = parts.join("/");
  const ip = clientIp(req);
  const token = verifyPlaybackToken(new URL(req.url).searchParams.get("t"));
  if (!token) return deny(401, "missing or expired playback token", ip, undefined, videoId);
  if (token.v !== videoId) return deny(403, "token/video mismatch", ip, token.u, videoId);

  // Must ALSO carry the authenticated session cookie, and it must be the session the token was minted for.
  const a = await resolveSession((await cookies()).get(COOKIE)?.value);
  if (!a.ok || a.info.session.id !== token.s || a.info.user.id !== token.u) return deny(401, "session invalid or signed in elsewhere", ip, token.u, videoId);
  if (!ALLOWED.test(rel)) return deny(404, "not found", ip, token.u, videoId);

  const isKey = rel === "key";
  if (!rateLimit(`${isKey ? "key" : "seg"}:${token.u}`, isKey ? 30 : 400, 60_000)) {
    await audit("STREAM_RATE_LIMITED", { userId: token.u, resource: videoId, meta: { kind: isKey ? "key" : "segment" }, ip });
    return deny(429, "rate limit exceeded", null, token.u, videoId);
  }

  const video = await db.video.findUnique({ where: { id: videoId }, select: { hlsDir: true } });
  if (!video) return deny(404, "not found", ip, token.u, videoId);
  const dir = path.join(MEDIA_ROOT, path.basename(video.hlsDir));

  try {
    if (isKey) {
      const key = await fs.readFile(path.join(dir, "enc.key"));
      await audit("KEY_ISSUED", { userId: token.u, resource: videoId, meta: { stream: token.x }, ip });
      return new Response(new Uint8Array(key), { headers: { "Content-Type": "application/octet-stream", ...noStore } });
    }
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep)) return deny(400, "bad path", ip, token.u, videoId);
    if (rel.endsWith(".m3u8")) {
      // Playlists are rewritten per request: the key URI points at the authenticated endpoint, never a static file.
      const text = (await fs.readFile(file, "utf8")).replace(/URI="enc\.key"/g, `URI="/api/stream/${videoId}/key"`);
      return new Response(text, { headers: { "Content-Type": "application/vnd.apple.mpegurl", ...noStore } });
    }
    return new Response(new Uint8Array(await fs.readFile(file)), { headers: { "Content-Type": "video/mp2t", ...noStore } });
  } catch {
    return deny(404, "not found", ip, token.u, videoId);
  }
}
