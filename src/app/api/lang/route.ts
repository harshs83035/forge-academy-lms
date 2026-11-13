import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const { lang } = await req.json().catch(() => ({}));
  const res = NextResponse.json({ ok: true });
  res.cookies.set("lms_lang", lang === "hi" ? "hi" : "en", { path: "/", maxAge: 31536000 });
  return res;
}
