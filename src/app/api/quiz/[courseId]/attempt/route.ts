import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, guarded } from "@/lib/api";
import { courseState } from "@/lib/progress";
import { maybeIssueCertificate } from "@/lib/certificate";
import { audit } from "@/lib/security";

const schema = z.object({ answers: z.record(z.string(), z.number().int()) });

export const POST = guarded<{ courseId: string }>(["LEARNER"], async ({ req, info, params }) => {
  const { user } = info;
  const enrolled = await db.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: params.courseId } } });
  if (!enrolled) throw new ApiError(403, "Course not assigned");
  const state = await courseState(user.id, params.courseId);
  if (!state || !state.allDone) throw new ApiError(403, "Finish all videos before the assessment");
  const quiz = await db.quiz.findUnique({ where: { courseId: params.courseId }, include: { questions: { orderBy: { position: "asc" } } } });
  if (!quiz || !quiz.questions.length) throw new ApiError(404, "No assessment for this course");
  const { answers } = await body(req, schema);

  const results = quiz.questions.map((q) => ({ id: q.id, correct: answers[q.id] === q.correctIndex }));
  const score = Math.round((results.filter((r) => r.correct).length / quiz.questions.length) * 100);
  const passed = score >= state.course.passMark;
  const attempt = await db.attempt.create({ data: { userId: user.id, quizId: quiz.id, score, passed, answers } });
  await audit("QUIZ_ATTEMPT", { userId: user.id, resource: quiz.id, meta: { score, passed } });
  const cert = passed ? await maybeIssueCertificate(user.id, params.courseId) : null;
  // correct answers are never sent; only per-question right/wrong
  return { attemptId: attempt.id, score, passed, passMark: state.course.passMark, results, certId: cert?.certId ?? null };
});
