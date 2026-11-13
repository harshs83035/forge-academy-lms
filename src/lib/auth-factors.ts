/**
 * Version-2 hook: pluggable authentication factors.
 *
 * The playback flow already calls `runFactors("pre-playback")` before a stream starts and
 * `runFactors("during-playback")` periodically. In the prototype the only registered factor is a
 * stub that always passes. To ship facial recognition, implement `AuthFactor` (camera capture on the
 * client -> embedding/liveness check against a face service) and register it below. Nothing else in
 * the playback pipeline needs to change.
 */
export type FactorStage = "login" | "pre-playback" | "during-playback";
export type FactorContext = { userId: string; sessionId: string; videoId?: string; payload?: unknown };
export type FactorResult = { verified: boolean; stub?: boolean; detail?: string };

export interface AuthFactor {
  id: string;
  name: string;
  stages: FactorStage[];
  verify(ctx: FactorContext): Promise<FactorResult>;
}

export const FaceVerificationFactor: AuthFactor = {
  id: "face",
  name: "Face Verification",
  stages: ["pre-playback", "during-playback"],
  async verify() {
    // TODO(v2): compare live camera frame to the enrolled template + liveness check.
    return { verified: true, stub: true, detail: "Simulated - facial recognition is planned for Version 2" };
  },
};

export const registeredFactors: AuthFactor[] = [FaceVerificationFactor];

export async function runFactors(stage: FactorStage, ctx: FactorContext) {
  const results = [];
  for (const f of registeredFactors.filter((f) => f.stages.includes(stage))) results.push({ id: f.id, name: f.name, ...(await f.verify(ctx)) });
  return { verified: results.every((r) => r.verified), results };
}
