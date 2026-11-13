import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, resolveSession, revokeSession } from "@/lib/auth";
import { audit } from "@/lib/security";

export async function POST() {
  const jar = await cookies();
  const a = await resolveSession(jar.get(COOKIE)?.value);
  if (a.ok) { await revokeSession(a.info.session.id, "LOGOUT"); await audit("LOGOUT", { userId: a.info.user.id }); }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
