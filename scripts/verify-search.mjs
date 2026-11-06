import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { searchTransport } from "../lib/search.ts";

const places = JSON.parse(await readFile(new URL("../data/places.json", import.meta.url), "utf8"));
const journeys = JSON.parse(await readFile(new URL("../data/journeys.json", import.meta.url), "utf8"));
const provider = {
  id: "local",
  configured: true,
  getPlaces: () => places,
  getJourneys: (originId, destinationId) => journeys.filter((journey) => journey.originId === originId && journey.destinationId === destinationId),
};
const ask = (query, extra = {}) => searchTransport({ query, language: "en", ...extra }, provider);

const english = ask("How do I go from Perungudi to Guindy?");
assert.equal(english.status, "found");
assert.equal(english.journeys.length, 2);
assert.equal(english.origin.id, "perungudi");
assert.equal(english.destination.id, "guindy");

const tamil = searchTransport({ query: "பெருங்குடியில் இருந்து கிண்டிக்கு எப்படி போகலாம்?", language: "ta" }, provider);
assert.equal(tamil.status, "found");
assert.equal(tamil.journeys.length, 2);
assert.match(tamil.answer, /பெருங்குடி/);
const tamilFare = searchTransport({ query: "கிண்டியிலிருந்து தாம்பரத்திற்கு கட்டணம் எவ்வளவு?", language: "ta" }, provider);
assert.equal(tamilFare.intent, "fare");
assert.match(tamilFare.answerTamil, /₹20/);

const tanglish = ask("What is the fare from kindi to thambaram?");
assert.equal(tanglish.status, "found");
assert.equal(tanglish.origin.id, "guindy");
assert.equal(tanglish.destination.id, "tambaram");

const misspelled = ask("How do I go from Perungddi to Guindy?");
assert.equal(misspelled.status, "clarification", "fuzzy matches must ask before using a place");
assert.ok(misspelled.clarificationOptions.some((place) => place.id === "perungudi"));

const ambiguous = ask("How do I go from Airport to Guindy?");
assert.equal(ambiguous.status, "clarification");
assert.equal(ambiguous.clarificationField, "origin");
assert.equal(ambiguous.clarificationOptions.length, 2);

const missingDestination = ask("How do I go from Perungudi?");
assert.equal(missingDestination.status, "missing");
assert.equal(missingDestination.clarificationField, "destination");
const missingOrigin = ask("How do I go to Guindy?");
assert.equal(missingOrigin.status, "missing");
assert.equal(missingOrigin.clarificationField, "origin");

const unavailablePair = ask("How do I go from CMBT to Guindy?");
assert.equal(unavailablePair.status, "no_match");
const unsupported = ask("What is the weather in Chennai?");
assert.equal(unsupported.status, "unsupported");

const cheapest = ask("Show the cheapest option", { originId: "perungudi", destinationId: "guindy" });
assert.equal(cheapest.intent, "cheapest");
assert.deepEqual(cheapest.journeys.map((journey) => journey.totalFareINR), [25, 35]);

const fareFollowUp = ask("What is the fare?", { previousJourneyContext: { originId: "guindy", destinationId: "tambaram" } });
assert.equal(fareFollowUp.status, "found");
assert.match(fareFollowUp.answerEnglish, /₹20/);
const unknownFare = ask("What is the fare?", { previousJourneyContext: { originId: "perungudi", destinationId: "tambaram" } });
assert.equal(unknownFare.status, "found");
assert.match(unknownFare.answerEnglish, /not available/);

const unconfiguredProvider = { ...provider, id: "chennai-one", configured: false };
assert.equal(searchTransport({ query: "", language: "en" }, unconfiguredProvider).status, "unavailable");

console.log("Search behavior passed: English, Tamil, Tanglish, cautious fuzzy match, ambiguity, missing places, no-match, unsupported intent, fare follow-up, and unconfigured provider.");
