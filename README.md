# Chennai Voice

A responsive Tamil–English browser app for asking Chennai mobility questions by text or voice. Search uses the Chennai bus, Metro, and suburban rail GTFS feeds bundled with this project. It does not claim official CUMTA or Chennai One endorsement.

## What works

- English, Tamil, and common Tanglish typed route queries.
- Deterministic route, fare, duration, cheapest, and fastest parsing, including supported follow-ups with the last resolved route.
- Place autocomplete, alias matching, cautious one-character fuzzy suggestions, and clarification when a place name is ambiguous.
- GTFS route cards with map paths, route numbers, scheduled ride segments, transfer count, feed source, and feed date. The feeds do not include fares or live arrivals.
- The preserved voice agent widget in `agent folder/assistant.js` handles browser speech recognition, Tamil/English playback, route follow-ups, and sends results into the journey cards. If browser recognition is unavailable, its recorded-audio fallback uses Groq transcription.
- Optional Sarvam text-to-speech playback for a short factual summary. Text search does not depend on speech services.
- Recent route IDs in local storage. Audio and transcript text are not stored by the app.
- Search, place, transcription, speech, and health route handlers under `/api`.

## Requirements

- Node.js 20.9 or newer (Node 22+ is recommended for the optional direct TypeScript parser check).
- npm.
- A current browser. Microphone recording requires HTTPS or `localhost` and permission from the user.

Next.js 16 is the active LTS line. The App Router, TypeScript, and Tailwind CSS 4 are configured in this project.

## Install and run

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. PowerShell is shown for the environment-file copy; on macOS or Linux, use `cp .env.example .env.local`.

Run `npm run dev` from the project root, not from `agent folder`. The voice widget is served from that folder on the same site origin; no separate Python server is needed. See [agent folder/SETUP.md](<agent folder/SETUP.md>) for microphone and local browser troubleshooting.

GTFS route search works with every API key left blank. To run the production build locally:

```bash
npm run typecheck
npm run check:data
npm run check:search
npm run build
npm start
```

`check:search` uses Node's built-in TypeScript type stripping and therefore works on recent Node releases. For ordinary development, use `npm run dev`.

## Optional voice services

Copy `.env.example` to `.env.local` and add provider credentials on the server. `.env.local` is ignored by Git. Never add a `NEXT_PUBLIC_` provider key.

### Groq speech-to-text

