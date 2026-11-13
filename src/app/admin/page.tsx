import Link from "next/link";
import { Award, BookOpen, GraduationCap, PlayCircle, TrendingUp } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { completionRows } from "@/lib/reports";
import { fmtDateTime } from "@/lib/utils";
import { Card, ProgressBar } from "@/components/ui";

export const metadata = { title: "Admin dashboard" };

export default async function AdminHome() {
  const { user } = await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const [learners, admins, videos, certs, comp, recent, live] = await Promise.all([
    db.user.count({ where: { role: "LEARNER", active: true } }), db.user.count({ where: { role: "ADMIN", active: true } }), db.video.count(), db.certificate.count(),
    completionRows(), db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.session.count({ where: { revokedAt: null, lastSeenAt: { gt: new Date(Date.now() - 2 * 60_000) } } }),
  ]);
  const stats = [
    { label: "Active learners", value: learners, icon: GraduationCap }, { label: "Modules", value: comp.length, icon: BookOpen },
    { label: "Videos", value: videos, icon: PlayCircle }, { label: "Certificates issued", value: certs, icon: Award }, { label: "Signed in now", value: live, icon: TrendingUp },
  ];
  return (
    <div className="space-y-8">
      <div><h1 className="text-3xl font-extrabold">Welcome, {user.name.split(" ")[0]}</h1><p className="text-slate-500">Platform overview{user.role === "SUPER_ADMIN" ? ` · ${admins} active admin${admins === 1 ? "" : "s"}` : ""}</p></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => <Card key={s.label} className="p-5"><s.icon className="text-brand" size={22} /><p className="mt-3 text-3xl font-black">{s.value}</p><p className="text-sm text-slate-500">{s.label}</p></Card>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6"><h2 className="mb-4 font-bold">Module completion</h2>
          <div className="space-y-5">{comp.map((c) => <div key={c.course}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{c.course}</span><span className="text-slate-500">{c.completed}/{c.enrolled} certified · avg {c.avg}%</span></div><ProgressBar value={c.avg} /></div>)}</div>
          <Link href="/admin/reports" className="mt-5 inline-block text-sm font-semibold text-brand-600 hover:underline">Full reports →</Link></Card>
        <Card className="p-6"><h2 className="mb-4 font-bold">Recent activity</h2>
          <ul className="divide-y divide-navy-100 text-sm">{recent.map((r) => <li key={r.id} className="flex justify-between py-2"><span className="font-mono text-xs font-semibold">{r.action}</span><span className="text-slate-500">{fmtDateTime(r.createdAt)}</span></li>)}</ul></Card>
      </div>
    </div>
  );
}
