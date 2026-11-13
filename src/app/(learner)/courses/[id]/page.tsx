import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, CheckCircle2, ClipboardCheck, Circle, Download, Lock, PlayCircle } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseState } from "@/lib/progress";
import { getLang, tr } from "@/lib/i18n";
import { fmtDate, fmtDuration } from "@/lib/utils";
import { Badge, Card, ProgressBar } from "@/components/ui";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePage(["LEARNER"]);
  const t = tr(await getLang());
  if (!(await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: id } } }))) notFound();
  const s = await courseState(user.id, id);
  if (!s) notFound();
  const resume = s.videos.find((v) => v.status !== "completed" && !v.locked);
  const qCount = s.course.quiz?._count.questions ?? 0;

  return (
    <div className="space-y-6">
      <Link href="/courses" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600"><ArrowLeft size={14} /> {t("backToCourses")}</Link>
      <Card className="gear-bg overflow-hidden bg-navy-900 p-6 text-white md:p-8">
        <h1 className="text-2xl font-extrabold md:text-3xl">{s.course.title}</h1>
        <p className="mt-2 max-w-2xl text-white/70">{s.course.description}</p>
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <div className="min-w-64 flex-1"><div className="mb-1.5 flex justify-between text-sm"><span className="text-white/70">{s.done}/{s.videos.length} {t("videos")}</span><b>{s.percent}%</b></div><ProgressBar value={s.percent} className="bg-white/15" /></div>
          {resume && <Link href={`/watch/${resume.id}`} className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold hover:bg-brand-600"><PlayCircle size={18} /> {resume.status === "in_progress" ? `${t("resume")} · ${resume.title}` : s.done === 0 ? t("start") : t("continue")}</Link>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="divide-y divide-navy-100 overflow-hidden">
          {s.videos.length === 0 && <p className="p-8 text-center text-slate-500">No videos have been added to this module yet.</p>}
          {s.videos.map((v, i) => {
            const body = (
              <div className={`flex items-center gap-4 px-5 py-4 ${v.locked ? "opacity-55" : "hover:bg-navy-50"}`}>
                <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                {v.status === "completed" ? <CheckCircle2 className="shrink-0 text-emerald-500" /> : v.locked ? <Lock className="shrink-0 text-slate-400" size={20} /> : v.status === "in_progress" ? <PlayCircle className="shrink-0 text-brand" /> : <Circle className="shrink-0 text-slate-300" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{v.title}</p>
                  <p className="truncate text-sm text-slate-500">{v.description}</p>
                  {v.status === "in_progress" && <ProgressBar value={v.pct} className="mt-2 h-1.5 max-w-48" />}
                </div>
                <div className="hidden gap-1 sm:flex">{v.tracks.map((tr) => <Badge key={tr.lang}>{tr.lang.toUpperCase()}</Badge>)}</div>
                <span className="w-12 text-right text-sm tabular-nums text-slate-500">{fmtDuration(v.durationSec)}</span>
                <Badge tone={v.status === "completed" ? "green" : v.locked ? "slate" : v.status === "in_progress" ? "orange" : "slate"} className="w-24 justify-center">
                  {v.locked ? t("locked") : v.status === "completed" ? t("completed") : v.status === "in_progress" ? t("inProgress") : t("notStarted")}
                </Badge>
              </div>
            );
            return v.locked ? <div key={v.id} title="Complete the previous video to unlock">{body}</div> : <Link key={v.id} href={`/watch/${v.id}`} className="block">{body}</Link>;
          })}
        </Card>

        <div className="space-y-4">
          {s.course.quiz && (
            <Card className="p-5">
              <div className="flex items-center gap-2 font-bold"><ClipboardCheck className="text-brand" size={20} /> {s.course.quiz.title}</div>
              <p className="mt-1 text-sm text-slate-500">{qCount} MCQ · {t("passMark")} {s.course.passMark}%</p>
              {s.bestAttempt && <p className="mt-3 text-sm">{t("bestScore")}: <b className={s.bestAttempt.passed ? "text-emerald-600" : "text-red-600"}>{s.bestAttempt.score}%</b></p>}
              {s.allDone ? <Link href={`/courses/${id}/quiz`} className="mt-4 block rounded-lg bg-brand py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600">{s.bestAttempt?.passed ? t("review") : t("takeQuiz")}</Link>
                : <p className="mt-4 flex items-center gap-2 rounded-lg bg-navy-50 p-3 text-sm text-slate-500"><Lock size={14} /> {t("quizLocked")}</p>}
            </Card>
          )}
          <Card className={`p-5 ${s.certificate ? "border-emerald-200 bg-emerald-50/40" : ""}`}>
            <div className="flex items-center gap-2 font-bold"><Award className={s.certificate ? "text-emerald-600" : "text-slate-400"} size={20} /> {t("certificates")}</div>
            {s.certificate ? (
              <>
                <p className="mt-1 text-sm text-slate-600">ID <b className="font-mono">{s.certificate.certId}</b> · {fmtDate(s.certificate.issuedAt)}</p>
                <a href={`/api/certificates/${s.certificate.certId}/pdf`} className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-navy-900 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"><Download size={15} /> {t("downloadCert")}</a>
              </>
            ) : <p className="mt-1 text-sm text-slate-500">Complete all videos{s.course.quiz ? ` and pass the assessment (${s.course.passMark}%)` : ""} to earn your certificate.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
