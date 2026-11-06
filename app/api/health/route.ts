import { NextResponse } from "next/server";
import { getTransportDataProvider } from "@/lib/provider";

export const runtime = "nodejs";

export async function GET() {
  const provider = getTransportDataProvider();
  const hfWhisperKey = Boolean(
    process.env.WHISPER_API_KEY?.trim() ||
    process.env.whisper_api_key?.trim() ||
    process.env.HF_API_KEY?.trim() ||
    process.env.HUGGINGFACE_API_KEY?.trim(),
  );
  return NextResponse.json({
    status: "ok",
    transportProvider: provider.id,
    transportConfigured: provider.configured,
    voiceTranscriptionEnabled: Boolean(
      hfWhisperKey ||
      process.env.GROQ_API_KEY?.trim() ||
      process.env.SARVAM_API_KEY?.trim() ||
      process.env.SARVAM_API_KEY_FALLBACK?.trim(),
    ),
    tamilWhisperConfigured: hfWhisperKey,
    spokenAnswersEnabled: Boolean(process.env.SARVAM_API_KEY || process.env.SARVAM_API_KEY_FALLBACK),
  });
}
