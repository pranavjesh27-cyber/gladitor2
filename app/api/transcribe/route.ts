import { NextResponse } from "next/server";
import { apiError, checkRateLimit, tooManyRequests, validLanguage } from "@/lib/http";
import { fetchWithSarvamKey, hasSarvamApiKey } from "@/lib/sarvam";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac",
]);
const CHENNAI_HINTS_EN =
  "Chennai transit route query. Places: Perungudi, Guindy, Tambaram, Velachery, Chennai Central, Egmore, Tirusulam, Airport Metro, Chennai Airport, Alandur, Koyambedu CMBT, T. Nagar, Saidapet. Modes: Bus, Metro, Suburban Train.";
const CHENNAI_HINTS_TA =
  "சென்னை போக்குவரத்து வழித் தேடல்: பெருங்குடி, கிண்டி, தாம்பரம், வேளச்சேரி, சென்னை சென்ட்ரல், எழும்பூர், திரிசூலம், விமான நிலைய மெட்ரோ, சென்னை விமான நிலையம், ஆலந்தூர், கோயம்பேடு, தி. நகர், சைதாப்பேட்டை. பேருந்து, பஸ், மெட்ரோ, புறநகர் ரயில் இருக்கா.";

function getHuggingFaceWhisperKey(): string {
  return (
    process.env.WHISPER_API_KEY?.trim() ||
    process.env.whisper_api_key?.trim() ||
    process.env.HF_API_KEY?.trim() ||
    process.env.HUGGINGFACE_API_KEY?.trim() ||
    ""
  );
}

async function transcribeWithHuggingFace(
  audioBytes: ArrayBuffer,
  mime: string,
  apiKey: string,
  language: "en" | "ta",
): Promise<Response> {
  const configuredModel = process.env.WHISPER_TAMIL_MODEL?.trim();
  const candidateEndpoints = Array.from(
    new Set([
      ...(language === "ta" && configuredModel
        ? [`https://router.huggingface.co/hf-inference/models/${configuredModel}`]
        : []),
      "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3-turbo",
      "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3",
    ]),
  );

  let lastResponse: Response | null = null;
  for (const endpoint of candidateEndpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": mime,
          "x-wait-for-model": "true",
        },
        body: audioBytes,
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      lastResponse = res;
      if (res.ok || res.status === 401 || res.status === 402 || res.status === 403 || res.status === 429) {
        return res;
      }
    } catch {
      // Try next candidate endpoint
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error("Hugging Face Whisper request failed");
}

