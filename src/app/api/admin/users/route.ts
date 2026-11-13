import { z } from "zod";
import { db } from "@/lib/db";
import { ADMINS, ApiError, body, guarded } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/security";

const schema = z.object({
  name: z.string().min(2).max(80), email: z.string().email(), password: z.string().min(8).max(100),
  role: z.enum(["ADMIN", "LEARNER"]).default("LEARNER"), courseIds: z.array(z.string()).default([]),
});

export const POST = guarded(ADMINS, async ({ req, info }) => {
  const b = await body(req, schema);
  if (b.role === "ADMIN" && info.user.role !== "SUPER_ADMIN") throw new ApiError(403, "Only a Super Admin can create Admins");
  const email = b.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new ApiError(409, "A user with this email already exists");
  const prefix = b.role === "ADMIN" ? "ADM" : "LRN";
  const n = await db.user.count({ where: { role: b.role } });
  const user = await db.user.create({
    data: { name: b.name, email, role: b.role, code: `${prefix}-${(b.role === "ADMIN" ? 100 : 1000) + n + 1}`, passwordHash: await hashPassword(b.password), createdById: info.user.id,
      enrollments: b.role === "LEARNER" ? { create: b.courseIds.map((courseId) => ({ courseId, assignedBy: info.user.id })) } : undefined },
  });
  await audit("USER_CREATED", { userId: info.user.id, resource: user.id, meta: { role: b.role, email } });
  return { id: user.id, code: user.code };
});
