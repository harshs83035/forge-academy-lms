import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { CourseSettings, QuizEditor, VideoManager } from "@/components/admin/course-forms";

export default async function CourseAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePage(["SUPER_ADMIN", "ADMIN"]);
  const c = await db.course.findUnique({ where: { id }, include: { videos: { orderBy: { position: "asc" }, include: { tracks: true } }, quiz: { include: { questions: { orderBy: { position: "asc" } } } } } });
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <div><Link href="/admin/courses" className="text-sm font-semibold text-slate-500 hover:text-brand-600">← All modules</Link><h1 className="mt-1 text-3xl font-extrabold">{c.title}</h1></div>
      <CourseSettings course={{ id: c.id, title: c.title, description: c.description, passMark: c.passMark, sequential: c.sequential, published: c.published }} />
      <VideoManager courseId={c.id} videos={c.videos.map((v) => ({ id: v.id, title: v.title, description: v.description, position: v.position, durationSec: v.durationSec, langs: v.tracks.map((t) => t.lang), sourceName: v.sourceName }))} />
      <QuizEditor courseId={c.id} title={c.quiz?.title ?? `${c.title} assessment`} questions={(c.quiz?.questions ?? []).map((q) => ({ text: q.text, options: q.options as string[], correctIndex: q.correctIndex }))} />
    </div>
  );
}
