import { z } from "zod";
import { body, guarded } from "@/lib/api";
import { audit } from "@/lib/security";
import { saveSettings } from "@/lib/settings";

const schema = z.object({
  sessionMode: z.enum(["replace", "block"]), deviceLimit: z.number().int().min(1).max(20),
  pauseOnBlur: z.boolean(), faceVerification: z.boolean(),
});
export const PUT = guarded(["SUPER_ADMIN"], async ({ req, info }) => {
  const b = await body(req, schema);
  await saveSettings(b);
  await audit("SETTINGS_CHANGED", { userId: info.user.id, meta: b });
});
