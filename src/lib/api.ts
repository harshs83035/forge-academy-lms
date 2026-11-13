import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { cookies } from "next/headers";
import { COOKIE, resolveSession, type SessionInfo } from "./auth";
import type { Role } from "@/generated/prisma/client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

type Ctx<P> = { req: Request; info: SessionInfo; params: P };

/** Wraps a route handler: authenticates, enforces RBAC server-side, maps errors to JSON. */
export function guarded<P = Record<string, string>>(roles: Role[] | null, fn: (c: Ctx<P>) => Promise<unknown>) {
  return async (req: Request, ctx?: { params: Promise<P> }) => {
    try {
      const a = await resolveSession((await cookies()).get(COOKIE)?.value);
      if (!a.ok) throw new ApiError(401, "Not authenticated", { reason: a.reason });
      if (roles && !roles.includes(a.info.user.role)) throw new ApiError(403, "You do not have permission to do that");
      const params = (ctx ? await ctx.params : {}) as P;
      const out = await fn({ req, info: a.info, params });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) { return errorResponse(e); }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function body<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}

export const ADMINS: Role[] = ["SUPER_ADMIN", "ADMIN"];
