import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { courseState } from "@/lib/progress";
import { QuizClient } from "./quiz-client";

export const metadata = { title: "Assessment" };

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePage(["LEARNER"]);
  if (!(await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: id } } }))) notFound();
  const s = await courseState(user.id, id);
  if (!s || !s.course.quiz) notFound();
  if (!s.allDone) redirect(`/courses/${id}`);
  const questions = await db.question.findMany({ where: { quizId: s.course.quiz.id }, orderBy: { position: "asc" }, select: { id: true, text: true, options: true } }); // correctIndex never leaves the server
  return <QuizClient courseId={id} title={s.course.quiz.title} course={s.course.title} passMark={s.course.passMark} questions={questions.map((q) => ({ ...q, options: q.options as string[] }))} existingCert={s.certificate?.certId ?? null} />;
}
