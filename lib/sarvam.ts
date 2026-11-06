export function hasSarvamApiKey() {
  return Boolean(process.env.SARVAM_API_KEY?.trim() || process.env.SARVAM_API_KEY_FALLBACK?.trim());
}

export async function fetchWithSarvamKey(request: (apiKey: string) => Promise<Response>) {
  const keys = Array.from(new Set(
    [process.env.SARVAM_API_KEY, process.env.SARVAM_API_KEY_FALLBACK]
      .map((key) => key?.trim())
      .filter((key): key is string => Boolean(key)),
  ));

  if (!keys.length) throw new Error("Sarvam API key is not configured.");

  for (const [index, key] of keys.entries()) {
    const response = await request(key);
    const rejectedKey = response.status === 401 || response.status === 403;
    if (!rejectedKey || index === keys.length - 1) return response;
  }

  throw new Error("Sarvam request did not return a response.");
}
