# Three-minute Chennai Voice demo

Use Chrome or Edge at the local site. For microphone input, use HTTPS or `localhost` and allow microphone access after tapping the voice control. The preserved voice widget uses browser speech recognition when available; its recorded-audio fallback needs `GROQ_API_KEY`. The same searches work by typing. Sarvam playback is optional.

## 0:00–0:50 — English GTFS route search

1. Leave the interface and input language on English.
2. Enter **“How do I go from Perungudi to Guindy?”** or tap the matching example chip.
3. Press **Search journeys**.
4. Point out the GTFS route numbers, scheduled ride segments, route map, line changes, feed source, and feed date.
5. Explain that route data is static and the ride figure excludes waiting and transfer time. The feeds do not include fares.

Tap the mic button in the search panel or the floating voice orb, then ask the route question. The agent searches the same GTFS route engine and updates the route cards. The recognized text also appears in the editable question field. If the browser's speech recognition is unavailable, the recorded-audio fallback uses Groq; typed search remains available either way.

## 0:50–1:35 — Tamil query

1. Switch the interface and input language to **தமிழ்**.
2. Enter **“பெருங்குடியிலிருந்து கிண்டிக்கு எப்படி போகலாம்?”** or use the Tamil example.
3. Press **பயண வழிகளைத் தேடு**.
4. Show the Tamil answer, bilingual station names, GTFS route cards, and route map.

## 1:35–2:10 — Follow-up using journey context

1. Keep the current route result visible.
2. Replace the question with **“கட்டணம் எவ்வளவு?”** and press Search.
3. Show that the answer reuses the current Perungudi-to-Guindy route context and explains that fare information is not included in the supplied feeds.

An English alternative is **“What is the fare?”**.

## 2:10–2:45 — No connected path

1. Enter **“How do I go from Perungudi to CMBT?”** and press Search.
2. Show the message that the supplied feeds did not produce a connected route within the configured line-change limit.
3. Select Perungudi and Guindy to return to the working route example.

## 2:45–3:00 — Close

Summarize the boundaries: typed search uses bundled static GTFS feeds without provider credentials; route timing excludes waiting and transfer time; fares and live arrivals are unavailable; browser speech recognition requires microphone permission; the recorded-audio fallback needs a Groq key; Sarvam's Listen buttons need a Sarvam key; official Chennai One data is not connected.
