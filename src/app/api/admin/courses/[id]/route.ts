import { db } from "@/lib/db";
import { ADMINS, body, guarded } from "@/lib/api";
import { audit } from "@/lib/security";
import { courseSchema } from "../route";

export const PATCH = guarded<{ id: string }>(ADMINS, async ({ req, info, params }) => {
  await db.course.update({ where: { id: params.id }, data: await body(req, courseSchema.partial()) });
  await audit("COURSE_UPDATED", { userId: info.user.id, resource: params.id });
});
export const DELETE = guarded<{ id: string }>(["SUPER_ADMIN", "ADMIN"], async ({ info, params }) => {
  await db.course.delete({ where: { id: params.id } });
  await audit("COURSE_DELETED", { userId: info.user.id, resource: params.id });
});
