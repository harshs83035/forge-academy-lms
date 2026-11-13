import { z } from "zod";
import { db } from "@/lib/db";
import { ADMINS, body, guarded } from "@/lib/api";
import { audit } from "@/lib/security";

const schema = z.object({
  title: z.string().min(2).max(120),
  questions: z.array(z.object({ text: z.string().min(3), options: z.array(z.string().min(1)).min(2).max(6), correctIndex: z.number().int().min(0) })).max(100)
    .refine((qs) => qs.every((q) => q.correctIndex < q.options.length), "correctIndex out of range"),
});

export const PUT = guarded<{ id: string }>(ADMINS, async ({ req, info, params }) => {
  const b = await body(req, schema);
  const quiz = await db.quiz.upsert({ where: { courseId: params.id }, update: { title: b.title }, create: { courseId: params.id, title: b.title } });
  await db.question.deleteMany({ where: { quizId: quiz.id } });
  await db.question.createMany({ data: b.questions.map((q, i) => ({ quizId: quiz.id, text: q.text, options: q.options, correctIndex: q.correctIndex, position: i })) });
  await audit("QUIZ_UPDATED", { userId: info.user.id, resource: params.id, meta: { questions: b.questions.length } });
});
