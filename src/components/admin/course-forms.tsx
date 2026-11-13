"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { api, ApiFail } from "@/lib/client";
import { fmtDuration } from "@/lib/utils";

const useAct = () => {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true); setErr("");
    try { await fn(); after?.(); router.refresh(); } catch (e) { setErr(e instanceof ApiFail ? e.message : "Failed"); }
    setBusy(false);
  };
  return { busy, err, run, router };
};

export function NewCourseButton() {
  const [open, setOpen] = useState(false), [f, setF] = useState({ title: "", description: "", passMark: 70 });
  const { busy, err, run, router } = useAct();
  return (<>
    <Button onClick={() => setOpen(true)}><Plus size={16} /> New module</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Create module">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api<{ id: string }>("/api/admin/courses", { body: { ...f, sequential: true, published: true } }); router.push(`/admin/courses/${r.id}`); }); }}>
        {err && <Alert>{err}</Alert>}
        <Field label="Title"><Input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Pass mark (%)"><Input type="number" min={1} max={100} value={f.passMark} onChange={(e) => setF({ ...f, passMark: +e.target.value })} /></Field>
        <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Create module"}</Button>
      </form>
    </Modal>
  </>);
}

type Course = { id: string; title: string; description: string; passMark: number; sequential: boolean; published: boolean };
export function CourseSettings({ course }: { course: Course }) {
  const [f, setF] = useState(course); const { busy, err, run, router } = useAct(); const [saved, setSaved] = useState(false);
  return (
    <Card className="space-y-4 p-6">
      <h2 className="font-bold">Module settings</h2>
      {err && <Alert>{err}</Alert>}{saved && <Alert tone="green">Saved</Alert>}
      <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pass mark (%)"><Input type="number" min={1} max={100} value={f.passMark} onChange={(e) => setF({ ...f, passMark: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold"><input type="checkbox" className="accent-[#ff7a1a]" checked={f.sequential} onChange={(e) => setF({ ...f, sequential: e.target.checked })} /> Unlock videos sequentially</label>
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold"><input type="checkbox" className="accent-[#ff7a1a]" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published</label>
      </div>
      <div className="flex gap-3">
        <Button variant="dark" disabled={busy} onClick={() => run(() => api(`/api/admin/courses/${course.id}`, { method: "PATCH", body: { title: f.title, description: f.description, passMark: f.passMark, sequential: f.sequential, published: f.published } }), () => { setSaved(true); setTimeout(() => setSaved(false), 2000); })}>{busy ? <Spinner /> : "Save settings"}</Button>
        <Button variant="danger" disabled={busy} onClick={() => confirm("Delete this module, its videos, quiz and all learner progress?") && run(() => api(`/api/admin/courses/${course.id}`, { method: "DELETE" }), () => router.push("/admin/courses"))}><Trash2 size={15} /> Delete module</Button>
      </div>
    </Card>
  );
}

type V = { id: string; title: string; description: string; position: number; durationSec: number; langs: string[]; sourceName: string | null };
export function VideoManager({ courseId, videos }: { courseId: string; videos: V[] }) {
  const [adding, setAdding] = useState(false), [edit, setEdit] = useState<V | null>(null);
  const { busy, err, run } = useAct();
  const [form, setForm] = useState({ title: "", description: "", en: true, hi: true }), [file, setFile] = useState<File | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const fd = new FormData(); fd.set("title", form.title); fd.set("description", form.description); fd.set("courseId", courseId);
      if (form.en) fd.append("languages", "en"); if (form.hi) fd.append("languages", "hi"); if (file) fd.set("file", file);
      await api("/api/admin/videos", { form: fd });
    }, () => { setAdding(false); setForm({ title: "", description: "", en: true, hi: true }); setFile(null); });
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-navy-100 p-5"><h2 className="font-bold">Videos ({videos.length})</h2><Button size="sm" onClick={() => setAdding(true)}><Plus size={15} /> Add video</Button></div>
      {videos.length === 0 ? <p className="p-8 text-center text-slate-500">No videos yet. Add the first one.</p> : (
        <table className="w-full text-left text-sm"><tbody className="divide-y divide-navy-100">
          {videos.map((v) => (
            <tr key={v.id}><td className="w-12 px-5 py-3 font-bold text-slate-400">{v.position}</td>
              <td className="py-3"><p className="font-semibold">{v.title}</p><p className="text-xs text-slate-500">{v.sourceName ? `source: ${v.sourceName.slice(37)}` : "sample stream"}</p></td>
              <td className="px-3 py-3"><div className="flex gap-1">{v.langs.map((l) => <Badge key={l}>{l.toUpperCase()}</Badge>)}</div></td>
              <td className="px-3 py-3 tabular-nums text-slate-500">{fmtDuration(v.durationSec)}</td>
              <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEdit(v)} aria-label="Edit"><Pencil size={15} /></Button>
                <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} aria-label="Remove" onClick={() => confirm(`Remove "${v.title}"? Learner progress on it is deleted.`) && run(() => api(`/api/admin/videos/${v.id}`, { method: "DELETE" }))}><Trash2 size={15} /></Button></td></tr>
          ))}
        </tbody></table>
      )}
      {err && !adding && !edit && <div className="p-4"><Alert>{err}</Alert></div>}
      <Modal open={adding} onClose={() => setAdding(false)} title="Add video">
        <form onSubmit={add} className="space-y-4">
          {err && <Alert>{err}</Alert>}
          <Field label="Title"><Input required minLength={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Video file" hint="Prototype: the file is stored but packaging is stubbed — the sample encrypted stream is attached. Production runs scripts/package-hls.sh on upload."><Input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <fieldset className="flex gap-5 text-sm font-semibold"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Audio tracks</legend>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#ff7a1a]" checked={form.en} onChange={(e) => setForm({ ...form, en: e.target.checked })} /> English</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-[#ff7a1a]" checked={form.hi} onChange={(e) => setForm({ ...form, hi: e.target.checked })} /> हिन्दी</label></fieldset>
          <Button className="w-full" disabled={busy || (!form.en && !form.hi)}>{busy ? <Spinner /> : <><Upload size={15} /> Add to module</>}</Button>
        </form>
      </Modal>
      {edit && <EditVideo key={edit.id} v={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}
function EditVideo({ v, onClose }: { v: V; onClose: () => void }) {
  const [f, setF] = useState({ title: v.title, description: v.description, position: v.position, en: v.langs.includes("en"), hi: v.langs.includes("hi") });
  const { busy, err, run } = useAct();
  return (
    <Modal open onClose={onClose} title="Edit video">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/admin/videos/${v.id}`, { method: "PATCH", body: { title: f.title, description: f.description, position: f.position, languages: [f.en && "en", f.hi && "hi"].filter(Boolean) } }), onClose); }}>
        {err && <Alert>{err}</Alert>}
        <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Order"><Input type="number" min={1} value={f.position} onChange={(e) => setF({ ...f, position: +e.target.value })} /></Field>
        <div className="flex gap-5 text-sm font-semibold"><label className="flex items-center gap-2"><input type="checkbox" checked={f.en} onChange={(e) => setF({ ...f, en: e.target.checked })} /> English</label><label className="flex items-center gap-2"><input type="checkbox" checked={f.hi} onChange={(e) => setF({ ...f, hi: e.target.checked })} /> हिन्दी</label></div>
        <Button className="w-full" disabled={busy || (!f.en && !f.hi)}>{busy ? <Spinner /> : "Save"}</Button>
      </form>
    </Modal>
  );
}

type Q = { text: string; options: string[]; correctIndex: number };
export function QuizEditor({ courseId, title, questions }: { courseId: string; title: string; questions: Q[] }) {
  const [t, setT] = useState(title), [qs, setQs] = useState<Q[]>(questions), { busy, err, run } = useAct(), [saved, setSaved] = useState(false);
  const set = (i: number, p: Partial<Q>) => setQs(qs.map((q, k) => (k === i ? { ...q, ...p } : q)));
  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-center justify-between"><h2 className="font-bold">Assessment ({qs.length} questions)</h2><Button size="sm" variant="secondary" onClick={() => setQs([...qs, { text: "", options: ["", "", "", ""], correctIndex: 0 }])}><Plus size={15} /> Question</Button></div>
      {err && <Alert>{err}</Alert>}{saved && <Alert tone="green">Assessment saved</Alert>}
      <Field label="Quiz title"><Input value={t} onChange={(e) => setT(e.target.value)} /></Field>
      {qs.map((q, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-navy-100 bg-navy-50/50 p-4">
          <div className="flex gap-2"><Input placeholder={`Question ${i + 1}`} value={q.text} onChange={(e) => set(i, { text: e.target.value })} /><Button variant="ghost" className="text-red-600" onClick={() => setQs(qs.filter((_, k) => k !== i))} aria-label="Delete question"><Trash2 size={15} /></Button></div>
          {q.options.map((o, k) => (
            <label key={k} className="flex items-center gap-2"><input type="radio" className="accent-[#ff7a1a]" name={`c${i}`} checked={q.correctIndex === k} onChange={() => set(i, { correctIndex: k })} title="Correct answer" />
              <Input placeholder={`Option ${k + 1}`} value={o} onChange={(e) => set(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} /></label>
          ))}
          <p className="text-xs text-slate-500">Select the radio button next to the correct answer.</p>
        </div>
      ))}
      <Button variant="dark" disabled={busy || qs.length === 0} onClick={() => run(() => api(`/api/admin/courses/${courseId}/quiz`, { method: "PUT", body: { title: t, questions: qs } }), () => { setSaved(true); setTimeout(() => setSaved(false), 2000); })}>{busy ? <Spinner /> : "Save assessment"}</Button>
    </Card>
  );
}
export { Select };
