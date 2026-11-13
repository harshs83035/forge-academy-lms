import crypto from "node:crypto";
import { db } from "./db";

const SECRET = process.env.AUTH_SECRET ?? "dev-only-insecure-secret-change-me-please-0123456789";
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  console.warn("[security] AUTH_SECRET is not set - using an insecure default!");
}
export const AUTH_SECRET = SECRET;

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const hmac = (data: string) => crypto.createHmac("sha256", SECRET).update(data).digest("base64url");

/* ---------- short-lived signed playback tokens (appended to every playlist/segment/key request) ---------- */
export type PlaybackToken = { u: string; s: string; v: string; x: string; e: number };
export const PLAYBACK_TOKEN_TTL_SEC = 120;

export function signPlaybackToken(p: Omit<PlaybackToken, "e">) {
  const body = b64(JSON.stringify({ ...p, e: Math.floor(Date.now() / 1000) + PLAYBACK_TOKEN_TTL_SEC }));
  return `${body}.${hmac(body)}`;
}
export function verifyPlaybackToken(t: string | null): PlaybackToken | null {
  if (!t) return null;
  const [body, sig] = t.split(".");
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as PlaybackToken;
    return p.e > Date.now() / 1000 ? p : null;
  } catch { return null; }
}

/* ---------- in-memory fixed-window rate limiter (swap for Redis when running >1 instance) ---------- */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  b.n++;
  return b.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k); }, 60_000).unref?.();

/* ---------- audit log ---------- */
export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}
export async function audit(action: string, opts: { userId?: string | null; resource?: string; meta?: Record<string, unknown>; ip?: string | null } = {}) {
  try {
    await db.auditLog.create({ data: { action, userId: opts.userId ?? null, resource: opts.resource, meta: (opts.meta ?? undefined) as never, ip: opts.ip ?? null } });
  } catch (e) { console.error("audit failed", e); }
}
