import { NextResponse } from "next/server";
import { apiError, checkRateLimit, tooManyRequests, validLanguage } from "@/lib/http";
import { getTransportDataProvider } from "@/lib/provider";
import { localizeSearchOutput } from "@/lib/gemini";
import { answerTransport } from "@/lib/assistant";
import type { SearchInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!checkRateLimit(request, "voice-search", 45)) return tooManyRequests();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Send a valid JSON request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "INVALID_BODY", "Request body must be an object.");
  }

  const value = body as Record<string, unknown>;
  const messages = Array.isArray(value.messages) ? value.messages : [];
  const lastUserMessage = [...messages].reverse().find((item) =>
    item && typeof item === "object" && (item as Record<string, unknown>).role === "user"
  ) as Record<string, unknown> | undefined;
  if (typeof lastUserMessage?.content !== "string" || lastUserMessage.content.length > 500) {
    return apiError(400, "INVALID_QUERY", "Include a user question of at most 500 characters.");
  }
  const language = value.language === undefined ? "en" : value.language;
  if (!validLanguage(language)) return apiError(400, "INVALID_LANGUAGE", "Language must be en or ta.");

  let previousJourneyContext: SearchInput["previousJourneyContext"];
  if (value.previousJourneyContext !== undefined && value.previousJourneyContext !== null) {
    const context = value.previousJourneyContext;
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      return apiError(400, "INVALID_CONTEXT", "Previous journey context must include place IDs.");
    }
    const record = context as Record<string, unknown>;
    if (typeof record.originId !== "string" || typeof record.destinationId !== "string") {
      return apiError(400, "INVALID_CONTEXT", "Previous journey context must include valid place IDs.");
    }
    previousJourneyContext = { originId: record.originId, destinationId: record.destinationId };
  }

  const provider = getTransportDataProvider();
  let searchInput: SearchInput = {
    query: lastUserMessage.content,
    language,
    ...(previousJourneyContext ? { previousJourneyContext } : {}),
  };
  let rawResult = answerTransport(searchInput, provider);

  // In spoken mode, auto-resolve unambiguous single-option phonetic/fuzzy matches
  // so minor speech-to-text spelling variations never block the spoken answer.
  for (let pass = 0; pass < 2; pass += 1) {
    if (
      rawResult.status === "clarification" &&
      rawResult.clarificationOptions.length === 1 &&
      (rawResult.clarificationField === "origin" || rawResult.clarificationField === "destination")
    ) {
      const resolvedId = rawResult.clarificationOptions[0].id;
      searchInput = {
        ...searchInput,
        ...(rawResult.clarificationField === "origin" ? { originId: resolvedId } : { destinationId: resolvedId }),
      };
      rawResult = answerTransport(searchInput, provider);
    } else {
      break;
    }
  }

  const result = await localizeSearchOutput(rawResult, language);

  return NextResponse.json({
    reply: result.speechText || result.answer,
    actions: [],
    pending: null,
    engine: "local-search",
    searchOutput: result,
  });
}
