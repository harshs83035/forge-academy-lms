import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Circle, Lock, PlayCircle, ArrowLeft } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseState } from "@/lib/progress";
import { fmtDuration } from "@/lib/utils";
import { SecurePlayer } from "@/components/player/secure-player";
import { Card } from "@/components/ui";

export const metadata = { title: "Watch" };

export default async function Watch({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  const { user } = await requirePage(["LEARNER"]);
  const video = await db.video.findUnique({ where: { id: videoId } });
  if (!video) notFound();
  if (!(await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: video.courseId } } }))) notFound();
  const s = (await courseState(user.id, video.courseId))!;
  const idx = s.videos.findIndex((v) => v.id === videoId);
  if (s.videos[idx].locked) redirect(`/courses/${video.courseId}`);
  const next = s.videos[idx + 1];
  const last = !next;
  const nextHref = next && !next.locked ? `/watch/${next.id}` : null;

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-3.5rem)] px-4 py-8 text-white">
      <div aria-hidden className="fixed inset-0 -z-10 bg-navy-950" />
      <div className="mx-auto max-w-6xl space-y-5">
        <Link href={`/courses/${video.courseId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/60 hover:text-brand"><ArrowLeft size={14} /> {s.course.title}</Link>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <SecurePlayer key={videoId} videoId={videoId} courseHref={`/courses/${video.courseId}`} nextHref={nextHref}
              nextLabel={last ? (s.course.quiz ? "Go to assessment" : "Back to course") : "Next video"} alreadyDone={s.videos[idx].status === "completed"} />
            <div><h1 className="text-2xl font-extrabold">{idx + 1}. {video.title}</h1><p className="mt-1 text-white/60">{video.description}</p></div>
          </div>
          <Card className="h-fit divide-y divide-white/10 overflow-hidden border-white/10 bg-navy-900 text-white">
            <div className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-white/50">Module playlist · {s.percent}%</div>
            {s.videos.map((v, i) => {
              const inner = (
                <div className={`flex items-center gap-3 px-4 py-3 text-sm ${v.id === videoId ? "bg-brand/15" : v.locked ? "opacity-40" : "hover:bg-white/5"}`}>
                  {v.status === "completed" ? <CheckCircle2 size={18} className="shrink-0 text-emerald-400" /> : v.locked ? <Lock size={16} className="shrink-0" /> : v.id === videoId ? <PlayCircle size={18} className="shrink-0 text-brand" /> : <Circle size={18} className="shrink-0 text-white/30" />}
                  <span className="min-w-0 flex-1 truncate">{i + 1}. {v.title}</span><span className="text-xs tabular-nums text-white/40">{fmtDuration(v.durationSec)}</span>
                </div>
              );
              return v.locked ? <div key={v.id}>{inner}</div> : <Link key={v.id} href={`/watch/${v.id}`} className="block">{inner}</Link>;
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}
