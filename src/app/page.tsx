import { redirect } from "next/navigation";
import { getAuth, homeFor } from "@/lib/auth";

export default async function Home() {
  const a = await getAuth();
  redirect(a.ok ? homeFor(a.info.user.role) : "/login");
}
