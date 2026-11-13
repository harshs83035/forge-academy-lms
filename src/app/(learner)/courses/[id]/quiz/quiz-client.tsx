"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, CheckCircle2, Download, RotateCcw, XCircle } from "lucide-react";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { api, ApiFail } from "@/lib/client";

type Q = { id: string; text: string; options: string[] };
type Result = { score: number; passed: boolean; passMark: number; results: { id: string; correct: boolean }[]; certId: string | null };

export function QuizClient({ courseId, title, course, passMark, questions, existingCert }: { courseId: string; title: string; course: string; passMark: number; questions: Q[]; existingCert: string | null }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [res, setRes] = useState<Result | null>(null);
  const answered = Object.keys(answers).length;

  async function submit() {
    setBusy(true); setError(null);
    try { setRes(await api<Result>(`/api/quiz/${courseId}/attempt`, { body: { answers } })); window.scrollTo({ top: 0, behavior: "smooth" }); router.refresh(); }
    catch (e) { setError(e instanceof ApiFail ? e.message : "Could not submit"); }
    setBusy(false);
  }
  const verdict = (id: string) => res?.results.find((r) => r.id === id)?.correct;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><Link href={`/courses/${courseId}`} className="text-sm font-semibold text-slate-500 hover:text-brand-600">← {course}</Link><h1 className="mt-2 text-3xl font-extrabold">{title}</h1><p className="text-slate-500">{questions.length} questions · pass mark {passMark}%</p></div>

      {res && (
        <Card className={`p-6 text-center ${res.passed ? "border-emerald-300 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
          {res.passed ? <Award className="mx-auto text-emerald-600" size={44} /> : <XCircle className="mx-auto text-red-500" size={44} />}
          <p className="mt-2 text-4xl font-black">{res.score}%</p>
          <p className="font-semibold">{res.passed ? "Congratulations — you passed!" : `Not quite — you need ${res.passMark}% to pass.`}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            {res.certId && <a href={`/api/certificates/${res.certId}/pdf`} className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"><Download size={15} /> Download certificate ({res.certId})</a>}
            {!res.passed && <Button onClick={() => { setRes(null); setAnswers({}); }}><RotateCcw size={15} /> Try again</Button>}
          </div>
        </Card>
      )}
      {!res && existingCert && <Alert tone="green">You already hold a certificate for this module ({existingCert}). Retaking is optional.</Alert>}
      {error && <Alert>{error}</Alert>}

      {questions.map((q, i) => (
        <Card key={q.id} className="p-5">
          <p className="flex gap-3 font-semibold"><span className="text-brand">{i + 1}.</span>{q.text}{res && (verdict(q.id) ? <CheckCircle2 className="ml-auto shrink-0 text-emerald-500" /> : <XCircle className="ml-auto shrink-0 text-red-500" />)}</p>
          <div className="mt-3 space-y-2">
            {q.options.map((o, k) => (
              <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${answers[q.id] === k ? "border-brand bg-brand-50" : "border-navy-100 hover:bg-navy-50"} ${res ? "pointer-events-none" : ""}`}>
                <input type="radio" name={q.id} className="accent-[#ff7a1a]" checked={answers[q.id] === k} onChange={() => setAnswers({ ...answers, [q.id]: k })} /> {o}
              </label>
            ))}
          </div>
        </Card>
      ))}
      {!res && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-xl bg-navy-900 p-4 text-white shadow-xl">
          <span className="text-sm">{answered}/{questions.length} answered</span>
          <Button disabled={busy || answered < questions.length} onClick={submit}>{busy ? <Spinner /> : <><CheckCircle2 size={16} /> Submit answers</>}</Button>
        </div>
      )}
    </div>
  );
}
