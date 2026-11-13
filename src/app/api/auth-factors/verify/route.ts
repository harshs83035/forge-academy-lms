import { z } from "zod";
import { body, guarded } from "@/lib/api";
import { runFactors } from "@/lib/auth-factors";

// Called by the player's "Face Verification" step (stub in the prototype).
export const POST = guarded(["LEARNER"], async ({ req, info }) => {
  const { stage } = await body(req, z.object({ stage: z.enum(["pre-playback", "during-playback"]) }));
  return runFactors(stage, { userId: info.user.id, sessionId: info.session.id });
});
