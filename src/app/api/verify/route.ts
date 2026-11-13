import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/security";

// Public endpoint (anyone holding a certificate can be checked), rate-limited against ID guessing.
export async function GET(req: Request) {
  if (!rateLimit(`verify:${clientIp(req)}`, 20, 60_000)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,30}$/.test(id)) return NextResponse.json({ valid: false });
  const c = await db.certificate.findUnique({ where: { certId: id }, include: { user: true, course: true } });
  if (!c) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, certId: c.certId, name: c.user.name, course: c.course.title, issuedAt: c.issuedAt, score: c.score });
}
