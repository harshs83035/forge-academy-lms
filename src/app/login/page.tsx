import { redirect } from "next/navigation";
import { getAuth, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";
import { ShieldCheck, Languages, BadgeCheck } from "lucide-react";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const a = await getAuth();
  if (a.ok) redirect(homeFor(a.info.user.role));
  const { reason } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="gear-bg relative hidden flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <Logo />
        <div className="max-w-md space-y-6">
          <h1 className="text-4xl font-extrabold leading-tight">Master the machine.<br /><span className="text-brand">Protect the knowledge.</span></h1>
          <p className="text-white/70">Proprietary machinery training, streamed securely in English and Hindi — with progress tracking, assessments and verifiable certificates.</p>
          <ul className="space-y-3 text-sm text-white/80">
            <li className="flex items-center gap-3"><ShieldCheck className="text-brand" size={18} /> Encrypted streaming with per-learner watermarking</li>
            <li className="flex items-center gap-3"><Languages className="text-brand" size={18} /> Switch audio language instantly, mid-video</li>
            <li className="flex items-center gap-3"><BadgeCheck className="text-brand" size={18} /> Certificates with public verification</li>
          </ul>
        </div>
        <p className="text-xs text-white/40">Prototype build · demo data only</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo light={false} /></div>
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">Use the credentials issued by your administrator.</p>
          <LoginForm reason={reason} />
        </div>
      </section>
    </main>
  );
}
