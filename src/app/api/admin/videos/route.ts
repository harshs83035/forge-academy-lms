import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { ADMINS, ApiError, guarded } from "@/lib/api";
import { audit } from "@/lib/security";

const LABELS: Record<string, string> = { en: "English", hi: "हिन्दी" };

async function sampleDuration() {
  try { return JSON.parse(await fs.readFile(path.join(/*turbopackIgnore: true*/ process.env.MEDIA_ROOT ?? "./storage/hls", "sample", "meta.json"), "utf8")).durationSec as number; } catch { return 30; }
}

/**
 * PROTOTYPE: accepts the upload and stores the source file, but packaging is stubbed - the new video points at
 * the sample encrypted HLS package. In production this enqueues scripts/package-hls.sh (see README).
 */
export const POST = guarded(ADMINS, async ({ req, info }) => {
  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const courseId = String(form.get("courseId") ?? "");
  const langs = form.getAll("languages").map(String).filter((l) => l in LABELS);
  if (title.length < 3) throw new ApiError(400, "Title is required");
  if (!(await db.course.findUnique({ where: { id: courseId } }))) throw new ApiError(400, "Choose a module");
  const file = form.get("file");
  let sourceName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!/^video\//.test(file.type) && !/\.(mp4|mov|mkv|webm)$/i.test(file.name)) throw new ApiError(400, "Upload a video file (mp4, mov, mkv, webm)");
    await fs.mkdir(path.join(/*turbopackIgnore: true*/ process.cwd(), "storage/uploads"), { recursive: true });
    sourceName = `${crypto.randomUUID()}-${path.basename(file.name).replace(/[^\w.\-]/g, "_")}`;
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ process.cwd(), "storage/uploads", sourceName), Buffer.from(await file.arrayBuffer()));
  }
  const last = await db.video.findFirst({ where: { courseId }, orderBy: { position: "desc" } });
  const position = Number(form.get("position")) || (last?.position ?? 0) + 1;
  // make room if inserting in the middle
  await db.video.updateMany({ where: { courseId, position: { gte: position } }, data: { position: { increment: 1 } } });
  const v = await db.video.create({
    data: { courseId, title, description: String(form.get("description") ?? ""), position, durationSec: await sampleDuration(), hlsDir: "sample", sourceName,
      tracks: { create: (langs.length ? langs : ["en"]).map((l, i) => ({ lang: l, label: LABELS[l], isDefault: i === 0 })) } },
  });
  await audit("VIDEO_ADDED", { userId: info.user.id, resource: v.id, meta: { title, uploaded: !!sourceName } });
  return { id: v.id };
});
