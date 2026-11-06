import { NextResponse } from "next/server";

interface WindowState { startedAt: number; count: number }
const requestWindows = new Map<string, WindowState>();

export function checkRateLimit(request: Request, bucket: string, limit = 30, windowMs = 60_000): boolean {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${bucket}:${forwarded || "local"}`;
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  if (requestWindows.size > 4000) {
    for (const [itemKey, state] of requestWindows) {
      if (now - state.startedAt >= windowMs) requestWindows.delete(itemKey);
    }
  }
  return current.count <= limit;
}

export function tooManyRequests() {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." } },
    { status: 429, headers: { "Retry-After": "30" } },
  );
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function validLanguage(value: unknown): value is "en" | "ta" {
  return value === "en" || value === "ta";
}
