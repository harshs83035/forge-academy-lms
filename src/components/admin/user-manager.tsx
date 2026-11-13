"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, MonitorSmartphone, Plus, Power, Search, Users } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner } from "@/components/ui";
import { api, ApiFail } from "@/lib/client";
import { fmtDateTime } from "@/lib/utils";
import type { UserRow } from "./load-users";

type Course = { id: string; title: string };

export function UserManager({ mode, users, courses, viewerRole }: { mode: "LEARNER" | "ADMIN"; users: UserRow[]; courses: Course[]; viewerRole: string }) {
  const router = useRouter();
  const [q, setQ] = useState(""), [creating, setCreating] = useState(false), [sel, setSel] = useState<UserRow | null>(null);
  const label = mode === "ADMIN" ? "Admin" : "Learner";
  const list = users.filter((u) => (u.name + u.email + u.code).toLowerCase().includes(q.toLowerCase()));
  const done = () => { setCreating(false); setSel(null); router.refresh(); };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-extrabold">{mode === "ADMIN" ? "Admins" : "Learners"}</h1><p className="text-slate-500">{mode === "ADMIN" ? "Super Admin only — create and manage administrator accounts." : "Create learners, assign modules, reset passwords and devices."}</p></div>
        <Button onClick={() => setCreating(true)}><Plus size={16} /> Add {label.toLowerCase()}</Button>
      </div>
      <div className="relative max-w-sm"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" placeholder="Search name, email, ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.length === 0 ? <EmptyState icon={<Users size={34} />} title={`No ${label.toLowerCase()}s found`} hint="Try a different search, or add a new account." /> : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-navy-100 bg-navy-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">ID</th><th className="px-4 py-3">Name</th>{mode === "LEARNER" && <th className="px-4 py-3">Modules</th>}<th className="px-4 py-3">Devices</th><th className="px-4 py-3">Status</th><th /></tr></thead>
            <tbody className="divide-y divide-navy-100">
              {list.map((u) => (
                <tr key={u.id} className="hover:bg-navy-50/60">
                  <td className="px-4 py-3 font-mono text-xs">{u.code}</td>
                  <td className="px-4 py-3"><p className="font-semibold">{u.name}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                  {mode === "LEARNER" && <td className="px-4 py-3">{u.courseIds.length}</td>}
                  <td className="px-4 py-3">{u.devices.length}{u.maxDevices ? ` / ${u.maxDevices}` : ""}</td>
                  <td className="px-4 py-3"><div className="flex gap-1.5">{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}{u.online && <Badge tone="orange">Online</Badge>}</div></td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => setSel(u)}>Manage</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <CreateModal open={creating} onClose={() => setCreating(false)} mode={mode} courses={courses} onDone={done} />
      {sel && <ManageModal key={sel.id} user={sel} courses={courses} onClose={() => setSel(null)} onDone={done} canAssign={mode === "LEARNER"} viewerRole={viewerRole} />}
    </div>
  );
}

function CreateModal({ open, onClose, mode, courses, onDone }: { open: boolean; onClose: () => void; mode: "LEARNER" | "ADMIN"; courses: Course[]; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "" }), [ids, setIds] = useState<string[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api("/api/admin/users", { body: { ...f, role: mode, courseIds: ids } }); setF({ name: "", email: "", password: "" }); setIds([]); onDone(); }
    catch (x) { setErr(x instanceof ApiFail ? x.message : "Failed"); }
    setBusy(false);
  }
  return (
    <Modal open={open} onClose={onClose} title={`Add ${mode === "ADMIN" ? "admin" : "learner"}`}>
      <form onSubmit={save} className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <Field label="Full name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><Input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Share it securely."><Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {mode === "LEARNER" && <CoursePick courses={courses} ids={ids} setIds={setIds} />}
        <Button className="w-full" disabled={busy}>{busy ? <Spinner /> : "Create account"}</Button>
      </form>
    </Modal>
  );
}

