import { NextResponse } from "next/server";
import { apiError, checkRateLimit, tooManyRequests, validLanguage } from "@/lib/http";
import { fetchWithSarvamKey, hasSarvamApiKey } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TEXT_LENGTH = 600;
const ERROR_BODY = { error: { code: "SPEECH_UNAVAILABLE", message: "Spoken playback is unavailable right now. The text answer is still available." } };

export async function POST(request: Request) {
  if (!checkRateLimit(request, "speak", 15)) return tooManyRequests();
  if (!hasSarvamApiKey()) return apiError(503, "TTS_NOT_CONFIGURED", "Spoken playback is not configured. The text answer is still available.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Send a valid JSON request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return apiError(400, "INVALID_BODY", "Request body must be an object.");
  const value = body as Record<string, unknown>;
  if (typeof value.text !== "string" || !value.text.trim() || value.text.length > MAX_TEXT_LENGTH) {
    return apiError(400, "INVALID_TEXT", `Spoken answer must be between 1 and ${MAX_TEXT_LENGTH} characters.`);
  }
  if (!validLanguage(value.language)) return apiError(400, "INVALID_LANGUAGE", "Language must be en or ta.");

  const speechText = value.text.trim();
  let response: Response;
  try {
    response = await fetchWithSarvamKey((apiKey) => fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: speechText,
        model: process.env.SARVAM_TTS_MODEL?.trim() || "bulbul:v3",
        language_code: value.language === "ta" ? "ta-IN" : "en-IN",
        speaker: "priya",
        output_audio_codec: "wav",
        speech_sample_rate: 22050,
      }),
      signal: AbortSignal.timeout(22_000),
      cache: "no-store",
    }));
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return apiError(timedOut ? 504 : 502, timedOut ? "TTS_TIMEOUT" : "TTS_NETWORK_ERROR", ERROR_BODY.error.message);
  }
  if (response.status === 429) return apiError(429, "TTS_RATE_LIMITED", "Spoken playback is temporarily rate limited. The text answer is still available.");
  if (!response.ok) return apiError(response.status >= 500 ? 502 : 422, "TTS_PROVIDER_ERROR", ERROR_BODY.error.message);

  let result: { audios?: unknown[] };
  try {
    result = await response.json();
  } catch {
    return apiError(502, "TTS_INVALID_RESPONSE", ERROR_BODY.error.message);
  }
  const encoded = result.audios?.[0];
  if (typeof encoded !== "string" || encoded.length > 8_000_000) return apiError(502, "TTS_INVALID_AUDIO", ERROR_BODY.error.message);
  const audio = Buffer.from(encoded, "base64");
  if (!audio.length || audio.length > 6_000_000) return apiError(502, "TTS_INVALID_AUDIO", ERROR_BODY.error.message);
  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
      "Content-Length": String(audio.byteLength),
    },
  });
}
