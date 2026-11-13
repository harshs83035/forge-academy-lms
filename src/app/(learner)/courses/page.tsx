import Link from "next/link";
import { BookOpen, CheckCircle2, ArrowRight } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseState } from "@/lib/progress";
import { getLang, tr } from "@/lib/i18n";
import { Badge, Card, EmptyState, ProgressBar } from "@/components/ui";

export const metadata = { title: "My Courses" };

export default async function Dashboard() {
  const { user } = await requirePage(["LEARNER"]);
  const t = tr(await getLang());
  const enrol = await db.enrollment.findMany({ where: { userId: user.id, course: { published: true } }, include: { course: true }, orderBy: { course: { position: "asc" } } });
  const states = (await Promise.all(enrol.map((e) => courseState(user.id, e.courseId)))).filter((s) => s !== null);
  const overall = states.length ? Math.round(states.reduce((s, c) => s + c.percent, 0) / states.length) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand-600">{t("welcome")}, {user.name.split(" ")[0]}</p>
          <h1 className="text-3xl font-extrabold">{t("myCourses")}</h1>
          <p className="text-slate-500">{t("assigned")}</p>
        </div>
        {states.length > 0 && <Card className="flex w-64 items-center gap-3 px-4 py-3"><div className="flex-1"><p className="text-xs font-semibold uppercase text-slate-500">{t("progress")}</p><ProgressBar value={overall} className="mt-2" /></div><b className="text-xl">{overall}%</b></Card>}
      </div>

      {states.length === 0 ? <EmptyState icon={<BookOpen size={36} />} title={t("noCourses")} hint={t("noCoursesHint")} /> : (
        <div className="grid gap-5 md:grid-cols-2">
          {states.map((s) => {
            const next = s.videos.find((v) => v.status !== "completed" && !v.locked);
            return (
              <Link key={s.course.id} href={`/courses/${s.course.id}`} className="group">
                <Card className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                  <div className="gear-bg flex h-24 items-end justify-between bg-navy-900 p-5">
                    <Badge tone={s.percent === 100 ? "green" : "orange"}>{s.percent === 100 ? <><CheckCircle2 size={12} /> {t("completed")}</> : `${s.done}/${s.videos.length} ${t("videos")}`}</Badge>
                    <span className="text-4xl font-black text-white/15">{String(s.course.position).padStart(2, "0")}</span>
                  </div>
                  <div className="space-y-4 p-5">
                    <div><h2 className="text-lg font-bold leading-snug">{s.course.title}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-500">{s.course.description}</p></div>
                    <div className="flex items-center gap-3"><ProgressBar value={s.percent} /><span className="text-sm font-bold">{s.percent}%</span></div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{next ? `${t("nextUp")}: ${next.title}` : s.certificate ? t("certificateEarned") : s.allDone ? t("takeQuiz") : ""}</span>
                      <span className="flex items-center gap-1 font-semibold text-brand-600">{s.percent === 0 ? t("start") : s.percent === 100 ? t("review") : t("continue")} <ArrowRight size={14} className="transition group-hover:translate-x-1" /></span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
