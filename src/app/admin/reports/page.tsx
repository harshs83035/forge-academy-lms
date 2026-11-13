import Link from "next/link";
import { Download } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { completionRows, progressRows, quizRows } from "@/lib/reports";
import { fmtDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, ProgressBar } from "@/components/ui";

export const metadata = { title: "Reports" };
const TABS = [["progress", "User progress"], ["quiz", "Quiz scores"], ["completion", "Completion rates"]] as const;

export default async function Reports({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const tab = ((await searchParams).tab ?? "progress") as (typeof TABS)[number][0];
  const th = "px-4 py-3", head = "border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-slate-500";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Reports</h1><p className="text-slate-500">Learner progress, assessment results and completion rates.</p></div>
        <a href={`/api/admin/reports/export?type=${tab}`} className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"><Download size={15} /> Export CSV</a></div>
      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-navy-100 w-fit">{TABS.map(([k, l]) => <Link key={k} href={`/admin/reports?tab=${k}`} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === k ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-navy-50"}`}>{l}</Link>)}</div>
      {tab === "progress" && await (async () => { const r = await progressRows(); return r.length === 0 ? <EmptyState title="No enrolments yet" /> : (
        <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className={head}><tr><th className={th}>Learner</th><th className={th}>Module</th><th className={th}>Videos</th><th className={`${th} w-56`}>Progress</th><th className={th}>Last activity</th></tr></thead>
          <tbody className="divide-y divide-navy-100">{r.map((x, i) => <tr key={i}><td className="px-4 py-3"><b>{x.name}</b> <span className="font-mono text-xs text-slate-500">{x.code}</span></td><td className="px-4 py-3">{x.course}</td><td className="px-4 py-3">{x.done}/{x.total}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><ProgressBar value={x.percent} /><b className="w-10 text-right">{x.percent}%</b></div></td><td className="px-4 py-3 text-slate-500">{fmtDateTime(x.last)}</td></tr>)}</tbody></table></Card>); })()}
      {tab === "quiz" && await (async () => { const r = await quizRows(); return r.length === 0 ? <EmptyState title="No quiz attempts yet" /> : (
        <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className={head}><tr><th className={th}>Learner</th><th className={th}>Module</th><th className={th}>Score</th><th className={th}>Result</th><th className={th}>Date</th></tr></thead>
          <tbody className="divide-y divide-navy-100">{r.map((x, i) => <tr key={i}><td className="px-4 py-3"><b>{x.name}</b> <span className="font-mono text-xs text-slate-500">{x.code}</span></td><td className="px-4 py-3">{x.course}</td><td className="px-4 py-3 font-bold">{x.score}%</td><td className="px-4 py-3"><Badge tone={x.passed ? "green" : "red"}>{x.passed ? "Pass" : "Fail"}</Badge></td><td className="px-4 py-3 text-slate-500">{fmtDateTime(x.at)}</td></tr>)}</tbody></table></Card>); })()}
      {tab === "completion" && await (async () => { const r = await completionRows(); return (
        <Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className={head}><tr><th className={th}>Module</th><th className={th}>Enrolled</th><th className={th}>Certified</th><th className={`${th} w-56`}>Completion rate</th><th className={th}>Avg progress</th></tr></thead>
          <tbody className="divide-y divide-navy-100">{r.map((x) => <tr key={x.course}><td className="px-4 py-3 font-semibold">{x.course}</td><td className="px-4 py-3">{x.enrolled}</td><td className="px-4 py-3">{x.completed}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><ProgressBar value={x.rate} /><b className="w-10 text-right">{x.rate}%</b></div></td><td className="px-4 py-3">{x.avg}%</td></tr>)}</tbody></table></Card>); })()}
    </div>
  );
}
