import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkPassword, COOKIE, SESSION_MAX_AGE, signSessionCookie, invalidateSessionCache, homeFor } from "@/lib/auth";
import { audit, clientIp, rateLimit } from "@/lib/security";
import { getSettings } from "@/lib/settings";
import { body, errorResponse } from "@/lib/api";

const schema = z.object({ email: z.string().email(), password: z.string().min(1), deviceId: z.string().min(8).max(100) });

function deviceLabel(ua: string) {
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

export async function POST(req: Request) {
  try {
    const { email, password, deviceId } = await body(req, schema);
    const ip = clientIp(req);
    if (!rateLimit(`login:${ip}:${email.toLowerCase()}`, 10, 60_000)) return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await checkPassword(password, user.passwordHash))) {
      await audit("LOGIN_FAILED", { userId: user?.id, resource: email, ip });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (!user.active) {
      await audit("LOGIN_BLOCKED", { userId: user.id, meta: { why: "deactivated" }, ip });
      return NextResponse.json({ error: "This account has been deactivated. Contact your administrator." }, { status: 403 });
    }
    const settings = await getSettings();
    const ua = req.headers.get("user-agent") ?? "";

    // ---- device limit (learners) ----
    let device = await db.device.findUnique({ where: { userId_fingerprint: { userId: user.id, fingerprint: deviceId } } });
    if (!device && user.role === "LEARNER") {
      const limit = user.maxDevices ?? settings.deviceLimit;
      const count = await db.device.count({ where: { userId: user.id } });
      if (count >= limit) {
        await audit("LOGIN_BLOCKED", { userId: user.id, meta: { why: "device_limit", limit }, ip });
        return NextResponse.json({ error: `Device limit reached (${count}/${limit}). Ask your administrator to reset your registered devices.`, code: "DEVICE_LIMIT" }, { status: 403 });
      }
    }
    if (!device) device = await db.device.create({ data: { userId: user.id, fingerprint: deviceId, label: deviceLabel(ua) } });
    else await db.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

    // ---- single concurrent session ----
    const live = await db.session.findMany({ where: { userId: user.id, revokedAt: null, lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) } } });
    if (live.length && settings.sessionMode === "block") {
      await audit("LOGIN_BLOCKED", { userId: user.id, meta: { why: "session_active" }, ip });
      return NextResponse.json({ error: "This account is already signed in on another device. Sign out there first.", code: "SESSION_ACTIVE" }, { status: 409 });
    }
    await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "REPLACED", streamId: null } });
    invalidateSessionCache();

    const session = await db.session.create({ data: { userId: user.id, deviceId: device.id, ip, userAgent: ua.slice(0, 250) } });
    await audit("LOGIN", { userId: user.id, meta: { replaced: live.length, device: device.label }, ip });

    const res = NextResponse.json({ ok: true, redirect: homeFor(user.role) });
    res.cookies.set(COOKIE, await signSessionCookie(session.id), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE, secure: process.env.COOKIE_SECURE === "true",
    });
    return res;
  } catch (e) { return errorResponse(e); }
}
