import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { AUTH_SECRET } from "./security";
import type { Role, User, Session } from "@/generated/prisma/client";

export const COOKIE = "lms_session";
const key = new TextEncoder().encode(AUTH_SECRET);
export const SESSION_MAX_AGE = 60 * 60 * 12;

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function signSessionCookie(sessionId: string) {
  return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_MAX_AGE}s`).sign(key);
}

export type SessionInfo = { user: User; session: Session };
export type AuthResult = { ok: true; info: SessionInfo } | { ok: false; reason: "none" | "REPLACED" | "LOGOUT" | "ADMIN" | "DEACTIVATED" | "expired" };

// tiny cache so segment requests don't each hit the DB (1.5s keeps kicks near-instant)
const cache = new Map<string, { at: number; r: AuthResult }>();

export async function resolveSession(token: string | undefined | null): Promise<AuthResult> {
  if (!token) return { ok: false, reason: "none" };
  let sid: string;
  try { sid = (await jwtVerify(token, key)).payload.sid as string; } catch { return { ok: false, reason: "expired" }; }
  const hit = cache.get(sid);
  if (hit && Date.now() - hit.at < 1500) return hit.r;
  const session = await db.session.findUnique({ where: { id: sid }, include: { user: true } });
  let r: AuthResult;
  if (!session) r = { ok: false, reason: "none" };
  else if (session.revokedAt) r = { ok: false, reason: (session.revokeReason as never) ?? "LOGOUT" };
  else if (!session.user.active) r = { ok: false, reason: "DEACTIVATED" };
  else {
    const { user, ...s } = session;
    r = { ok: true, info: { user, session: s } };
    if (Date.now() - s.lastSeenAt.getTime() > 30_000) db.session.update({ where: { id: sid }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  cache.set(sid, { at: Date.now(), r });
  if (cache.size > 500) cache.clear();
  return r;
}
export const invalidateSessionCache = () => cache.clear();

export async function getAuth(): Promise<AuthResult> {
  return resolveSession((await cookies()).get(COOKIE)?.value);
}

export const homeFor = (role: Role) => (role === "LEARNER" ? "/courses" : "/admin");

/** For server components/layouts: redirect when unauthenticated or wrong role. */
export async function requirePage(roles?: Role[]): Promise<SessionInfo> {
  const a = await getAuth();
  if (!a.ok) redirect(a.reason === "none" || a.reason === "expired" ? "/login" : `/login?reason=${a.reason}`);
  if (roles && !roles.includes(a.info.user.role)) redirect(homeFor(a.info.user.role));
  return a.info;
}

export function revokeSession(id: string, reason: string) {
  invalidateSessionCache();
  return db.session.update({ where: { id }, data: { revokedAt: new Date(), revokeReason: reason, streamId: null } });
}
export async function revokeUserSessions(userId: string, reason: string) {
  invalidateSessionCache();
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason, streamId: null } });
}

export const canManage = (actor: Role, target: Role) =>
  actor === "SUPER_ADMIN" ? true : actor === "ADMIN" && target === "LEARNER";
