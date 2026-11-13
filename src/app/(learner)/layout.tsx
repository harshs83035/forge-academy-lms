import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getLang, tr } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { LangToggle, LogoutButton, SessionWatcher } from "@/components/shell";

export default async function LearnerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePage(["LEARNER"]);
  const lang = await getLang();
  const t = tr(lang);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-navy-900 shadow-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/courses"><Logo /></Link>
          <nav className="flex gap-1 text-sm font-semibold text-white/80">
            <Link href="/courses" className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white">{t("myCourses")}</Link>
            <Link href="/certificates" className="rounded-md px-3 py-1.5 hover:bg-white/10 hover:text-white">{t("certificates")}</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LangToggle lang={lang} />
            <span className="hidden text-right text-xs leading-tight text-white/70 sm:block"><b className="block text-sm text-white">{user.name}</b>{user.code}</span>
            <LogoutButton label={t("signOut")} />
          </div>
        </div>
      </header>
      <SessionWatcher />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
