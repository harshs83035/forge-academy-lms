import { z } from "zod";
import { db } from "@/lib/db";
import { ADMINS, body, guarded } from "@/lib/api";
import { audit } from "@/lib/security";

const schema = z.object({ title: z.string().min(3).max(150), description: z.string().max(500).default(""), position: z.number().int().min(1), languages: z.array(z.enum(["en", "hi"])).min(1) });
const LABELS = { en: "English", hi: "हिन्दी" } as const;

export const PATCH = guarded<{ id: string }>(ADMINS, async ({ req, info, params }) => {
  const b = await body(req, schema);
  const v = await db.video.update({ where: { id: params.id }, data: { title: b.title, description: b.description, position: b.position } });
  await db.videoAudioTrack.deleteMany({ where: { videoId: v.id, lang: { notIn: b.languages } } });
  for (const [i, l] of b.languages.entries()) await db.videoAudioTrack.upsert({ where: { videoId_lang: { videoId: v.id, lang: l } }, update: {}, create: { videoId: v.id, lang: l, label: LABELS[l], isDefault: i === 0 } });
  await audit("VIDEO_UPDATED", { userId: info.user.id, resource: v.id });
});
export const DELETE = guarded<{ id: string }>(ADMINS, async ({ info, params }) => {
  await db.video.delete({ where: { id: params.id } });
  await audit("VIDEO_REMOVED", { userId: info.user.id, resource: params.id });
});
