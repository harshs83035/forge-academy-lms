import { z } from "zod";
import { db } from "@/lib/db";
import { ADMINS, body, guarded } from "@/lib/api";
import { audit } from "@/lib/security";

export const courseSchema = z.object({
  title: z.string().min(3).max(120), description: z.string().max(1000).default(""),
  passMark: z.number().int().min(1).max(100).default(70), sequential: z.boolean().default(true), published: z.boolean().default(true),
});

export const POST = guarded(ADMINS, async ({ req, info }) => {
  const b = await body(req, courseSchema);
  const count = await db.course.count();
  const c = await db.course.create({ data: { ...b, position: count + 1 } });
  await audit("COURSE_CREATED", { userId: info.user.id, resource: c.id });
  return { id: c.id };
});