function CoursePick({ courses, ids, setIds }: { courses: Course[]; ids: string[]; setIds: (v: string[]) => void }) {
  return (
    <fieldset className="space-y-2"><legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned modules</legend>
      {courses.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#ff7a1a]" checked={ids.includes(c.id)} onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} /> {c.title}</label>)}
      {courses.length === 0 && <p className="text-sm text-slate-500">No modules exist yet.</p>}
    </fieldset>
  );
}

function ManageModal({ user, courses, onClose, onDone, canAssign }: { user: UserRow; courses: Course[]; onClose: () => void; onDone: () => void; canAssign: boolean; viewerRole: string }) {
  const [name, setName] = useState(user.name), [email, setEmail] = useState(user.email), [maxDev, setMaxDev] = useState(user.maxDevices?.toString() ?? "");
  const [pw, setPw] = useState(""), [ids, setIds] = useState(user.courseIds), [busy, setBusy] = useState<string | null>(null), [msg, setMsg] = useState<{ t: "red" | "green"; m: string } | null>(null);
  async function run(key: string, body: Record<string, unknown>, ok: string, close = false) {
    setBusy(key); setMsg(null);
    try { await api(`/api/admin/users/${user.id}`, { method: "PATCH", body }); setMsg({ t: "green", m: ok }); if (close) onDone(); else setTimeout(onDone, 700); }
    catch (x) { setMsg({ t: "red", m: x instanceof ApiFail ? x.message : "Failed" }); }
    setBusy(null);
  }
  return (
    <Modal open onClose={onClose} title={`${user.name} · ${user.code}`} wide>
      <div className="space-y-6">
        {msg && <Alert tone={msg.t}>{msg.m}</Alert>}
        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {user.role === "LEARNER" && <Field label="Device limit" hint="Blank = global default"><Input type="number" min={1} value={maxDev} onChange={(e) => setMaxDev(e.target.value)} /></Field>}
          <div className="sm:col-span-3"><Button variant="dark" disabled={!!busy} onClick={() => run("update", { action: "update", name, email, maxDevices: maxDev ? +maxDev : null }, "Details saved")}>{busy === "update" ? <Spinner /> : "Save details"}</Button></div>
        </section>
        {canAssign && (
          <section className="space-y-3 border-t border-navy-100 pt-5"><CoursePick courses={courses} ids={ids} setIds={setIds} />
            <Button variant="dark" disabled={!!busy} onClick={() => run("courses", { action: "set_courses", courseIds: ids }, "Modules updated")}>{busy === "courses" ? <Spinner /> : "Save assignments"}</Button></section>
        )}
        <section className="space-y-3 border-t border-navy-100 pt-5">
          <h3 className="flex items-center gap-2 font-bold"><KeyRound size={16} className="text-brand" /> Reset password</h3>
          <div className="flex gap-2"><Input placeholder="New password (min 8 chars)" value={pw} onChange={(e) => setPw(e.target.value)} /><Button variant="secondary" disabled={pw.length < 8 || !!busy} onClick={() => run("pw", { action: "reset_password", password: pw }, "Password reset — user was signed out")}>Reset</Button></div>
        </section>
        {user.role === "LEARNER" && (
          <section className="space-y-3 border-t border-navy-100 pt-5">
            <h3 className="flex items-center gap-2 font-bold"><MonitorSmartphone size={16} className="text-brand" /> Registered devices ({user.devices.length}{user.maxDevices ? `/${user.maxDevices}` : ""})</h3>
            {user.devices.length === 0 ? <p className="text-sm text-slate-500">No devices registered yet.</p> : <ul className="space-y-1 text-sm">{user.devices.map((d) => <li key={d.id} className="flex justify-between rounded-md bg-navy-50 px-3 py-2"><span>{d.label}</span><span className="text-slate-500">last seen {fmtDateTime(d.lastSeenAt)}</span></li>)}</ul>}
            <Button variant="secondary" disabled={!!busy || user.devices.length === 0} onClick={() => run("dev", { action: "reset_devices" }, "Devices reset")}>Reset all devices</Button>
          </section>
        )}
        <section className="flex flex-wrap gap-3 border-t border-navy-100 pt-5">
          <Button variant="secondary" disabled={!!busy} onClick={() => run("lo", { action: "force_logout" }, "User signed out")}><LogOut size={15} /> Force sign-out</Button>
          <Button variant={user.active ? "danger" : "primary"} disabled={!!busy} onClick={() => run("act", { action: "set_active", active: !user.active }, user.active ? "Account deactivated" : "Account reactivated", true)}><Power size={15} /> {user.active ? "Deactivate account" : "Reactivate account"}</Button>
        </section>
      </div>
    </Modal>
  );
}
