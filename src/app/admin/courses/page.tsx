import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";
import { NewCourseButton } from "@/components/admin/course-forms";

export const metadata = { title: "Modules & videos" };

export default async function Courses() {
  await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const courses = await db.course.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { videos: true, enrollments: true } }, quiz: { include: { _count: { select: { questions: true } } } } } });
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><div><h1 className="text-3xl font-extrabold">Modules & videos</h1><p className="text-slate-500">Manage training modules, their videos, language tracks and assessments.</p></div><NewCourseButton /></div>
      {courses.length === 0 ? <EmptyState icon={<BookOpen size={34} />} title="No modules yet" hint="Create the first module to start adding videos." /> : (
        <div className="space-y-3">{courses.map((c) => (
          <Link key={c.id} href={`/admin/courses/${c.id}`}><Card className="mb-3 flex items-center gap-4 p-5 transition hover:border-brand hover:shadow-md">
            <span className="text-3xl font-black text-navy-100">{String(c.position).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1"><p className="font-bold">{c.title}</p><p className="truncate text-sm text-slate-500">{c.description}</p></div>
            <Badge>{c._count.videos} videos</Badge><Badge>{c.quiz?._count.questions ?? 0} questions</Badge><Badge>{c._count.enrollments} learners</Badge>{!c.published && <Badge tone="orange">Draft</Badge>}
            <ChevronRight className="text-slate-400" /></Card></Link>
        ))}</div>
      )}
    </div>
  );
}
