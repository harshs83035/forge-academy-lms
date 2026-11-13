"use client";
export class ApiFail extends Error { constructor(public status: number, message: string, public data: Record<string, unknown> = {}) { super(message); } }

export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.form ?? (init?.body ? JSON.stringify(init.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFail(res.status, data.error ?? "Request failed", data);
  return data as T;
}

export function deviceId() {
  try {
    let id = localStorage.getItem("lms_device_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("lms_device_id", id); }
    return id;
  } catch { return "fallback-" + navigator.userAgent.length + "-" + screen.width; }
}
