"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { api, ApiFail } from "@/lib/client";
import type { AppSettings } from "@/lib/settings";

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    try { await api("/api/admin/settings", { method: "PUT", body: s }); setMsg({ ok: true, t: "Settings saved — they apply to the next login / playback." }); router.refresh(); }
    catch (e) { setMsg({ ok: false, t: e instanceof ApiFail ? e.message : "Failed" }); }
    setBusy(false);
  }
  return (
    <Card className="max-w-2xl space-y-6 p-6">
      {msg && <Alert tone={msg.ok ? "green" : "red"}>{msg.t}</Alert>}
      <Field label="Concurrent session policy" hint="Replace: a new login signs the old session out (recommended). Block: a second login is refused while one is active.">
        <Select value={s.sessionMode} onChange={(e) => setS({ ...s, sessionMode: e.target.value as AppSettings["sessionMode"] })}><option value="replace">Replace — new login signs out the old one</option><option value="block">Block — refuse the second login</option></Select></Field>
      <Field label="Registered devices per learner" hint="Admins can reset a learner's devices (and override this per learner)."><Input type="number" min={1} max={20} value={s.deviceLimit} onChange={(e) => setS({ ...s, deviceLimit: +e.target.value })} /></Field>
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-[#ff7a1a]" checked={s.pauseOnBlur} onChange={(e) => setS({ ...s, pauseOnBlur: e.target.checked })} /><span><b className="block text-sm">Pause playback when the window loses focus</b><span className="text-sm text-slate-500">Makes screen-sharing / alt-tabbing pause the video. Off by default.</span></span></label>
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 accent-[#ff7a1a]" checked={s.faceVerification} onChange={(e) => setS({ ...s, faceVerification: e.target.checked })} /><span><b className="block text-sm">Face verification step before playback <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-600">V2 stub</span></b><span className="text-sm text-slate-500">Runs the AuthFactor pipeline with a simulated check. Real facial recognition is Version 2.</span></span></label>
      <Button variant="dark" onClick={save} disabled={busy}>{busy ? <Spinner /> : "Save settings"}</Button>
    </Card>
  );
}
