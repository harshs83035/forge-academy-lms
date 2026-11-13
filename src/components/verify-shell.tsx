import { Logo } from "@/components/logo";

export function VerifyShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="bg-navy-900 py-4"><div className="mx-auto flex max-w-3xl items-center justify-between px-4"><Logo /><a href="/login" className="text-sm font-semibold text-white/80 hover:text-white">Sign in</a></div></header>
      <div className="mx-auto max-w-xl px-4 py-12">{children}</div>
    </main>
  );
}
