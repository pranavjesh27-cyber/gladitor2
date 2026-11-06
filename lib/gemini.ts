import type { Language, SearchOutput } from "@/lib/types";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

/** Improve Tamil copy on the server while preserving the deterministic search result as fallback. */
export async function localizeSearchOutput(
  result: SearchOutput,
  language: Language,
): Promise<SearchOutput> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const source = result.answerEnglish.trim();
  const hasDetailedTamil = /[\u0B80-\u0BFF]/.test(result.answerTamil) && result.answerTamil.includes("•");
  if (language !== "ta" || !apiKey || !source || hasDetailedTamil) return result;

  const preferredModel = process.env.GEMINI_TAMIL_MODEL?.trim() || "gemini-3.5-flash-lite";
  const candidateModels = Array.from(new Set([preferredModel, "gemini-3.5-flash-lite", "gemini-3.8-flash"]));
  const prompt = [
    "Translate the text below into clear, natural spoken Tamil for a Chennai public-transport assistant.",
    "Write in Tamil script. Preserve every fact, number, place, route name, fare, duration, and limitation exactly.",
    "Do not add advice, assumptions, or information. Keep GTFS and route codes unchanged when translating them could cause confusion.",
    "Return only the Tamil translation, without a label, quotes, or explanation.",
    "Text to translate:",
    source,
  ].join("\n");

  for (const model of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.15, maxOutputTokens: 1500 },
          }),
          signal: AbortSignal.timeout(6_000),
        },
      );
      if (!response.ok) continue;

      const payload = (await response.json()) as GeminiResponse;
      const tamil = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      if (!tamil || tamil.length > 6_000 || !/[\u0B80-\u0BFF]/.test(tamil)) continue;

      return {
        ...result,
        answer: tamil,
        answerTamil: tamil,
        speechText: tamil.slice(0, 580),
      };
    } catch {
      continue;
    }
  }
  return result;
}
