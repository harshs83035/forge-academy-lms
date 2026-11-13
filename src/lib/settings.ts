import { db } from "./db";

export type AppSettings = {
  sessionMode: "replace" | "block"; // second login replaces the first, or is refused
  deviceLimit: number; // max registered devices per learner
  pauseOnBlur: boolean; // pause playback when the tab loses focus
  faceVerification: boolean; // V2 hook: stubbed identity check around playback
};

export const DEFAULT_SETTINGS: AppSettings = { sessionMode: "replace", deviceLimit: 2, pauseOnBlur: false, faceVerification: false };

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s as AppSettings;
}

export async function saveSettings(patch: Partial<AppSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    await db.setting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
  }
}
