import { Award, Download } from "lucide-react";
import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLang, tr } from "@/lib/i18n";
import { fmtDate } from "@/lib/utils";
import { Card, EmptyState } from "@/components/ui";

export const metadata = { title: "Certificates" };

export default async function Certificates() {
  const { user } = await requirePage(["LEARNER"]);
  const t = tr(await getLang());
  const certs = await db.certificate.findMany({ where: { userId: user.id }, include: { course: true }, orderBy: { issuedAt: "desc" } });
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between"><h1 className="text-3xl font-extrabold">{t("certificates")}</h1><a href="/verify" className="text-sm font-semibold text-brand-600 hover:underline">{t("verify")}</a></div>
      {certs.length === 0 ? <EmptyState icon={<Award size={36} />} title="No certificates yet" hint="Complete every video in a module and pass its assessment to earn your certificate." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {certs.map((c) => (
            <Card key={c.id} className="flex items-center gap-4 p-5">
              <div className="rounded-xl bg-brand-50 p-3"><Award className="text-brand" size={28} /></div>
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{c.course.title}</p><p className="text-sm text-slate-500">{fmtDate(c.issuedAt)} · <span className="font-mono">{c.certId}</span>{c.score != null && ` · ${c.score}%`}</p></div>
              <a href={`/api/certificates/${c.certId}/pdf`} className="rounded-lg bg-navy-900 p-2.5 text-white hover:bg-navy-800" aria-label="Download certificate"><Download size={16} /></a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
