import { cookies } from "next/headers";
import { COOKIE, resolveSession } from "@/lib/auth";
import { renderCertificatePdf } from "@/lib/certificate";
import { db } from "@/lib/db";

export async function GET(req: Request, ctx: { params: Promise<{ certId: string }> }) {
  const { certId } = await ctx.params;
  const a = await resolveSession((await cookies()).get(COOKIE)?.value);
  if (!a.ok) return new Response("Unauthorized", { status: 401 });
  const c = await db.certificate.findUnique({ where: { certId } });
  if (!c) return new Response("Not found", { status: 404 });
  if (a.info.user.role === "LEARNER" && c.userId !== a.info.user.id) return new Response("Forbidden", { status: 403 });
  const origin = new URL(req.url).origin;
  const out = await renderCertificatePdf(certId, req.headers.get("x-forwarded-host") ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("x-forwarded-host")}` : origin);
  if (!out) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(out.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${certId}.pdf"` } });
}
