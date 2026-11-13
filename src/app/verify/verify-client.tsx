"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, ShieldX } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

type R = { valid: boolean; certId?: string; name?: string; course?: string; issuedAt?: string; score?: number | null };

export function VerifyClient({ initialId = "" }: { initialId?: string }) {
  const [id, setId] = useState(initialId), [busy, setBusy] = useState(false), [res, setRes] = useState<R | null>(null), [err, setErr] = useState("");
  async function check(v = id) {
    if (!v.trim()) return;
    setBusy(true); setErr(""); setRes(null);
    const r = await fetch(`/api/verify?id=${encodeURIComponent(v)}`);
    if (r.status === 429) setErr("Too many attempts — please wait a minute."); else setRes(await r.json());
    setBusy(false);
  }
  useEffect(() => { if (initialId) check(initialId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-extrabold">Verify a certificate</h1><p className="mt-1 text-slate-500">Enter the certificate ID printed on the certificate (e.g. FA-2026-XXXXXXXX).</p></div>
      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="flex gap-2">
        <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="FA-2026-XXXXXXXX" className="font-mono uppercase" />
        <Button disabled={busy}>{busy ? <Spinner /> : "Verify"}</Button>
      </form>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res?.valid && (
        <Card className="border-emerald-300 bg-emerald-50 p-6">
          <div className="flex items-center gap-3 text-emerald-700"><BadgeCheck size={34} /><div><p className="text-lg font-extrabold">Valid certificate</p><p className="font-mono text-sm">{res.certId}</p></div></div>
          <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm"><dt className="text-slate-500">Awarded to</dt><dd className="font-semibold">{res.name}</dd><dt className="text-slate-500">Module</dt><dd className="font-semibold">{res.course}</dd><dt className="text-slate-500">Issued</dt><dd className="font-semibold">{fmtDate(res.issuedAt)}</dd>{res.score != null && <><dt className="text-slate-500">Score</dt><dd className="font-semibold">{res.score}%</dd></>}</dl>
        </Card>
      )}
      {res && !res.valid && <Card className="flex items-center gap-3 border-red-200 bg-red-50 p-6 text-red-700"><ShieldX size={34} /><div><p className="text-lg font-extrabold">Invalid certificate</p><p className="text-sm">No certificate with this ID exists in our records.</p></div></Card>}
    </div>
  );
}
