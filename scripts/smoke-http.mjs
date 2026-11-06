import assert from "node:assert/strict";

const base = (process.env.CHENNAI_VOICE_URL || "http://localhost:3000").replace(/\/$/, "");
const home = await fetch(base);
assert.equal(home.status, 200, "home page should respond successfully");
assert.match(await home.text(), /Chennai Voice/, "home page should include the app title");

const healthResponse = await fetch(`${base}/api/health`);
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.status, "ok");
assert.equal(health.transportProvider, "local");
assert.ok(!JSON.stringify(health).includes("GROQ_API_KEY"));
assert.ok(!JSON.stringify(health).includes("SARVAM_API_KEY"));

const placeResponse = await fetch(`${base}/api/places?q=kindi`);
assert.equal(placeResponse.status, 200);
const placeData = await placeResponse.json();
assert.ok(placeData.places.some((place) => place.id === "guindy"));

const search = async (body) => {
  const response = await fetch(`${base}/api/search`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
};
const route = await search({ query: "How do I go from Perungudi to Guindy?", language: "en" });
assert.equal(route.status, "found");
assert.equal(route.journeys.length, 2);
assert.ok(route.journeys.every((journey) => journey.dataStatus === "sample"));
const tamil = await search({ query: "கிண்டியிலிருந்து தாம்பரத்திற்கு கட்டணம் எவ்வளவு?", language: "ta" });
assert.equal(tamil.status, "found");
assert.match(tamil.answer, /₹20/);
const followUp = await search({ query: "What is the fare?", language: "en", previousJourneyContext: { originId: "guindy", destinationId: "tambaram" } });
assert.equal(followUp.status, "found");
assert.match(followUp.answer, /₹20/);
const missing = await search({ query: "How do I go from Perungudi?", language: "en" });
assert.equal(missing.status, "missing");
const noMatch = await search({ query: "How do I go from CMBT to Guindy?", language: "en" });
assert.equal(noMatch.status, "no_match");

if (!health.voiceTranscriptionEnabled) {
  const transcribe = await fetch(`${base}/api/transcribe`, { method: "POST" });
  assert.equal(transcribe.status, 503);
  assert.equal((await transcribe.json()).error.code, "STT_NOT_CONFIGURED");
}
if (!health.spokenAnswersEnabled) {
  const speak = await fetch(`${base}/api/speak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(speak.status, 503);
  assert.equal((await speak.json()).error.code, "TTS_NOT_CONFIGURED");
}

console.log("HTTP smoke check passed: app, health, alias autocomplete, English/Tamil search, fare context, missing/no-match routes, and honest unconfigured speech responses.");
