import { z } from "zod";
import { db } from "@/lib/db";
import { ADMINS, ApiError, body, guarded } from "@/lib/api";
import { canManage, hashPassword, revokeUserSessions } from "@/lib/auth";
import { audit } from "@/lib/security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().min(2).max(80), email: z.string().email(), maxDevices: z.number().int().min(1).max(20).nullable() }),
  z.object({ action: z.literal("reset_password"), password: z.string().min(8).max(100) }),
  z.object({ action: z.literal("set_active"), active: z.boolean() }),
  z.object({ action: z.literal("reset_devices") }),
  z.object({ action: z.literal("force_logout") }),
  z.object({ action: z.literal("set_courses"), courseIds: z.array(z.string()) }),
]);

export const PATCH = guarded<{ id: string }>(ADMINS, async ({ req, info, params }) => {
  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) throw new ApiError(404, "User not found");
  if (!canManage(info.user.role, target.role)) throw new ApiError(403, "You cannot manage this account");
  if (target.id === info.user.id) throw new ApiError(400, "Use another account to change your own access");
  const b = await body(req, schema);
  const log = (a: string, meta?: Record<string, unknown>) => audit(a, { userId: info.user.id, resource: target.id, meta });

  switch (b.action) {
    case "update":
      await db.user.update({ where: { id: target.id }, data: { name: b.name, email: b.email.toLowerCase(), maxDevices: b.maxDevices } }); await log("USER_UPDATED"); break;
    case "reset_password":
      await db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(b.password) } });
      await revokeUserSessions(target.id, "ADMIN"); await log("PASSWORD_RESET"); break;
    case "set_active":
      await db.user.update({ where: { id: target.id }, data: { active: b.active } });
      if (!b.active) await revokeUserSessions(target.id, "DEACTIVATED");
      await log(b.active ? "USER_ACTIVATED" : "USER_DEACTIVATED"); break;
    case "reset_devices":
      await db.device.deleteMany({ where: { userId: target.id } }); await revokeUserSessions(target.id, "ADMIN"); await log("DEVICES_RESET"); break;
    case "force_logout":
      await revokeUserSessions(target.id, "ADMIN"); await log("FORCE_LOGOUT"); break;
    case "set_courses": {
      if (target.role !== "LEARNER") throw new ApiError(400, "Only learners can be enrolled");
      await db.enrollment.deleteMany({ where: { userId: target.id, courseId: { notIn: b.courseIds } } });
      for (const courseId of b.courseIds) await db.enrollment.upsert({ where: { userId_courseId: { userId: target.id, courseId } }, update: {}, create: { userId: target.id, courseId, assignedBy: info.user.id } });
      await log("COURSES_ASSIGNED", { courseIds: b.courseIds }); break;
    }
  }
  return { ok: true };
});
