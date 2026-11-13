import Link from "next/link";
import { BarChart3, BookOpen, LayoutDashboard, ScrollText, Settings, ShieldCheck, Users } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { LogoutButton, SessionWatcher } from "@/components/shell";
import { Badge } from "@/components/ui";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const sa = user.role === "SUPER_ADMIN";
  const nav = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/users", label: "Learners", icon: Users },
    { href: "/admin/courses", label: "Modules & videos", icon: BookOpen },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    ...(sa ? [{ href: "/admin/admins", label: "Admins", icon: ShieldCheck }, { href: "/admin/settings", label: "Security settings", icon: Settings }] : []),
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="gear-bg sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-900 p-5 text-white md:flex">
        <Link href="/admin"><Logo /></Link>
        <nav className="mt-8 flex-1 space-y-1">
          {nav.map((n) => <Link key={n.href} href={n.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"><n.icon size={17} className="text-brand" />{n.label}</Link>)}
        </nav>
        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-sm font-bold">{user.name}</p><Badge tone="orange">{ROLE_LABEL[user.role]}</Badge>
          <div><LogoutButton /></div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between bg-navy-900 px-4 py-3 text-white md:hidden"><Logo /><LogoutButton /></div>
        <nav className="flex gap-1 overflow-x-auto bg-navy-800 px-2 py-1 text-xs font-semibold text-white md:hidden">{nav.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap rounded px-3 py-2 hover:bg-white/10">{n.label}</Link>)}</nav>
        <SessionWatcher />
        <main className="mx-auto max-w-6xl p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
