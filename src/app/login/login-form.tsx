"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { api, ApiFail, deviceId } from "@/lib/client";

const REASONS: Record<string, string> = {
  REPLACED: "You were signed out because this account was signed in on another device or browser.",
  ADMIN: "An administrator ended your session. Please sign in again.",
  DEACTIVATED: "This account has been deactivated.",
  LOGOUT: "You have been signed out.",
  expired: "Your session expired. Please sign in again.",
};
const DEMOS = [
  ["Super Admin", "super@forge.demo", "Super@123"], ["Admin", "admin@forge.demo", "Admin@123"],
  ["Learner", "learner@forge.demo", "Learner@123"], ["Learner (quiz-ready)", "ready@forge.demo", "Learner@123"],
] as const;

export function LoginForm({ reason }: { reason?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const r = await api<{ redirect: string }>("/api/auth/login", { body: { email, password, deviceId: deviceId() } });
      router.push(r.redirect); router.refresh();
    } catch (err) { setError(err instanceof ApiFail ? err.message : "Could not reach the server"); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {reason && REASONS[reason] && !error && <Alert tone="orange">{REASONS[reason]}</Alert>}
      {error && <Alert>{error}</Alert>}
      <Field label="Email"><Input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
      <Field label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? <Spinner /> : "Sign in"}</Button>
      <div className="rounded-xl border border-dashed border-navy-100 bg-white p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Demo accounts (click to fill)</p>
        <div className="flex flex-wrap gap-2">
          {DEMOS.map(([label, e, p]) => (
            <button key={e} type="button" onClick={() => { setEmail(e); setPassword(p); }} className="rounded-md border border-navy-100 bg-navy-50 px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-brand-600">{label}</button>
          ))}
        </div>
      </div>
      <p className="text-center text-sm text-slate-500"><a className="underline hover:text-brand-600" href="/verify">Verify a certificate</a></p>
    </form>
  );
}
