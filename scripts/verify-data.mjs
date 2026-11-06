import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const places = JSON.parse(await readFile(new URL("../data/places.json", import.meta.url), "utf8"));
const journeys = JSON.parse(await readFile(new URL("../data/journeys.json", import.meta.url), "utf8"));
const placeIds = new Set(places.map((place) => place.id));
const journeyIds = new Set();
const pairs = new Set();

assert.equal(placeIds.size, places.length, "place IDs must be unique");
assert.ok(journeys.length >= 10 && journeys.length <= 30, "the curated route list should stay compact");
for (const journey of journeys) {
  assert.ok(!journeyIds.has(journey.id), `duplicate journey ID: ${journey.id}`);
  journeyIds.add(journey.id);
  pairs.add(`${journey.originId}>${journey.destinationId}`);
  assert.ok(placeIds.has(journey.originId) && placeIds.has(journey.destinationId), `${journey.id} has an unknown endpoint`);
  assert.ok(journey.legs.length > 0, `${journey.id} needs at least one leg`);
  assert.ok(journey.transfers >= 0 && Number.isInteger(journey.transfers), `${journey.id} has invalid transfers`);
  assert.ok(["verified", "sample"].includes(journey.dataStatus), `${journey.id} has an invalid data status`);
  for (let index = 0; index < journey.legs.length; index += 1) {
    const leg = journey.legs[index];
    assert.ok(placeIds.has(leg.originId) && placeIds.has(leg.destinationId), `${journey.id} leg ${index} has an unknown endpoint`);
    if (index > 0) assert.equal(journey.legs[index - 1].destinationId, leg.originId, `${journey.id} leg endpoints must connect`);
    assert.ok(["bus", "metro", "train", "walk"].includes(leg.mode), `${journey.id} leg ${index} has an invalid mode`);
    for (const key of ["fareINR", "walkingMinutes", "waitingMinutes", "inVehicleMinutes"]) {
      const value = leg[key];
      assert.ok(value === null || (Number.isFinite(value) && value >= 0), `${journey.id} has invalid ${key}`);
    }
  }
  const expectedFare = journey.legs.some((leg) => leg.fareINR === null)
    ? null
    : journey.legs.reduce((sum, leg) => sum + leg.fareINR, 0);
  assert.equal(journey.totalFareINR, expectedFare, `${journey.id} total fare must match its legs`);
  const timeParts = journey.legs.flatMap((leg) => [leg.walkingMinutes, leg.waitingMinutes, leg.inVehicleMinutes]);
  const expectedTime = timeParts.some((value) => value === null) ? null : timeParts.reduce((sum, value) => sum + value, 0);
  assert.equal(journey.estimatedDurationMinutes, expectedTime, `${journey.id} duration must match walking, waiting, and ride time`);
}
assert.ok(pairs.size >= 10 && pairs.size <= 20, "include 10–20 directional origin-destination pairs");
console.log(`Dataset integrity passed: ${places.length} places, ${journeys.length} journeys, ${pairs.size} directional pairs.`);
