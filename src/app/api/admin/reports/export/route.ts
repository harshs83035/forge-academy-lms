import { ADMINS, ApiError, guarded } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { completionRows, progressRows, quizRows } from "@/lib/reports";
import { audit } from "@/lib/security";

export const GET = guarded(ADMINS, async ({ req, info }) => {
  const type = new URL(req.url).searchParams.get("type");
  let rows: (string | number | null)[][];
  if (type === "progress") rows = [["Learner ID", "Name", "Email", "Module", "Videos done", "Total videos", "Progress %", "Last activity"], ...(await progressRows()).map((r) => [r.code, r.name, r.email, r.course, r.done, r.total, r.percent, r.last?.toISOString() ?? ""])];
  else if (type === "quiz") rows = [["Learner ID", "Name", "Module", "Score %", "Result", "Date"], ...(await quizRows()).map((r) => [r.code, r.name, r.course, r.score, r.passed ? "PASS" : "FAIL", r.at.toISOString()])];
  else if (type === "completion") rows = [["Module", "Enrolled", "Certified", "Completion rate %", "Avg progress %"], ...(await completionRows()).map((r) => [r.course, r.enrolled, r.completed, r.rate, r.avg])];
  else throw new ApiError(400, "Unknown report type");
  await audit("REPORT_EXPORTED", { userId: info.user.id, meta: { type } });
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${type}-report.csv"` } });
});
