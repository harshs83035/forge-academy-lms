import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";

export const metadata = { title: "Audit log" };
const tone = (a: string) => (/DENIED|FAILED|BLOCKED|RATE|DUPLICATE|TAMPER/.test(a) ? "red" : /KEY|PLAYBACK|CLIENT/.test(a) ? "orange" : "slate") as "red" | "orange" | "slate";

export default async function Audit() {
  await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const rows = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const users = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-extrabold">Audit log</h1><p className="text-slate-500">Last 200 events — sign-ins, key issuance, blocked streams, rate limits and admin actions.</p></div>
      <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">IP</th></tr></thead>
        <tbody className="divide-y divide-navy-100">{rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{fmtDateTime(r.createdAt)}</td><td className="px-4 py-2.5"><Badge tone={tone(r.action)} className="font-mono">{r.action}</Badge></td><td className="px-4 py-2.5">{r.userId ? users.get(r.userId) ?? r.userId.slice(0, 8) : "—"}</td><td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-slate-500">{r.meta ? JSON.stringify(r.meta) : r.resource ?? ""}</td><td className="px-4 py-2.5 text-xs text-slate-500">{r.ip ?? ""}</td></tr>)}</tbody></table></Card>
    </div>
  );
}