1. Create an API key in the [Groq console](https://console.groq.com/keys).
2. Set `GROQ_API_KEY` in `.env.local`.
3. Leave `GROQ_STT_MODEL=whisper-large-v3`, or set another currently available transcription model.
4. Restart the development server.

If browser speech recognition is unavailable, the voice widget sends a short recording to Groq's documented audio transcription endpoint using multipart form data, the `language` field (`en` or `ta`), a place-name hint, and `response_format=verbose_json`. It uses transcription rather than the English-only translation endpoint, so Tamil text can remain Tamil. The browser requests microphone permission only after the user taps the voice control. A short privacy notice appears beside the microphone.

The current [Groq speech-to-text guide](https://console.groq.com/docs/speech-to-text) lists `whisper-large-v3` and `whisper-large-v3-turbo` as multilingual transcription models and documents `language`, `prompt`, and response format fields. The app sets an 8 MB request limit, a 22-second provider timeout, and never logs the audio or transcript.

### Gemini Tamil answers

Set `GEMINI_API_KEY` in `.env.local` to improve Tamil answers for Tamil-language searches. The key is used only by the server; the current Tamil template remains as a fallback if Gemini is unavailable. `GEMINI_TAMIL_MODEL` defaults to `gemini-3.8-flash`. Restart the development server after changing the key.

The integration uses Google's documented `generateContent` API and stable Gemini Flash model. See the [Gemini API guide](https://ai.google.dev/gemini-api/docs) and [model list](https://ai.google.dev/gemini-api/docs/models).

### Sarvam text-to-speech

1. Create an API key in the [Sarvam dashboard](https://dashboard.sarvam.ai).
2. Set `SARVAM_API_KEY` in `.env.local`.
3. Optionally set `SARVAM_TTS_MODEL`; when blank, the server uses `bulbul:v3`.
4. Restart the development server.

The backend posts to `https://api.sarvam.ai/text-to-speech`, sends the documented `api-subscription-key` header and `language_code` (`en-IN` or `ta-IN`), then decodes Sarvam's base64 WAV response into an audio response for the browser. The default `priya` speaker is documented for Bulbul v3 and supports English and Tamil. Playback starts only after the user presses Listen; Stop cancels playback. A provider error leaves the text answer in place.

Sarvam documents `bulbul:v3` as supporting Tamil and Indian English. See its [text-to-speech API reference](https://docs.sarvam.ai/api-reference/text-to-speech/convert) and [language guide](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/how-to/set-the-language). Provider quotas and billing depend on the account; the app does not assume unlimited or free usage.

## Environment variables

| Variable | Purpose | Default behavior |
| --- | --- | --- |
| `GROQ_API_KEY` | Server-side transcription credential | Browser speech recognition is attempted; recorded-audio fallback unavailable |
| `GROQ_STT_MODEL` | Groq transcription model | `whisper-large-v3` |
| `WHISPER_API_KEY` | Hugging Face API token for Tamil Whisper speech-to-text | Falls back to Sarvam or Groq transcription |
| `WHISPER_TAMIL_MODEL` | Hugging Face Tamil Whisper model | `vasista22/whisper-tamil-medium` |
| `GEMINI_API_KEY` | Server-side Tamil answer localization | Existing Tamil answer text is used |
| `GEMINI_TAMIL_MODEL` | Gemini translation model | `gemini-3.8-flash` |
| `SARVAM_API_KEY` | Server-side speech credential | Spoken answers disabled |
| `SARVAM_TTS_MODEL` | Sarvam speech model | `bulbul:v3` |
| `TRANSPORT_DATA_PROVIDER` | `gtfs` or `chennai-one` | `gtfs` |

`TRANSPORT_DATA_PROVIDER=chennai-one` selects a deliberately unconfigured adapter. It returns an honest unavailable response until legitimate Chennai One documentation, credentials, or an organiser-provided dataset exists. It does not scrape or invent an official endpoint.

## Data and route limits

The default provider loads `data/gtfs-journeys.json`; `data/route-map.json` supplies the corresponding map paths. Both files are generated from the three feeds in the `Theme 1/` folder (or `Theme 1 (1).zip`). Rebuild them anytime with `npm run build:data`. The generator matches the eleven mapped place pins to nearby GTFS stops and traces representative trip sequences. The fare and live arrival fields are not present in those feeds.

Displayed ride durations come from scheduled GTFS stop-time segments. Access walking is estimated from straight-line distance. Transfer waiting time and a valid departure connection are not calculated, so the duration is not a full door-to-door prediction. The Metro feed has older metadata. Confirm current fares, schedules, and service status with the operator. See [data/README.md](data/README.md) for the generation details.

## API routes

- `GET /api/health` — service availability and provider configuration booleans; no secrets.
- `GET /api/places?q=` — place names and aliases for autocomplete.
- `POST /api/search` — query, language, optional selected place IDs, and optional previous route context.
- `POST /api/chat` — compatibility adapter for the preserved voice widget; uses the GTFS route search engine.
- `GET /api/agent-widget` — serves `agent folder/assistant.js` on the same origin.
- `POST /api/transcribe` — multipart `audio` and `language`; maximum 8 MB.
- `POST /api/speak` — bounded short summary and language; returns WAV bytes.

Errors use `{ "error": { "code": "...", "message": "..." } }`. Basic rate limiting is an in-memory, per-process window. This reduces bursts during a local demo but is not shared across serverless instances and resets when a process restarts. Use a shared rate-limit store before exposing a multi-instance deployment publicly.

## Deploy

Use a Node-compatible Next.js host and configure the provider environment variables in the host's server-side settings. Keep `TRANSPORT_DATA_PROVIDER=gtfs` to use the bundled route feeds. Serve the site over HTTPS to allow browser microphone permission; `localhost` is the development exception. Do not commit `.env.local` or provider keys. The app works without either speech key and keeps typed search available.

## Three-minute demo

See [DEMO.md](DEMO.md) for the timed presenter script and graceful-failure walkthrough.

## Data limitations

The supplied feeds provide static route stops and scheduled ride segments. The site does not calculate transfer waits, fares, live departures, or current disruption status. Route paths are generated from stop coordinates because the feeds do not include `shapes.txt`. Chennai One remains unconfigured until its legitimate integration material is supplied.

## Start without PowerShell

Double-click Start Chennai Voice.cmd in the project folder. Keep its window open. It starts Next.js and opens the browser after the health endpoint responds. Node.js and the project dependencies must already be installed.

The assistant reads the generated Theme GTFS route paths to explain boarding, alighting, route names, walking distances and line changes. Ask bus only, show direct options, or which option has less walking after a journey search. The Theme archive contains three GTFS ZIPs, with no separate rules document. Routing currently covers the eleven mapped locations; live departures, fares and accessibility are not supplied.

