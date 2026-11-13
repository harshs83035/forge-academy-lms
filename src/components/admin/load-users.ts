import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

export type UserRow = {
  id: string; code: string; name: string; email: string; active: boolean; maxDevices: number | null; role: Role; courseIds: string[];
  devices: { id: string; label: string; lastSeenAt: string }[]; online: boolean; lastLogin: string | null;
};

export async function loadUsers(role: Role) {
  const [rows, courses] = await Promise.all([
    db.user.findMany({ where: { role }, orderBy: { createdAt: "asc" }, include: { devices: true, enrollments: true, sessions: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    db.course.findMany({ orderBy: { position: "asc" }, select: { id: true, title: true } }),
  ]);
  const users: UserRow[] = rows.map((u) => ({
    id: u.id, code: u.code, name: u.name, email: u.email, active: u.active, maxDevices: u.maxDevices, role: u.role,
    courseIds: u.enrollments.map((e) => e.courseId),
    devices: u.devices.map((d) => ({ id: d.id, label: d.label, lastSeenAt: d.lastSeenAt.toISOString() })),
    online: !!u.sessions[0] && !u.sessions[0].revokedAt && Date.now() - u.sessions[0].lastSeenAt.getTime() < 120_000,
    lastLogin: u.sessions[0]?.createdAt.toISOString() ?? null,
  }));
  return { users, courses };
}
