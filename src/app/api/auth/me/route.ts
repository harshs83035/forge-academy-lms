import { guarded } from "@/lib/api";

// Polled by <SessionWatcher/>: a 401 with reason=REPLACED is how an older tab learns it was signed out.
export const GET = guarded(null, async ({ info }) => ({ id: info.user.id, name: info.user.name, role: info.user.role }));
