import { NextResponse } from "next/server";
import { checkRateLimit, apiError, tooManyRequests, validLanguage } from "@/lib/http";
import { getTransportDataProvider } from "@/lib/provider";
import { localizeSearchOutput } from "@/lib/gemini";
import { answerTransport } from "@/lib/assistant";
import type { SearchInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkRateLimit(request, "search", 45)) return tooManyRequests();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Send a valid JSON request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return apiError(400, "INVALID_BODY", "Request body must be an object.");
  const value = body as Record<string, unknown>;
  if (typeof value.query !== "string" || value.query.length > 500) return apiError(400, "INVALID_QUERY", "Query must be text of at most 500 characters.");
  if (!validLanguage(value.language)) return apiError(400, "INVALID_LANGUAGE", "Language must be en or ta.");
  for (const idField of ["originId", "destinationId"] as const) {
    if (value[idField] !== undefined && (typeof value[idField] !== "string" || value[idField].length > 64)) {
      return apiError(400, "INVALID_PLACE", `${idField} must be a place ID string.`);
    }
  }
  let previousJourneyContext: SearchInput["previousJourneyContext"];
  if (value.previousJourneyContext !== undefined) {
    const context = value.previousJourneyContext;
    if (!context || typeof context !== "object" || Array.isArray(context)) return apiError(400, "INVALID_CONTEXT", "Previous journey context must include place IDs.");
    const record = context as Record<string, unknown>;
    if (typeof record.originId !== "string" || typeof record.destinationId !== "string" || record.originId.length > 64 || record.destinationId.length > 64) {
      return apiError(400, "INVALID_CONTEXT", "Previous journey context must include valid originId and destinationId strings.");
    }
    previousJourneyContext = { originId: record.originId, destinationId: record.destinationId };
  }

  const input: SearchInput = {
    query: value.query,
    language: value.language,
    ...(typeof value.originId === "string" ? { originId: value.originId } : {}),
    ...(typeof value.destinationId === "string" ? { destinationId: value.destinationId } : {}),
    ...(previousJourneyContext ? { previousJourneyContext } : {}),
  };
  const result = await localizeSearchOutput(
    answerTransport(input, getTransportDataProvider()),
    input.language,
  );
  return NextResponse.json(result);
}
