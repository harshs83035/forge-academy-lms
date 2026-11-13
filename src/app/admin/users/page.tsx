import { requirePage } from "@/lib/auth";
import { UserManager } from "@/components/admin/user-manager";
import { loadUsers } from "@/components/admin/load-users";

export const metadata = { title: "Learners" };
export default async function Users() {
  const { user } = await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const { users, courses } = await loadUsers("LEARNER");
  return <UserManager mode="LEARNER" users={users} courses={courses} viewerRole={user.role} />;
}
