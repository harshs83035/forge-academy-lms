import { requirePage } from "@/lib/auth";
import { UserManager } from "@/components/admin/user-manager";
import { loadUsers } from "@/components/admin/load-users";

export const metadata = { title: "Admins" };
export default async function Admins() {
  const { user } = await requirePage(["SUPER_ADMIN"]); // UI guard; the API enforces it again
  const { users, courses } = await loadUsers("ADMIN");
  return <UserManager mode="ADMIN" users={users} courses={courses} viewerRole={user.role} />;
}
