import { requirePage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata = { title: "Security settings" };
export default async function SettingsPage() {
  await requirePage(["SUPER_ADMIN"]);
  return (<div className="space-y-6"><div><h1 className="text-3xl font-extrabold">Security settings</h1><p className="text-slate-500">Super Admin only. Controls session, device and playback protections.</p></div><SettingsForm initial={await getSettings()} /></div>);
}
