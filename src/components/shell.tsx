"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Languages } from "lucide-react";
import { Button } from "@/components/ui";

export function LogoutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>
      <LogOut size={15} /> {label}
    </Button>
  );
}

export function LangToggle({ lang }: { lang: "en" | "hi" }) {
  const router = useRouter();
  return (
    <button className="flex items-center gap-1.5 rounded-md border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
      onClick={async () => { await fetch("/api/lang", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: lang === "en" ? "hi" : "en" }) }); router.refresh(); }}>
      <Languages size={14} /> {lang === "en" ? "हिन्दी" : "English"}
    </button>
  );
}

/** Polls the session. When the account signs in elsewhere (single-session rule) this tab is bounced to /login with a reason. */
export function SessionWatcher() {
  const router = useRouter();
  const [gone, setGone] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const r = await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
      if (!r || r.ok || stop) return;
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { setGone(d.reason ?? "expired"); setTimeout(() => router.push(`/login?reason=${d.reason ?? "expired"}`), 1800); }
    };
    const t = setInterval(check, 10_000);
    const v = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", v);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [router]);
  if (!gone) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950/80 p-6 backdrop-blur">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <h2 className="text-xl font-bold">You were signed out</h2>
        <p className="mt-2 text-slate-600">{gone === "REPLACED" ? "This account was signed in on another device or browser. Only one active session is allowed." : "Your session has ended."}</p>
        <p className="mt-4 text-sm text-slate-400">Redirecting to sign in…</p>
      </div>
    </div>
  );
}