export async function POST(request: Request) {
  if (!checkRateLimit(request, "transcribe", 12)) return tooManyRequests();
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_AUDIO_BYTES + 64_000) return apiError(413, "AUDIO_TOO_LARGE", "Recording is over the 8 MB upload limit. Try a shorter recording.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "INVALID_AUDIO_FORM", "Send an audio file using multipart/form-data.");
  }
  const audio = form.get("audio");
  const language = form.get("language");
  if (!(audio instanceof File)) return apiError(400, "AUDIO_REQUIRED", "Choose a recording to transcribe.");
  if (!validLanguage(language)) return apiError(400, "INVALID_LANGUAGE", "Language must be en or ta.");
  const hfWhisperKey = getHuggingFaceWhisperKey();
  const useHfWhisper = Boolean(hfWhisperKey) && (language === "ta" || !process.env.GROQ_API_KEY?.trim());
  const useSarvam = !useHfWhisper && language === "ta" && hasSarvamApiKey();
  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  if (!useHfWhisper && !useSarvam && !hasGroq) {
    return apiError(503, "STT_NOT_CONFIGURED", "Voice transcription is not configured. Add WHISPER_API_KEY or GROQ_API_KEY to .env.local.");
  }
  if (!audio.size) return apiError(400, "EMPTY_AUDIO", "The recording is empty. Please try again.");
  if (audio.size > MAX_AUDIO_BYTES) return apiError(413, "AUDIO_TOO_LARGE", "Recording is over the 8 MB upload limit. Try a shorter recording.");
  const mime = audio.type.toLowerCase().split(";")[0];
  if (!ACCEPTED_AUDIO_TYPES.has(mime)) return apiError(415, "UNSUPPORTED_AUDIO", "This browser's recording format is not supported. Please type your question instead.");

  let response: Response;
  let usedProvider: "hf" | "sarvam" | "groq" = useHfWhisper ? "hf" : useSarvam ? "sarvam" : "groq";
  try {
    const filename = audio.name || (mime === "audio/mp4" ? "recording.m4a" : "recording.webm");
    if (useHfWhisper) {
      const audioBytes = await audio.arrayBuffer();
      response = await transcribeWithHuggingFace(audioBytes, mime, hfWhisperKey, language);
      if (!response.ok && hasGroq) {
        usedProvider = "groq";
        const outgoing = new FormData();
        outgoing.set("file", audio, filename);
        outgoing.set("model", process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3");
        outgoing.set("language", language === "ta" ? "ta" : "en");
        outgoing.set("prompt", language === "ta" ? CHENNAI_HINTS_TA : CHENNAI_HINTS_EN);
        outgoing.set("temperature", "0");
        outgoing.set("response_format", "verbose_json");
        response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: outgoing,
          signal: AbortSignal.timeout(22_000),
          cache: "no-store",
        });
      }
    } else if (useSarvam) {
      response = await fetchWithSarvamKey((apiKey) => {
        const outgoing = new FormData();
        outgoing.set("file", audio, filename);
        outgoing.set("model", process.env.SARVAM_STT_MODEL?.trim() || "saaras:v4");
        outgoing.set("language_code", "ta-IN");
        outgoing.set("mode", "transcribe");
        outgoing.set("keyterms", JSON.stringify([
          "Chennai", "Perungudi", "Guindy", "Tambaram", "Velachery", "Chennai Central", "Egmore", "Tirusulam", "Airport Metro", "CMBT",
          "சென்னை", "பெருங்குடி", "கிண்டி", "தாம்பரம்", "வேளச்சேரி", "எழும்பூர்",
        ]));
        return fetch("https://api.sarvam.ai/speech-to-text", {
          method: "POST",
          headers: { "api-subscription-key": apiKey },
          body: outgoing,
          signal: AbortSignal.timeout(22_000),
          cache: "no-store",
        });
      });
    } else {
      const outgoing = new FormData();
      outgoing.set("file", audio, filename);
      outgoing.set("model", process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3");
      outgoing.set("language", language === "ta" ? "ta" : "en");
      outgoing.set("prompt", language === "ta" ? CHENNAI_HINTS_TA : CHENNAI_HINTS_EN);
      outgoing.set("temperature", "0");
      outgoing.set("response_format", "verbose_json");
      response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: outgoing,
        signal: AbortSignal.timeout(22_000),
        cache: "no-store",
      });
    }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return apiError(timedOut ? 504 : 502, timedOut ? "STT_TIMEOUT" : "STT_NETWORK_ERROR", timedOut ? "Transcription took too long. Try a shorter recording." : "Could not reach the transcription service. You can type your question instead.");
  }

  if (response.status === 429) return apiError(429, "STT_RATE_LIMITED", "Speech transcription is temporarily rate limited. Please wait a moment or type your question.");
  if (response.status === 401 || response.status === 403) return apiError(503, "STT_CONFIGURATION_ERROR", "Voice transcription credentials need attention. Type your question instead.");
  if ((usedProvider === "sarvam" || usedProvider === "hf") && response.status === 503) return apiError(503, "STT_PROVIDER_UNAVAILABLE", "Tamil transcription model is warming up or temporarily overloaded. Try again shortly or type your question.");
  if (!response.ok) {
    const status = response.status >= 500 ? 502 : 422;
    return apiError(status, "STT_PROVIDER_ERROR", "The recording could not be transcribed. Please try again or type your question.");
  }

  let result: { text?: unknown; language?: unknown; transcript?: unknown; language_code?: unknown };
  try {
    result = await response.json();
  } catch {
    return apiError(502, "STT_INVALID_RESPONSE", "The transcription service returned an unreadable response.");
  }
  const rawTranscript = usedProvider === "sarvam" ? result.transcript : result.text;
  const transcript = typeof rawTranscript === "string" ? rawTranscript.trim() : "";
  if (!transcript) return apiError(422, "UNCLEAR_TRANSCRIPT", "I could not hear a clear question. Please try again or type it instead.");
  const detectedLanguage = usedProvider === "sarvam" ? result.language_code : usedProvider === "hf" ? language : result.language;
  return NextResponse.json({ transcript, detectedLanguage: typeof detectedLanguage === "string" ? detectedLanguage : null, provider: usedProvider });
}
