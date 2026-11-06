"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import placeRecords from "@/data/places.json";
import placeCoordinates from "@/data/place-coordinates.json";
import routeMapRecords from "@/data/route-map.json";
import type { Journey, JourneyLeg, Language, Place, SearchOutput, TransportMode } from "@/lib/types";
import TransitMap, { type RouteMapGeometry } from "@/app/TransitMap";

type VoiceState = "idle" | "recording" | "transcribing" | "ready" | "error";
type ResultFilter = "all" | "cheapest" | "fastest";
type HealthState = { voiceTranscriptionEnabled: boolean; spokenAnswersEnabled: boolean; transportProvider?: string; transportConfigured?: boolean } | null;
type RecentRoute = { originId: string; destinationId: string; at: number };
type VoiceSearchDetail = { query: string; language: Language; output: SearchOutput };

const PLACES = placeRecords as Place[];
const PLACE_COORDS = placeCoordinates as unknown as Record<string, [number, number]>;
const ROUTE_MAP = routeMapRecords as unknown as Record<string, RouteMapGeometry>;
const RECENTS_KEY = "chennai-voice-recent-routes-v1";

const COPY = {
  en: {
    eyebrow: "Chennai mobility, made easier",
    title: "Where do you want to go?",
    subtitle: "Speak or type in Tamil or English to search the supplied Chennai bus, Metro and suburban rail feeds.",
    panelTitle: "Plan your journey",
    panelSubtitle: "Ask a question or choose places below.",
    chooseLanguage: "Input language",
    record: "Tap to speak",
    recordHint: "Tap the mic and ask a question",
    recording: "Listening…",
    transcribing: "Transcribing your recording…",
    ready: "Transcript ready to edit",
    micDisabled: "Voice setup required",
    micSetup: "Browser speech recognition works without an API key; Groq is an optional fallback.",
    tapBrowser: "Your browser will ask for microphone access.",
    recordingNotice: "Groq Whisper & browser speech recognition ready · Tamil & English spoken answers",
    agentLoading: "Loading voice assistant…",
    recordingTooLong: "30 second limit",
    stop: "Stop",
    cancel: "Cancel",
    orType: "OR TYPE YOUR QUESTION",
    questionLabel: "Your question",
    transcriptReady: "Transcript — edit before searching",
    queryPlaceholder: "e.g. How do I go from Perungudi to Guindy?",
    typeHint: "Your words stay editable. Search uses the supplied static GTFS route feeds.",
    search: "Find routes",
    searching: "Searching…",
    routeFields: "Choose places",
    origin: "From (Origin)",
    destination: "To (Destination)",
    originPlaceholder: "Search Chennai places (e.g. Perungudi)",
    destinationPlaceholder: "Search Chennai places (e.g. Guindy)",
    swap: "Swap origin and destination",
    examples: "Try an example:",
    exampleHint: "Tap an example to fill your question or run a search.",
    recent: "Recent routes",
    clear: "Clear",
    noRecent: "Your recent routes will appear here.",
    results: "Journey options",
    resultsHint: "Route paths and scheduled ride segments from the supplied GTFS feeds",
    demoDataset: "GTFS feeds",
    chennaiOneUnconfigured: "Chennai One · not configured",
    emptyTitle: "Your next trip starts here",
    emptyBody: "Choose a start and destination, or tap a quick pair above, then press Find routes.",
    emptyHint: "Try “How do I go from Perungudi to Guindy?”",
    route: "route",
    routes: "routes",
    all: "All routes",
    cheapest: "Cheapest",
    fastest: "Fastest",
    fare: "Fare",
    estimated: "Ride + access walk",
    transfers: "transfers",
    transfer: "transfer",
    noTransfer: "Direct",
    feed: "GTFS feed",
    minutes: "min",
    walk: "Walk",
    bus: "Bus",
    metro: "Metro",
    train: "Train",
    unknownFare: "Fare unavailable",
    cheapestLabel: "Cheapest in this dataset",
    fastestLabel: "Fastest in this dataset",
    source: "Source",
    updated: "GTFS feed start",
    listen: "Listen",
    stopPlayback: "Stop audio",
    preparingAudio: "Preparing audio…",
    playingAudio: "Playing answer",
    ttsUnavailable: "Spoken playback is not configured. Text results remain available.",
    ttsFailed: "Spoken playback is unavailable right now. Your text results are still here.",
    feedDisclaimer: "Static GTFS feed. Fare information, waiting times and live service status are not included.",
    notice: "Independent hackathon prototype. Not an official CUMTA or Chennai One service.",
    voiceUnsupported: "This browser does not support microphone recording. You can type instead.",
    permissionDenied: "Microphone permission was denied. You can type your question instead.",
    noMic: "No microphone was found. You can type your question instead.",
    formatUnsupported: "This browser cannot create a supported recording format. You can type instead.",
    emptyAudio: "No audio was captured. Try again or type your question.",
    audioTooLarge: "Recording is too large. Please try a shorter recording.",
    networkError: "Could not reach the app. Check your connection or type your question.",
    sttUnavailable: "Voice transcription is unavailable. You can still type and search.",
    providerError: "Transcription could not complete. Please try once more or type your question.",
    unclear: "I could not hear a clear question. Please try again or type instead.",
    limit: "Please wait a moment before trying again.",
    routeSelect: "Select a place",
    unavailable: "This provider is not configured. Search the supplied GTFS feeds.",
    showOnMap: "Show on map",
    shownOnMap: "Shown on map",
    mapNote: "Solid lines follow GTFS stops; dashed end sections estimate access walks. Ride time excludes transfer and waiting time; fares and live arrivals are unavailable.",
    homeVoiceTitle: "Ask Namma Right Here",
    homeVoiceSub: "Speak or type your Chennai journey question in English or தமிழ்.",
    homeGreet: "Vanakkam! Where are we heading today? Ask me for a route (e.g. Perungudi to Guindy), or about Bus, Metro and Suburban Train availability.",
    openInPlan: "Open in Plan Journey (View route)",
  },
  ta: {
    eyebrow: "சென்னைப் பயணம், எளிதாக",
    title: "நீங்கள் எங்கு செல்ல வேண்டும்?",
    subtitle: "தமிழில் அல்லது ஆங்கிலத்தில் பேசவும் அல்லது தட்டச்சு செய்யவும். வழங்கப்பட்ட சென்னை போக்குவரத்து GTFS தரவுகளில் தேடுகிறோம்.",
    panelTitle: "பயணத்தைத் திட்டமிடுங்கள்",
    panelSubtitle: "கேள்வியைக் கேளுங்கள் அல்லது கீழே இடங்களைத் தேர்வு செய்யுங்கள்.",
    chooseLanguage: "கேள்வி மொழி",
    record: "பேசத் தொடங்கவும்",
    recordHint: "மைக்கை அழுத்தி கேளுங்கள்",
    recording: "கேட்கிறது…",
    transcribing: "பதிவை எழுத்தாக்குகிறது…",
    ready: "எழுத்தாக்கத்தைத் திருத்தலாம்",
    micDisabled: "குரல் அமைப்பு தேவை",
    micSetup: "உலாவி குரல் அடையாளம் API திறவுகோல் இல்லாமலும் செயல்படும்; Groq விருப்பமான மாற்று.",
    tapBrowser: "மைக்ரோஃபோன் அனுமதியை உலாவி கேட்கும்.",
    recordingNotice: "உலாவி குரல் அடையாளம் மற்றும் Groq Whisper தயார் · தமிழ் & ஆங்கில குரல் பதில்",
    agentLoading: "குரல் உதவியாளர் ஏற்றப்படுகிறது…",
    recordingTooLong: "அதிகபட்சம் 30 வினாடிகள்",
    stop: "நிறுத்து",
    cancel: "ரத்து",
    orType: "அல்லது கேள்வியைத் தட்டச்சு செய்யுங்கள்",
    questionLabel: "உங்கள் கேள்வி",
    transcriptReady: "எழுத்தாக்கம் — தேடுவதற்கு முன் திருத்துங்கள்",
    queryPlaceholder: "எ.கா. பெருங்குடியிலிருந்து கிண்டிக்கு எப்படிச் செல்வது?",
    typeHint: "உங்கள் கேள்வியைத் திருத்தலாம். தேடல் வழங்கப்பட்ட நிலையான GTFS வழித் தரவைப் பயன்படுத்தும்.",
    search: "பயண வழிகளைத் தேடு",
    searching: "தேடுகிறது…",
    routeFields: "இடங்களைத் தேர்வு செய்யுங்கள்",
    origin: "எங்கிருந்து (தொடக்கம்)",
    destination: "எங்கு செல்ல (இலக்கு)",
    originPlaceholder: "தொடக்க இடம் (எ.கா. பெருங்குடி)",
    destinationPlaceholder: "இலக்கு (எ.கா. கிண்டி)",
    swap: "தொடக்க இடத்தையும் இலக்கையும் மாற்று",
    examples: "எடுத்துக்காட்டுகள்:",
    exampleHint: "கேள்வியில் உரையைச் சேர்க்கும்; தேடலை இயக்க Search-ஐ அழுத்துங்கள்.",
    recent: "சமீபத்திய வழிகள்",
    clear: "அழி",
    noRecent: "நீங்கள் தேடிய வழிகள் இங்கே தெரியும்.",
    results: "பயண விருப்பங்கள்",
    resultsHint: "வழங்கப்பட்ட GTFS தரவுகளிலிருந்து வழிகளும் திட்டமிட்ட பயண நேரங்களும்",
    demoDataset: "GTFS தரவுகள்",
    chennaiOneUnconfigured: "Chennai One · அமைக்கப்படவில்லை",
    emptyTitle: "உங்கள் அடுத்த பயணம் இங்கே தொடங்குகிறது",
    emptyBody: "தமிழில் அல்லது ஆங்கிலத்தில் கேளுங்கள், அல்லது தொடக்க இடத்தையும் இலக்கையும் தேர்வு செய்து வழங்கப்பட்ட சென்னை வழித் தரவுகளில் தேடுங்கள்.",
    emptyHint: "“பெருங்குடியிலிருந்து கிண்டிக்கு எப்படிச் செல்வது?” என்று கேளுங்கள்",
    route: "வழி",
    routes: "வழிகள்",
    all: "அனைத்து வழிகளும்",
    cheapest: "குறைந்த செலவு",
    fastest: "விரைவானது",
    fare: "கட்டணம்",
    estimated: "பயணமும் நடைப்பயணமும்",
    transfers: "மாற்றங்கள்",
    transfer: "மாற்றம்",
    noTransfer: "நேரடி",
    feed: "GTFS தரவு",
    minutes: "நிமி",
    walk: "நடை",
    bus: "பேருந்து",
    metro: "மெட்ரோ",
    train: "ரயில்",
    unknownFare: "கட்டணம் இல்லை",
    cheapestLabel: "இந்தத் தரவில் குறைந்த கட்டணம்",
    fastestLabel: "இந்தத் தரவில் விரைவானது",
    source: "தரவு மூலம்",
    updated: "GTFS தரவு தொடங்கும் நாள்",
    listen: "கேளுங்கள்",
    stopPlayback: "ஒலியை நிறுத்து",
    preparingAudio: "ஒலி தயாராகிறது…",
    playingAudio: "பதில் ஒலிக்கிறது",
    ttsUnavailable: "குரல் பதில் அமைக்கப்படவில்லை. எழுத்துப் பதில் கிடைக்கும்.",
    ttsFailed: "இப்போது குரல் பதில் கிடைக்கவில்லை. எழுத்துப் பதில் அப்படியே இருக்கும்.",
    feedDisclaimer: "நிலையான GTFS தரவு. கட்டணம், காத்திருப்பு நேரம், நேரடி சேவை நிலை இதில் இல்லை.",
    notice: "சுயாதீன ஹேக்கத்தான் முன்மாதிரி. அதிகாரப்பூர்வ CUMTA அல்லது Chennai One சேவை அல்ல.",
    voiceUnsupported: "இந்த உலாவியில் மைக்ரோஃபோன் பதிவு இல்லை. தட்டச்சு செய்து தேடலாம்.",
    permissionDenied: "மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டது. கேள்வியைத் தட்டச்சு செய்யலாம்.",
    noMic: "மைக்ரோஃபோன் கிடைக்கவில்லை. கேள்வியைத் தட்டச்சு செய்யலாம்.",
    formatUnsupported: "இந்த உலாவியின் பதிவு வடிவம் ஆதரிக்கப்படவில்லை. தட்டச்சு செய்து தேடலாம்.",
    emptyAudio: "ஒலி பதிவாகவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது தட்டச்சு செய்யவும்.",
    audioTooLarge: "பதிவு மிகப் பெரியது. குறுகிய பதிவை முயற்சிக்கவும்.",
    networkError: "பயன்பாட்டை அணுக முடியவில்லை. இணைய இணைப்பைச் சரிபார்க்கவும் அல்லது தட்டச்சு செய்யவும்.",
    sttUnavailable: "குரல் எழுத்தாக்கம் கிடைக்கவில்லை. தட்டச்சு செய்து தேடலாம்.",
    providerError: "குரல் எழுத்தாக்கம் முடியவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது தட்டச்சு செய்யவும்.",
    unclear: "கேள்வி தெளிவாகக் கேட்கவில்லை. மீண்டும் முயற்சிக்கவும் அல்லது தட்டச்சு செய்யவும்.",
    limit: "மீண்டும் முயற்சிக்கும் முன் சிறிது நேரம் காத்திருக்கவும்.",
    routeSelect: "ஒரு இடத்தைத் தேர்வு செய்யுங்கள்",
    unavailable: "இந்த வழங்குநர் அமைக்கப்படவில்லை. வழங்கப்பட்ட GTFS தரவுகளில் தேடுங்கள்.",
    showOnMap: "வரைபடத்தில் காண்க",
    shownOnMap: "வரைபடத்தில் காட்டப்படுகிறது",
    mapNote: "திடக் கோடுகள் GTFS நிறுத்தங்களைப் பின்பற்றும்; கோடிட்ட முனைப் பகுதிகள் நடைப்பயண மதிப்பீடு. பயண நேரத்தில் காத்திருப்பும் வழிமாற்றமும் இல்லை; கட்டணம், நேரடி வருகைத் தகவலும் இல்லை.",
    homeVoiceTitle: "நம்மாவிடம் இங்கே கேளுங்கள்",
    homeVoiceSub: "தமிழ் அல்லது English-ல் உங்கள் பயணக் கேள்வியைக் கேளுங்கள்.",
    homeGreet: "வணக்கம்! இன்று எங்கே செல்ல வேண்டும்? பெருங்குடி முதல் கிண்டி வரை வழி, பேருந்து, மெட்ரோ அல்லது புறநகர் ரயில் பற்றி கேளுங்கள்.",
    openInPlan: "பயணத் திட்டத்தில் திற (வழியைக் காண்க)",
  },
} as const;

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { className: "icon", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/></>,
    features: <><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm7 0v4m-2-2h4"/></>,
    about: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
    mark: <><rect x="5" y="3" width="14" height="16" rx="4"/><path d="M5 12h14M12 3v9M8 22l2-3m6 3-2-3M8 16h1m6 0h1"/></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    stop: <><rect x="6" y="6" width="12" height="12" rx="2"/></>,
    swap: <><path d="M4 7h15l-3-3m4 13H5l3 3"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4.4 4.4"/></>,
    bus: <><rect x="3" y="4" width="18" height="15" rx="3"/><path d="M3 12h18M9 4v8m6-8v8M6 19v2m12-2v2M6 16h2m8 0h2"/></>,
    metro: <><rect x="5" y="3" width="14" height="16" rx="4"/><path d="M5 12h14M12 3v9M8 22l2-3m6 3-2-3M8 16h1m6 0h1"/></>,
    train: <><rect x="6" y="3" width="12" height="16" rx="4"/><path d="M6 12h12M9 7h.01M15 7h.01M8 21l2-2m6 2-2-2M4 21h16"/></>,
    walk: <><circle cx="13" cy="4.5" r="2"/><path d="m10 22 2-6-3-3 2-5 4 3 3 1m-7 4-4 2-2 4m8-8 4 3 2 5"/></>,
    pin: <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></>,
    route: <><path d="M5 19h9a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h9"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    rupee: <><path d="M6 4h12M6 8h12M6 4c6.5 0 7 8 0 8l9 8"/></>,
    shield: <><circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5h14M12 8.5v5.5m-3.5 7 3.5-7 3.5 7"/></>,
    spark: <><path d="M3 5h12M9 2v3M5 5c1 5 4 9 9 11M13 5c-1 5-4 9-9 11m10 5 4-11 4 11m-6-4h4"/></>,
    speaker: <><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a5 5 0 0 1 0 6m2.5-8.5a8.5 8.5 0 0 1 0 11"/></>,
    arrow: <><path d="m22 2-11 11M22 2l-7 20-4-9-9-4Z"/></>,
    chevron: <><path d="m7 10 5 5 5-5"/></>,
    history: <><path d="M4 8V4m0 4h4M4.8 8a8.5 8.5 0 1 1-.3 6M12 7v5l3 2"/></>,
  };
  return <svg {...common}>{paths[name] ?? paths.spark}</svg>;
}

function placeName(id: string, language: Language) {
  const place = PLACES.find((item) => item.id === id);
  return place ? (language === "ta" ? place.nameTa : place.nameEn) : id;
}

function getModeIcon(mode: TransportMode) {
  return mode === "bus" ? "bus" : mode === "metro" ? "metro" : mode === "train" ? "train" : "walk";
}

function displayError(code: string | undefined, fallback: string, copy: (typeof COPY)[Language]) {
  if (code === "STT_NOT_CONFIGURED" || code === "STT_CONFIGURATION_ERROR") return copy.sttUnavailable;
  if (code === "EMPTY_AUDIO") return copy.emptyAudio;
  if (code === "AUDIO_TOO_LARGE") return copy.audioTooLarge;
  if (code === "UNSUPPORTED_AUDIO") return copy.formatUnsupported;
  if (code === "UNCLEAR_TRANSCRIPT") return copy.unclear;
  if (code === "RATE_LIMITED" || code === "STT_RATE_LIMITED" || code === "TTS_RATE_LIMITED") return copy.limit;
  if (code === "TTS_NOT_CONFIGURED") return copy.ttsUnavailable;
  if (code?.startsWith("TTS_") || code === "SPEECH_UNAVAILABLE") return copy.ttsFailed;
  if (code?.includes("NETWORK") || code?.includes("TIMEOUT")) return copy.networkError;
  return fallback;
}

function modeName(mode: TransportMode, language: Language, copy: (typeof COPY)[Language]) {
  if (mode === "bus") return copy.bus;
  if (mode === "metro") return copy.metro;
  if (mode === "train") return copy.train;
  return copy.walk;
}

function getJourneyPrimaryMode(journey: Journey): TransportMode {
  return journey.legs.find((leg) => leg.mode !== "walk")?.mode ?? "walk";
}

function getJourneyServiceCodes(journey: Journey): string {
  const names = journey.legs
    .filter((leg) => leg.mode !== "walk" && Boolean(leg.serviceName))
    .map((leg) => (leg.serviceName ?? "").replace(/^(MTC Bus|Chennai Metro|Suburban Train)\s*/i, "").trim());
  return Array.from(new Set(names)).filter(Boolean).join(" → ");
}

function RouteModeSummary({ journeys, language, dark = false }: { journeys: Journey[]; language: Language; dark?: boolean }) {
  if (!journeys.length) return null;
  const modes: Array<{ mode: "bus" | "metro" | "train"; labelEn: string; labelTa: string }> = [
    { mode: "bus", labelEn: "MTC Bus", labelTa: "மாநகரப் பேருந்து" },
    { mode: "metro", labelEn: "Chennai Metro", labelTa: "சென்னை மெட்ரோ" },
    { mode: "train", labelEn: "Suburban Train", labelTa: "புறநகர் ரயில்" },
  ];

  return (
    <div className={`mode-availability-grid${dark ? " dark" : ""}`} aria-label={language === "ta" ? "வழி போக்குவரத்து நிலை" : "Route mode availability"}>
      {modes.map(({ mode, labelEn, labelTa }) => {
        const matching = journeys.filter((j) => j.legs.some((leg) => leg.mode === mode));
        const hasMode = matching.length > 0;
        const fastest = matching
          .map((j) => j.estimatedDurationMinutes)
          .filter((n): n is number => n !== null)
          .sort((a, b) => a - b)[0];
        const codes = matching[0] ? getJourneyServiceCodes(matching[0]) : "";
        return (
          <div key={mode} className={`mode-pill ${hasMode ? "available" : "unavailable"}`}>
            <span className="mode-pill-icon">
              <Icon name={getModeIcon(mode)} size={16} />
            </span>
            <div className="mode-pill-body">
              <strong>{language === "ta" ? labelTa : labelEn}</strong>
              <span>
                {hasMode
                  ? language === "ta"
                    ? `✓ உள்ளது${fastest ? ` · ~${fastest} நிமி` : ""}${codes ? ` (${codes})` : ""}`
                    : `✓ Available${fastest ? ` · ~${fastest} min` : ""}${codes ? ` (${codes})` : ""}`
                  : language === "ta"
                    ? "✗ இந்த வழியில் இல்லை"
                    : "✗ Not on this route"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JourneyCard({
  journey, language, copy, cheapest, fastest, onListen, listenState, speechAvailable, selected, onShowOnMap,
}: {
  journey: Journey;
  result: SearchOutput;
  language: Language;
  copy: (typeof COPY)[Language];
  cheapest: boolean;
  fastest: boolean;
  onListen: () => void;
  listenState: "idle" | "loading" | "playing";
  speechAvailable: boolean;
  selected: boolean;
  onShowOnMap: () => void;
}) {
  const primaryMode = getJourneyPrimaryMode(journey);
  const serviceCodes = getJourneyServiceCodes(journey);
  return (
    <article className={`journey-card${selected ? " selected" : ""}`}>
      <div className="journey-heading">
        <div>
          <div className="route-name">
            {placeName(journey.originId, language)} <span className="route-arrow">→</span> {placeName(journey.destinationId, language)}
          </div>
          <span className="route-name-ta">
            {placeName(journey.originId, "ta")} <span aria-hidden="true">→</span> {placeName(journey.destinationId, "ta")}
          </span>
        </div>
        <span className={`feed-tag mode-${primaryMode}`}>
          <Icon name={getModeIcon(primaryMode)} size={14} />
          {modeName(primaryMode, language, copy)}{serviceCodes ? ` · ${serviceCodes}` : ""}
        </span>
      </div>
      <div className="journey-stats">
        <div className="stat-item"><span className="stat-icon"><Icon name="rupee" size={16}/></span><div><strong>{journey.totalFareINR === null ? copy.unknownFare : `₹${journey.totalFareINR}`}</strong><span>{copy.fare}</span></div></div>
        <div className="stat-item"><span className="stat-icon"><Icon name="clock" size={16}/></span><div><strong>{journey.estimatedDurationMinutes === null ? "—" : `${journey.estimatedDurationMinutes} ${copy.minutes}`}</strong><span>{copy.estimated}</span></div></div>
        <div className="stat-item"><span className="stat-icon"><Icon name="route" size={16}/></span><div><strong>{journey.transfers === 0 ? copy.noTransfer : `${journey.transfers} ${journey.transfers === 1 ? copy.transfer : copy.transfers}`}</strong><span>{journey.transfers === 0 ? " " : " "}</span></div></div>
        {(cheapest || fastest) && <span className="best-label">{cheapest ? copy.cheapestLabel : copy.fastestLabel}</span>}
      </div>
      <div className="timeline" aria-label={language === "ta" ? "பயணப் படிகள்" : "Journey steps"}>
        {journey.legs.map((leg, index) => (
          <JourneyStep key={`${journey.id}-${index}`} leg={leg} index={index} total={journey.legs.length} language={language} copy={copy}/>
        ))}
      </div>
      <div className="source-line">{copy.source}: {journey.source} · {copy.updated}: {journey.updatedAt}</div>
      <div className="listen-row">
        <button className="map-route-button" type="button" aria-pressed={selected} onClick={onShowOnMap}>
          <Icon name="pin" size={14}/>{selected ? copy.shownOnMap : copy.showOnMap}
        </button>
        <button className="listen-button" type="button" onClick={onListen} disabled={!speechAvailable || listenState === "loading"}>
          <Icon name={listenState === "playing" ? "stop" : "speaker"} size={14}/>
          {listenState === "loading" ? copy.preparingAudio : listenState === "playing" ? copy.stopPlayback : copy.listen}
        </button>
      </div>
      {!speechAvailable && <p className="speech-status">{copy.ttsUnavailable}</p>}
      {listenState === "loading" && <p className="speech-status" role="status">{copy.preparingAudio}</p>}
      {listenState === "playing" && <p className="speech-status" role="status">{copy.playingAudio}</p>}
    </article>
  );
}

function JourneyStep({ leg, index, language, copy }: { leg: JourneyLeg; index: number; total: number; language: Language; copy: (typeof COPY)[Language] }) {
  const duration = [leg.walkingMinutes, leg.waitingMinutes, leg.inVehicleMinutes].every((part) => part !== null)
    ? (leg.walkingMinutes ?? 0) + (leg.waitingMinutes ?? 0) + (leg.inVehicleMinutes ?? 0)
    : null;
  const details = [
    leg.walkingMinutes !== null && leg.walkingMinutes > 0 ? `${language === "ta" ? "நடை" : "Walk"} ${leg.walkingMinutes} ${copy.minutes}` : null,
    leg.waitingMinutes !== null && leg.waitingMinutes > 0 ? `${language === "ta" ? "காத்திருப்பு" : "Wait"} ${leg.waitingMinutes} ${copy.minutes}` : null,
    leg.inVehicleMinutes !== null && leg.inVehicleMinutes > 0 ? `${language === "ta" ? "பயணம்" : "Ride"} ${leg.inVehicleMinutes} ${copy.minutes}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="timeline-step">
      <span className="timeline-node"><Icon name={getModeIcon(leg.mode)} size={9}/></span>
      <div className="timeline-step-title">
        {index === 0 ? placeName(leg.originId, language) : `${modeName(leg.mode, language, copy)} · ${placeName(leg.originId, language)}`} <span aria-hidden="true">→</span> {placeName(leg.destinationId, language)}
      </div>
      <div className="timeline-step-meta">
        {leg.serviceName ? `${leg.serviceName} · ` : ""}{details || (duration === null ? "" : `${duration} ${copy.minutes}`)}
        {leg.fareINR !== null && leg.fareINR > 0 ? ` · ₹${leg.fareINR}` : ""}
      </div>
    </div>
  );
}

function PlaceAutocomplete({
  label, placeholder, value, onChange, onSelect, selectedId, destination, language,
}: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void; onSelect: (place: Place) => void;
  selectedId: string; destination: boolean; copy: (typeof COPY)[Language]; language: Language;
}) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2 || selectedId) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        setSuggestions(Array.isArray(data.places) ? data.places.slice(0, 6) : []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 170);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [value, selectedId]);

  return (
    <div className="place-field-wrap">
      <label className="field-label">{label}<span>{selectedId ? " ✓" : ""}</span></label>
      <div className="place-input-row">
        <span className={`place-symbol${destination ? " destination" : ""}`} aria-hidden="true"/>
        <input
          className="place-input"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          onFocus={() => { if (suggestions.length) setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        />
        {selectedId && <span className="sr-only">{language === "ta" ? "இடம் தேர்ந்தெடுக்கப்பட்டது" : "Place selected"}</span>}
      </div>
      {open && suggestions.length > 0 && (
        <div className="suggestion-list" role="listbox">
          {suggestions.map((place) => (
            <button key={place.id} type="button" role="option" aria-selected={false} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(place); setOpen(false); }}>
              {language === "ta" ? place.nameTa : place.nameEn}
              <span className="suggestion-ta">{language === "ta" ? place.nameEn : place.nameTa}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [uiLanguage, setUiLanguage] = useState<Language>("en");
  const [activeNavigation, setActiveNavigation] = useState("home");
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreSelection, setExploreSelection] = useState<Place | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [leafletFailed, setLeafletFailed] = useState(false);
  const [selectedJourneyId, setSelectedJourneyId] = useState("");
  const [inputLanguage, setInputLanguage] = useState<Language>("en");
  const [voiceAgentReady, setVoiceAgentReady] = useState(false);
  const copy = COPY[uiLanguage];
  const [query, setQuery] = useState("");
  const [homeQuery, setHomeQuery] = useState("");
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [result, setResult] = useState<SearchOutput | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState("");
  const [health, setHealth] = useState<HealthState>(null);
  const [recent, setRecent] = useState<RecentRoute[]>([]);
  const [listenState, setListenState] = useState<"idle" | "loading" | "playing">("idle");
  const [speechError, setSpeechError] = useState("");

  const searchSequence = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const latestResult = useRef<SearchOutput | null>(null);
  const mountedRef = useRef(true);
  const cityRoutePathRef = useRef<SVGPathElement | null>(null);
  const cityBusGroupRef = useRef<SVGGElement | null>(null);
  const busRafRef = useRef<number | null>(null);
  const activeNavRef = useRef(activeNavigation);

  useEffect(() => { activeNavRef.current = activeNavigation; }, [activeNavigation]);
  useEffect(() => { latestResult.current = result; }, [result]);

  const triggerHomeBusAnimation = useCallback(() => {
    const routePath = cityRoutePathRef.current;
    const busGroup = cityBusGroupRef.current;
    if (!routePath || !busGroup) return;

    if (busRafRef.current !== null) {
      window.cancelAnimationFrame(busRafRef.current);
      busRafRef.current = null;
    }

    const positionBusAtProgress = (tNorm: number) => {
      try {
        const total = routePath.getTotalLength();
        const len = Math.max(0, Math.min(1, tNorm)) * total;
        const pt = routePath.getPointAtLength(len);
        const ptAhead = routePath.getPointAtLength(Math.min(total, len + 4));
        const angle = Math.atan2(ptAhead.y - pt.y, ptAhead.x - pt.x) * (180 / Math.PI);
        const clampedAngle = Math.max(-18, Math.min(18, angle * 0.45));
        busGroup.setAttribute("transform", `translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) rotate(${clampedAngle.toFixed(1)})`);
      } catch {
        busGroup.setAttribute("transform", "translate(95, 255)");
      }
    };

    const startPos = 0.08;
    const peakPos = 0.25;
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      positionBusAtProgress(startPos);
      routePath.removeAttribute("stroke-dasharray");
      routePath.removeAttribute("stroke-dashoffset");
      return;
    }

    let totalLen = 440;
    try {
      totalLen = routePath.getTotalLength();
      routePath.style.strokeDasharray = String(totalLen);
      routePath.style.strokeDashoffset = String(totalLen);
    } catch { /* ignore */ }

    const duration = 1850;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const raw = Math.min(1, elapsed / duration);
      let pathProgress: number;
      if (raw < 0.5) {
        const p1 = raw / 0.5;
        const eased1 = 1 - Math.pow(1 - p1, 3);
        pathProgress = startPos + eased1 * (peakPos - startPos);
      } else {
        const p2 = (raw - 0.5) / 0.5;
        const eased2 = p2 < 0.5 ? 2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 2) / 2;
        pathProgress = peakPos - eased2 * (peakPos - startPos);
      }

      const drawEase = 1 - Math.pow(1 - Math.min(1, raw * 1.35), 3);
      routePath.style.strokeDashoffset = String((1 - drawEase) * totalLen);
      positionBusAtProgress(pathProgress);

      if (raw < 1) {
        busRafRef.current = window.requestAnimationFrame(step);
      } else {
        busRafRef.current = null;
        routePath.style.strokeDashoffset = "0";
        positionBusAtProgress(startPos);
      }
    };

    busRafRef.current = window.requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetch("/api/health").then((response) => response.json()).then((value) => setHealth(value)).catch(() => setHealth({ voiceTranscriptionEnabled: false, spokenAnswersEnabled: false }));
    try {
      const stored = localStorage.getItem(RECENTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentRoute[];
        if (Array.isArray(parsed)) setRecent(parsed.filter((item) => typeof item.originId === "string" && typeof item.destinationId === "string").slice(0, 5));
      }
    } catch { /* Local route history is optional. */ }
    triggerHomeBusAnimation();
    return () => {
      mountedRef.current = false;
      if (busRafRef.current !== null) window.cancelAnimationFrame(busRafRef.current);
    };
  }, [triggerHomeBusAnimation]);

  useEffect(() => {
    const markReady = () => setVoiceAgentReady(true);
    if ((window as Window & { VoiceAssistant?: unknown }).VoiceAssistant) markReady();
    window.addEventListener("chennai:voice-assistant-ready", markReady);
    return () => window.removeEventListener("chennai:voice-assistant-ready", markReady);
  }, []);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setListenState("idle");
  }, []);

  const addRecentRoute = useCallback((found: SearchOutput) => {
    if (!found.origin || !found.destination) return;
    const entry: RecentRoute = { originId: found.origin.id, destinationId: found.destination.id, at: Date.now() };
    setRecent((current) => {
      const next = [entry, ...current.filter((item) => item.originId !== entry.originId || item.destinationId !== entry.destinationId)].slice(0, 5);
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
      return next;
    });
  }, []);

  const runSearch = useCallback(async (overrides?: { originId?: string; destinationId?: string; query?: string; targetView?: string }) => {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const requestId = ++searchSequence.current;
    setSearching(true);
    setSearchError("");
    setSpeechError("");
    setFilter("all");
    const activeQuery = overrides?.query ?? query;
    const selectedOrigin = overrides?.originId ?? originId;
    const selectedDestination = overrides?.destinationId ?? destinationId;
    const context = latestResult.current?.origin && latestResult.current.destination
      ? { originId: latestResult.current.origin.id, destinationId: latestResult.current.destination.id }
      : undefined;
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query: activeQuery,
          language: inputLanguage,
          ...(selectedOrigin ? { originId: selectedOrigin } : {}),
          ...(selectedDestination ? { destinationId: selectedDestination } : {}),
          ...(context ? { previousJourneyContext: context } : {}),
        }),
      });
      const data = await response.json();
      if (requestId !== searchSequence.current) return;
      if (!response.ok) {
        setSearchError(displayError(data.error?.code, data.error?.message || copy.providerError, copy));
        return;
      }
      const searchOut = data as SearchOutput;
      setResult(searchOut);
      if (searchOut.origin && searchOut.destination) {
        setOriginId(searchOut.origin.id);
        setDestinationId(searchOut.destination.id);
        setOriginText(uiLanguage === "ta" ? searchOut.origin.nameTa : searchOut.origin.nameEn);
        setDestinationText(uiLanguage === "ta" ? searchOut.destination.nameTa : searchOut.destination.nameEn);
      }
      if (overrides?.targetView) {
        setActiveNavigation(overrides.targetView);
      } else {
        setActiveNavigation("plan");
      }
      if (searchOut.status === "found") addRecentRoute(searchOut);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (requestId === searchSequence.current) setSearchError(copy.networkError);
    } finally {
      if (requestId === searchSequence.current) setSearching(false);
    }
  }, [query, originId, destinationId, inputLanguage, copy, addRecentRoute, uiLanguage]);

  useEffect(() => {
    const handleVoiceSearch = (event: Event) => {
      const detail = (event as CustomEvent<VoiceSearchDetail>).detail;
      if (!detail?.output || typeof detail.query !== "string") return;
      setQuery(detail.query);
      setHomeQuery(detail.query);
      setTranscriptReady(true);
      setInputLanguage(detail.language);
      setResult(detail.output);
      if (activeNavRef.current !== "home" && activeNavRef.current !== "voice") {
        setActiveNavigation("voice");
      }
      setSearchError("");
      setFilter("all");
      if (detail.output.origin && detail.output.destination) {
        setOriginId(detail.output.origin.id);
        setDestinationId(detail.output.destination.id);
        setOriginText(uiLanguage === "ta" ? detail.output.origin.nameTa : detail.output.origin.nameEn);
        setDestinationText(uiLanguage === "ta" ? detail.output.destination.nameTa : detail.output.destination.nameEn);
      }
      if (detail.output.status === "found") addRecentRoute(detail.output);
    };
    const handleVoiceState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; statusText?: string; transcript?: string }>).detail;
      if (!detail) return;
      if (detail.state === "recording") {
        setVoiceState("recording");
        setVoiceError(detail.statusText || "");
      } else if (detail.state === "transcribing") {
        setVoiceState("transcribing");
        setVoiceError(detail.statusText || "");
      } else if (detail.state === "speaking") {
        setVoiceState("idle");
        setListenState("playing");
        setVoiceError("");
      } else {
        setVoiceState("idle");
        setListenState("idle");
        setVoiceError("");
      }
      if (detail.transcript) {
        setHomeQuery(detail.transcript);
        setQuery(detail.transcript);
      }
    };
    window.addEventListener("chennai:voice-results", handleVoiceSearch);
    window.addEventListener("chennai:voice-state", handleVoiceState);
    return () => {
      window.removeEventListener("chennai:voice-results", handleVoiceSearch);
      window.removeEventListener("chennai:voice-state", handleVoiceState);
    };
  }, [addRecentRoute, uiLanguage]);

  useEffect(() => () => {
    searchAbort.current?.abort();
    if (audioRef.current) audioRef.current.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  const playAnswer = useCallback(async () => {
    if (listenState === "playing") {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
      cleanupAudio();
      return;
    }
    if (!result?.speechText) return;
    if (health?.spokenAnswersEnabled === false) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const voices = window.speechSynthesis.getVoices();
          const wantTamil = /[\u0B80-\u0BFF]/.test(result.speechText);
          const tamilVoice = voices.find((v) => /^ta/i.test(v.lang));
          const englishVoice =
            voices.find((v) => /en-IN|india/i.test(`${v.lang} ${v.name}`)) ??
            voices.find((v) => /^en/i.test(v.lang));
          const textToSpeak =
            wantTamil && !tamilVoice && result.answerEnglish
              ? result.answerEnglish.split("\n")[0]
              : result.speechText;
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          const chosenVoice = wantTamil && tamilVoice ? tamilVoice : englishVoice;
          if (chosenVoice) utterance.voice = chosenVoice;
          utterance.lang = chosenVoice?.lang ?? (/[\u0B80-\u0BFF]/.test(textToSpeak) ? "ta-IN" : "en-IN");
          setListenState("playing");
          utterance.onend = () => setListenState("idle");
          utterance.onerror = () => setListenState("idle");
          window.speechSynthesis.speak(utterance);
          return;
        } catch { /* fall through */ }
      }
      setSpeechError(copy.ttsUnavailable);
      return;
    }
    cleanupAudio();
    setSpeechError("");
    setListenState("loading");
    try {
      const response = await fetch("/api/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.speechText, language: inputLanguage }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setSpeechError(displayError(data.error?.code, copy.ttsFailed, copy));
        setListenState("idle");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => cleanupAudio();
      audio.onerror = () => { setSpeechError(copy.ttsFailed); cleanupAudio(); };
      await audio.play();
      setListenState("playing");
    } catch {
      setSpeechError(copy.ttsFailed);
      cleanupAudio();
    }
  }, [cleanupAudio, copy, health?.spokenAnswersEnabled, inputLanguage, listenState, result]);

  const chooseOrigin = (place: Place) => { setOriginId(place.id); setOriginText(uiLanguage === "ta" ? place.nameTa : place.nameEn); };
  const chooseDestination = (place: Place) => { setDestinationId(place.id); setDestinationText(uiLanguage === "ta" ? place.nameTa : place.nameEn); };

  const navigation = uiLanguage === "ta"
    ? [{ id: "home", label: "முகப்பு", short: "முகப்பு", icon: "home" }, { id: "features", label: "அம்சங்கள்", short: "அம்சங்கள்", icon: "features" }, { id: "plan", label: "பயணத் திட்டம்", short: "திட்டம்", icon: "route" }, { id: "explore", label: "வரைபடம்", short: "வரைபடம்", icon: "pin" }, { id: "voice", label: "குரல் உதவியாளர்", short: "குரல்", icon: "mic" }, { id: "about", label: "தகவல்", short: "தகவல்", icon: "about" }]
    : [{ id: "home", label: "Home", short: "Home", icon: "home" }, { id: "features", label: "Features", short: "Features", icon: "features" }, { id: "plan", label: "Plan Journey", short: "Plan", icon: "route" }, { id: "explore", label: "Explore Map", short: "Map", icon: "pin" }, { id: "voice", label: "Voice Assistant", short: "Voice", icon: "mic" }, { id: "about", label: "About", short: "About", icon: "about" }];

  const navigateTo = (section: string) => {
    setActiveNavigation(section);
    if (section === "features" || section === "about") {
      window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (section === "home") {
        window.setTimeout(() => triggerHomeBusAnimation(), 60);
      }
    }
  };

  const runVoiceSearch = async () => { await runSearch({ targetView: "voice" }); };
  const runVoiceSearchWithPlaces = async (from?: string, to?: string) => {
    await runSearch({ originId: from ?? "", destinationId: to ?? "", targetView: "voice" });
  };
  const runHomeAssistantQuery = async (textToAsk?: string) => {
    const q = (textToAsk ?? homeQuery).trim();
    if (!q) return;
    setQuery(q);
    setHomeQuery(q);
    const assistant = (window as Window & { VoiceAssistant?: { say: (text: string) => void; setLang: (lang: Language) => void } }).VoiceAssistant;
    if (assistant) {
      assistant.setLang(inputLanguage);
      assistant.say(q);
      return;
    }
    await runSearch({ query: q, originId: "", destinationId: "", targetView: "home" });
  };

  const setUiLang = (language: Language) => {
    setUiLanguage(language);
    setInputLanguage(language);
    const assistant = (window as Window & { VoiceAssistant?: { setLang: (lang: Language) => void } }).VoiceAssistant;
    assistant?.setLang(language);
  };

  const toggleVoiceAssistant = () => {
    const assistant = (window as Window & { VoiceAssistant?: { toggle: () => void; setLang: (lang: Language) => void } }).VoiceAssistant;
    assistant?.setLang(inputLanguage);
    assistant?.toggle();
  };

  const routes = result?.journeys ?? [];
  const knownFares = routes.map((journey) => journey.totalFareINR).filter((value): value is number => value !== null);
  const knownTimes = routes.map((journey) => journey.estimatedDurationMinutes).filter((value): value is number => value !== null);
  const lowestFare = knownFares.length ? Math.min(...knownFares) : null;
  const shortestTime = knownTimes.length ? Math.min(...knownTimes) : null;
  const visibleRoutes = useMemo(() => {
    if (filter === "cheapest" && lowestFare !== null) return routes.filter((journey) => journey.totalFareINR === lowestFare);
    if (filter === "fastest" && shortestTime !== null) return routes.filter((journey) => journey.estimatedDurationMinutes === shortestTime);
    return routes;
  }, [filter, routes, lowestFare, shortestTime]);
  const selectedJourney = visibleRoutes.find((journey) => journey.id === selectedJourneyId) ?? visibleRoutes[0] ?? null;
  const mapSegments = useMemo(() => selectedJourney
    ? selectedJourney.legs.map((leg) => ROUTE_MAP[`${leg.mode}:${leg.originId}:${leg.destinationId}`]).filter((geometry): geometry is RouteMapGeometry => Boolean(geometry))
    : [], [selectedJourney]);
  const selectedOriginId = selectedJourney?.originId ?? result?.origin?.id;
  const selectedDestinationId = selectedJourney?.destinationId ?? result?.destination?.id;
  const routeOriginCoords = selectedOriginId ? PLACE_COORDS[selectedOriginId] : undefined;
  const routeDestinationCoords = selectedDestinationId ? PLACE_COORDS[selectedDestinationId] : undefined;
  const routeOriginPoint = routeOriginCoords ? { lat: routeOriginCoords[0], lon: routeOriginCoords[1], label: placeName(selectedOriginId!, uiLanguage) } : undefined;
  const routeDestinationPoint = routeDestinationCoords ? { lat: routeDestinationCoords[0], lon: routeDestinationCoords[1], label: placeName(selectedDestinationId!, uiLanguage) } : undefined;

  const examples = uiLanguage === "en"
    ? ["Perungudi to Guindy", "pergunidi to gunidy has bus and metro or not", "Chennai Central to Airport", "Egmore to Tambaram", "Guindy to CMBT"]
    : ["பெருங்குடியிலிருந்து கிண்டிக்கு பஸ் இருக்கா மெட்ரோ இருக்கா?", "பெருங்குடியிலிருந்து கிண்டிக்கு எப்படிச் செல்வது?", "சென்ட்ரல் இருந்து விமான நிலையம்", "எழும்பூர் இருந்து தாம்பரம்", "கிண்டி முதல் கோயம்பேடு வரை"];

  const quickPairs: Array<{ labelEn: string; labelTa: string; fromId: string; toId: string }> = [
    { labelEn: "Perungudi → Guindy", labelTa: "பெருங்குடி → கிண்டி", fromId: "perungudi", toId: "guindy" },
    { labelEn: "Central → Airport", labelTa: "சென்ட்ரல் → விமான நிலையம்", fromId: "chennai-central", toId: "chennai-airport" },
    { labelEn: "Egmore → Tambaram", labelTa: "எழும்பூர் → தாம்பரம்", fromId: "egmore", toId: "tambaram" },
  ];

  const filteredPlaces = PLACES.filter((place) =>
    `${place.nameEn} ${place.nameTa} ${place.aliases.join(" ")}`.toLocaleLowerCase().includes(exploreQuery.trim().toLocaleLowerCase()),
  );
  const homeVisible = activeNavigation === "home" || activeNavigation === "features" || activeNavigation === "about";
  const exploreCoords = exploreSelection ? PLACE_COORDS[exploreSelection.id] : undefined;
  const exploreMapPoint = exploreSelection && exploreCoords
    ? { lat: exploreCoords[0], lon: exploreCoords[1], label: uiLanguage === "ta" ? exploreSelection.nameTa : exploreSelection.nameEn }
    : undefined;

  const featureItems = [
    { icon: "mic", tone: "mint", title: "Voice-first interaction", body: "Speak or type your question. Namma listens with speech recognition and answers aloud with instant text fallback." },
    { icon: "spark", tone: "peach", title: "English & தமிழ்", body: "Switch seamlessly between English (en-IN) and தமிழ் (ta-IN) for both listening and speaking at any time." },
    { icon: "route", tone: "ice", title: "Journey planning", body: "Search places, swap start and destination, and compare direct and transfer routes across GTFS feeds." },
    { icon: "bus", tone: "mint", title: "Bus, Metro & Suburban Rail", body: "Automatically checks whether MTC Bus, Chennai Metro, and Southern Railway Suburban Train are available on your route." },
    { icon: "pin", tone: "peach", title: "Interactive Chennai map", body: "Pan, zoom, and tap stops on the interactive map; selected routes are drawn leg by leg across the city." },
    { icon: "shield", tone: "ice", title: "Accessible by design", body: "Keyboard friendly, screen-reader labels, text fallback for voice, and reduced-motion support." },
  ];

  return (
    <>
      <Script
        src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        strategy="afterInteractive"
        onReady={() => setLeafletReady(true)}
        onError={() => setLeafletFailed(true)}
      />
      <a className="skip" href="#main">Skip to content</a>

      {/* RESPONSIVE SITE NAVIGATION (Desktop Left Sidebar / Mobile Bottom Bar) */}
      <header className="site-header">
        <div className="wrap nav-inner">
          <a className="brand" href="#home" aria-label="Namma Mobility home" onClick={(event) => { event.preventDefault(); navigateTo("home"); }}>
            <span className="brand-mark"><Icon name="mark" size={22}/></span>
            namma mobility
          </a>
          <nav className="tabs" aria-label={uiLanguage === "ta" ? "பக்கங்கள்" : "Sections"}>
            {navigation.map((item, index) => (
              <a
                key={item.id}
                className={"tab" + (activeNavigation === item.id ? " active" : "")}
                href={"#" + item.id}
                aria-current={activeNavigation === item.id ? "page" : undefined}
                onClick={(event) => { event.preventDefault(); navigateTo(item.id); }}
              >
                <span className={"tab-icon tint-" + (index % 4)}><Icon name={item.icon} size={18}/></span>
                <span className="l">{item.label}</span>
                <span className="s">{item.short}</span>
              </a>
            ))}
          </nav>
          <button className="btn nav-cta" type="button" onClick={() => navigateTo("voice")}>
            <Icon name="mic" size={19}/>Meet Namma
          </button>
        </div>
      </header>

      <main id="main">
        {/* HOME VIEW CONTAINER (Includes #home, Home Voice Assistant, #features, How It Works, and #about) */}
        <div id="v-home" hidden={!homeVisible}>
          <section className="hero" id="home" aria-labelledby="hero-title">
            <div className="wrap">
              <div className="hero-grid">
                <div className="hero-copy">
                  <p className="badge mint">
                    <span className="bus-live-indicator"><i/> GTFS CONNECTED</span> MADE FOR CHENNAI. MADE FOR YOU.
                  </p>
                  <h1 id="hero-title">Your Voice. Your City.<span>Your Journey.</span></h1>
                  <p className="lead">
                    A voice-first Chennai public transport assistant. Ask in English or தமிழ். Plan multi-modal trips and explore MTC buses, Chennai Metro, and suburban rail routes.
                  </p>
                  <div className="actions">
                    <button className="btn" type="button" onClick={() => navigateTo("voice")}>
                      <Icon name="mic" size={19}/>Explore Assistant
                    </button>
                    <button className="btn secondary" type="button" onClick={() => navigateTo("plan")}>
                      <Icon name="route" size={19}/>Plan Journey
                    </button>
                  </div>
                  <p className="small">
                    <b>Prototype.</b> Routes and scheduled ride segments come from the supplied Chennai Bus, Metro, and Suburban Rail GTFS feeds. No live times or fares.
                  </p>
                </div>

                {/* ILLUSTRATED CHENNAI CITY CARD WITH PATH-FOLLOWING ANIMATED BUS */}
                <div className="city-card">
                  <div className="city-top">
                    <p className="eyebrow">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)" }}/> CHENNAI, LET’S GO.
                    </p>
                    <span className="badge white">Bus · Metro · Suburban</span>
                  </div>
                  <div className="city-art" role="img" aria-label="Animated Chennai bus navigating between bus stops and Metro stations">
                    <svg id="cityTrackSvg" xmlns="http://www.w3.org/2000/svg" width="500" height="310" viewBox="0 0 500 310">
                      <circle cx="377" cy="74" r="51" fill="#F47762" opacity="0.88"/>
                      <path d="M-10 107C75 46 126 148 202 78S365 33 515 137M-10 224C109 158 186 269 290 193S428 153 512 221" fill="none" stroke="#BCE3D2" strokeWidth="2" strokeDasharray="6 8"/>
                      <path d="M37 230V171H85V145H110V230M130 230V123H170V230M333 230V136H362V230M402 230V158H448V230" fill="#B8DFCB" opacity="0.9"/>
                      <path d="M175 232V150H194V113L211 94L228 113V150H246V232Z" fill="#EFA28A"/>
                      <path d="M188 150H233M188 163H233M188 176H233" stroke="#FFFDF8" strokeWidth="4"/>
                      <circle cx="211" cy="128" r="10" fill="#FFFDF8"/>
                      <path d="M211 122V128L215 132" fill="none" stroke="#143D42" strokeWidth="2"/>

                      <path d="M65 267C120 267 119 204 190 204H296C351 204 349 116 426 116" fill="none" stroke="#BCE3D2" strokeWidth="12" strokeLinecap="round"/>
                      <path ref={cityRoutePathRef} id="cityRoutePath" d="M65 267C120 267 119 204 190 204H296C351 204 349 116 426 116" fill="none" stroke="#087F73" strokeWidth="8" strokeLinecap="round"/>
                      <g fill="#FFFDF8" stroke="#087F73" strokeWidth="4">
                        <circle cx="65" cy="267" r="8"/>
                        <circle cx="240" cy="204" r="8"/>
                        <circle cx="426" cy="116" r="8"/>
                      </g>

                      <g transform="translate(272 118) rotate(-8)">
                        <rect width="142" height="56" rx="14" fill="#FFFDF8" stroke="#143D42" strokeWidth="2"/>
                        <path d="M0 42H142" stroke="#336CE6" strokeWidth="7"/>
                        <rect x="12" y="9" width="25" height="21" rx="5" fill="#B8D4EC"/>
                        <rect x="45" y="9" width="25" height="21" rx="5" fill="#B8D4EC"/>
                        <rect x="78" y="9" width="25" height="21" rx="5" fill="#B8D4EC"/>
                        <path d="M113 9H127Q135 9 135 21V30H113Z" fill="#143D42"/>
                        <circle cx="27" cy="56" r="7" fill="#143D42"/>
                        <circle cx="115" cy="56" r="7" fill="#143D42"/>
                      </g>

                      <g ref={cityBusGroupRef} id="cityBusGroup" transform="translate(95, 255)">
                        <g transform="translate(-55, -48)">
                          <rect width="110" height="50" rx="11" fill="#F47762" stroke="#143D42" strokeWidth="2"/>
                          <rect x="8" y="7" width="18" height="18" rx="4" fill="#FFE8DF"/>
                          <rect x="32" y="7" width="18" height="18" rx="4" fill="#FFE8DF"/>
                          <rect x="56" y="7" width="18" height="18" rx="4" fill="#FFE8DF"/>
                          <rect x="82" y="7" width="18" height="35" rx="3" fill="#143D42"/>
                          <circle cx="22" cy="50" r="7.5" fill="#143D42"/>
                          <circle cx="88" cy="50" r="7.5" fill="#143D42"/>
                          <path d="M8 35H74" stroke="#FFE8DF" strokeWidth="2.5"/>
                        </g>
                      </g>

                      <path d="M447 255V208M447 219Q425 195 419 211M447 219Q467 194 477 210M447 219Q454 186 440 191" fill="none" stroke="#087F73" strokeWidth="5" strokeLinecap="round"/>
                      <path d="M0 293H500" stroke="#A6D5BE" strokeWidth="2"/>
                    </svg>
                  </div>
                  <div className="question">
                    <div className="question-left">
                      <Icon name="mic" size={20}/>
                      <span>“How do I get from Central to the Airport?”</span>
                    </div>
                    <button type="button" className="replay-bus-btn" id="replayBusBtn" title="Replay bus route animation" onClick={triggerHomeBusAnimation}>
                      ↻ Replay Bus
                    </button>
                  </div>
                </div>
              </div>

              <div className="trust">
                <p>YOUR VOICE. YOUR CITY. YOUR JOURNEY.</p>
                <span className="trust-item"><Icon name="bus" size={22}/>MTC Bus</span>
                <span className="trust-item"><Icon name="metro" size={22}/>Chennai Metro</span>
                <span className="trust-item"><Icon name="train" size={22}/>Suburban Rail</span>
                <span className="trust-item"><Icon name="spark" size={22}/>English + தமிழ்</span>
              </div>
            </div>
          </section>

          {/* INTEGRATED HOME VOICE ASSISTANT SECTION */}
          <section className="home-voice-section" aria-labelledby="homeVoiceTitle">
            <div className="wrap">
              <div className="voice-hero-card">
                <div className="vh-header">
                  <div className="vh-title-group">
                    <span className="eyebrow" style={{ color: "var(--mint)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }}/> VOICE ASSISTANT ON HOME
                    </span>
                    <h2 id="homeVoiceTitle">{copy.homeVoiceTitle}</h2>
                    <p id="homeVoiceSubtitle">{copy.homeVoiceSub}</p>
                  </div>
                  <div className="lang-selector" role="group" aria-label="Select Assistant Language">
                    <button type="button" className="lang-toggle-btn" aria-pressed={uiLanguage === "en"} onClick={() => setUiLang("en")}>English</button>
                    <button type="button" className="lang-toggle-btn" aria-pressed={uiLanguage === "ta"} onClick={() => setUiLang("ta")}>தமிழ்</button>
                  </div>
                </div>

                <div className="vh-body">
                  <div className="vh-mic-cluster">
                    <button
                      className={`hero-mic-btn${voiceState === "recording" ? " listening" : listenState === "playing" ? " speaking" : ""}`}
                      id="homeHeroMic"
                      type="button"
                      aria-label={copy.record}
                      onClick={toggleVoiceAssistant}
                    >
                      <Icon name="mic" size={38}/>
                    </button>
                    <div className="vh-mic-status" id="homeVoiceStatus" role="status" aria-live="polite">
                      {voiceError ? voiceError : searching ? copy.searching : voiceAgentReady ? copy.recordHint : copy.agentLoading}
                    </div>
                    <div className="vh-mic-hint" id="homeVoiceCap">{copy.recordingNotice}</div>
                  </div>

                  <div className="vh-chat-box">
                    <div className="vh-response-panel" id="homeResponsePanel" role="log" aria-live="polite">
                      {!result && (
                        <div className="vh-bubble assistant" id="homeInitialGreeting">
                          {copy.homeGreet}
                        </div>
                      )}
                      {result && (
                        <>
                          {query && <div className="vh-bubble user">{query}</div>}
                          <div className="vh-bubble assistant">
                            {result.status === "found" && routes.length > 0 && (
                              <RouteModeSummary journeys={routes} language={uiLanguage === "ta" || inputLanguage === "ta" ? "ta" : "en"} dark />
                            )}
                            {(uiLanguage === "ta" || inputLanguage === "ta") ? (
                              <>
                                {result.answerTamil && <div className="answer-tamil" style={{ whiteSpace: "pre-line" }}>{result.answerTamil}</div>}
                                {result.answerEnglish && <div style={{ marginTop: 8, opacity: 0.88, whiteSpace: "pre-line", fontSize: "13.5px" }}>{result.answerEnglish}</div>}
                              </>
                            ) : (
                              <>
                                {result.answerEnglish && <div style={{ whiteSpace: "pre-line" }}>{result.answerEnglish}</div>}
                                {result.answerTamil && <div className="answer-tamil" style={{ marginTop: 8, opacity: 0.92, whiteSpace: "pre-line" }}>{result.answerTamil}</div>}
                              </>
                            )}
                            {!result.answerEnglish && !result.answerTamil && result.answer && <div style={{ whiteSpace: "pre-line" }}>{result.answer}</div>}
                            <div className="vh-route-actions">
                              {routes.length > 0 && (
                                <button type="button" className="btn sm" onClick={() => navigateTo("plan")}>
                                  <Icon name="route" size={16}/>{copy.openInPlan}
                                </button>
                              )}
                              {result.speechText && (
                                <button type="button" className="listen-button" onClick={() => void playAnswer()} disabled={listenState === "loading"}>
                                  <Icon name={listenState === "playing" ? "stop" : "speaker"} size={14}/>
                                  {listenState === "loading" ? copy.preparingAudio : listenState === "playing" ? copy.stopPlayback : copy.listen}
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                      {searchError && <div className="note error">{searchError}</div>}
                    </div>

                    <form
                      className="vh-input-form"
                      id="homeAskForm"
                      autoComplete="off"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void runHomeAssistantQuery();
                      }}
                    >
                      <input
                        id="homeAskIn"
                        value={homeQuery}
                        onChange={(event) => setHomeQuery(event.target.value)}
                        placeholder={copy.queryPlaceholder}
                        aria-label="Type your transit question"
                      />
                      <button type="submit" id="homeAskBtn" disabled={searching}>
                        {searching ? copy.searching : "Ask Namma"}
                      </button>
                    </form>

                    <div className="vh-quick-prompts" id="homePromptContainer">
                      <span>{copy.examples}</span>
                      {examples.map((example) => (
                        <button
                          key={example}
                          type="button"
                          className="vh-prompt-chip"
                          onClick={() => void runHomeAssistantQuery(example)}
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FEATURES SECTION */}
          <section className="section features" id="features" aria-labelledby="features-title">
            <div className="wrap">
              <p className="eyebrow">LESS SEARCHING. MORE GOING.</p>
              <h2 className="section-title" id="features-title">Big city. Simple conversations.</h2>
              <div className="feature-grid">
                {featureItems.map((feature, index) => (
                  <article className={"feature " + feature.tone} key={feature.title}>
                    <div className="feature-top">
                      <Icon name={feature.icon} size={30}/>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* HOW IT WORKS SECTION */}
          <section className="how" aria-labelledby="how-title">
            <div className="wrap">
              <p className="eyebrow">FROM “HOW?” TO “LET’S GO.”</p>
              <h2 className="section-title" id="how-title">One question. A clearer journey.</h2>
              <div className="steps">
                <article>
                  <span className="badge mint">01</span>
                  <h3>Ask naturally</h3>
                  <p>Speak or type a question in English or தமிழ்.</p>
                </article>
                <article>
                  <span className="badge peach">02</span>
                  <h3>Namma works it out</h3>
                  <p>The app matches places and checks Bus, Metro, and Suburban Rail routes from the supplied GTFS feeds.</p>
                </article>
                <article>
                  <span className="badge ice">03</span>
                  <h3>Travel with clarity</h3>
                  <p>Read or hear a short answer, then open it on the map. Always verify real travel details officially.</p>
                </article>
              </div>
            </div>
          </section>

          {/* ABOUT SECTION */}
          <section className="about" id="about" aria-labelledby="about-title">
            <div className="wrap about-grid">
              <div>
                <p className="eyebrow">NAMMA MEANS OURS.</p>
                <h2 id="about-title">Our city deserves a friendlier way to move.</h2>
              </div>
              <div className="about-copy">
                <p>Chennai’s transport information is spread across apps, maps and notices. Namma Mobility explores a simpler front door: ask in your language, get a short answer and feel more confident about your next step.</p>
                <p>Voice-first matters because many commuters are more comfortable speaking than typing, and more comfortable in Tamil than in English. Namma supports both, with a reliable text fallback.</p>
                <p className="small">A student concept for the CUMTA × Easwari Startup Peravai Mobility Hackathon 2026. Not an official transport service.</p>
                <h3 className="svc-h">Where the app services connect</h3>
                <ul className="svc" id="svcList">
                  <li><span>Journey search (Bus, Metro, Suburban)</span><code>/api/search</code></li>
                  <li><span>Conversational voice &amp; mode checker</span><code>/api/chat</code></li>
                  <li><span>Voice transcription (Groq Whisper)</span><code>/api/transcribe</code></li>
                  <li><span>Spoken answers (Sarvam TTS)</span><code>/api/speak</code></li>
                  <li><span>Chennai GTFS routes &amp; map geometry</span><code>data/gtfs-journeys.json</code></li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        {/* PLAN JOURNEY VIEW */}
        <section id="plan" className="view view-animate" hidden={activeNavigation !== "plan"} aria-labelledby="plan-title">
          <div className="wrap">
            <div className="view-head">
              <p className="eyebrow">PLAN A JOURNEY</p>
              <h2 id="plan-title">Where to, Chennai?</h2>
            </div>
            <div className="split">
              <div className="side">
                <section className="form plan-card" aria-labelledby="plan-form-title">
                  <div className="chat-top">
                    <h3 id="plan-form-title">{copy.panelTitle}</h3>
                    <div className="input-language" role="group" aria-label={copy.chooseLanguage}>
                      <button type="button" aria-pressed={inputLanguage === "ta"} onClick={() => setUiLang("ta")}>தமிழ்</button>
                      <button type="button" aria-pressed={inputLanguage === "en"} onClick={() => setUiLang("en")}>English</button>
                    </div>
                  </div>

                  <div className="chips" aria-label="Quick sample routes">
                    {quickPairs.map((pair) => (
                      <button
                        key={pair.fromId + "-" + pair.toId}
                        type="button"
                        className="chip"
                        onClick={() => {
                          const from = PLACES.find((p) => p.id === pair.fromId);
                          const to = PLACES.find((p) => p.id === pair.toId);
                          if (!from || !to) return;
                          chooseOrigin(from);
                          chooseDestination(to);
                          setQuery("");
                          void runSearch({ originId: from.id, destinationId: to.id, query: "", targetView: "plan" });
                        }}
                      >
                        {uiLanguage === "ta" ? pair.labelTa : pair.labelEn}
                      </button>
                    ))}
                  </div>

                  <label className="field-label" htmlFor="plan-question">{transcriptReady ? copy.transcriptReady : copy.questionLabel}</label>
                  <textarea
                    id="plan-question"
                    className="question-input"
                    value={query}
                    placeholder={copy.queryPlaceholder}
                    onChange={(event) => { setQuery(event.target.value); setTranscriptReady(false); }}
                  />
                  <p className="transcript-note">{copy.typeHint}</p>

                  <div className="route-fields">
                    <div className="route-fields-head">
                      <h3>{copy.routeFields}</h3>
                      <button
                        className="swap"
                        type="button"
                        aria-label={copy.swap}
                        title={copy.swap}
                        onClick={() => {
                          setOriginId(destinationId);
                          setDestinationId(originId);
                          setOriginText(destinationText);
                          setDestinationText(originText);
                        }}
                      >
                        ⇅ Swap stops
                      </button>
                    </div>
                    <PlaceAutocomplete
                      label={copy.origin}
                      placeholder={copy.originPlaceholder}
                      value={originText}
                      selectedId={originId}
                      onChange={(value) => { setOriginText(value); setOriginId(""); }}
                      onSelect={chooseOrigin}
                      destination={false}
                      copy={copy}
                      language={uiLanguage}
                    />
                    <PlaceAutocomplete
                      label={copy.destination}
                      placeholder={copy.destinationPlaceholder}
                      value={destinationText}
                      selectedId={destinationId}
                      onChange={(value) => { setDestinationText(value); setDestinationId(""); }}
                      onSelect={chooseDestination}
                      destination
                      copy={copy}
                      language={uiLanguage}
                    />
                  </div>

                  <div className="examples-block">
                    <p className="examples-heading">{copy.examples}</p>
                    <div className="example-chips">
                      {examples.map((example) => (
                        <button key={example} className="example-chip" type="button" onClick={() => { setQuery(example); setTranscriptReady(false); }}>
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="search-actions">
                    <button className="btn" type="button" onClick={() => void runSearch({ targetView: "plan" })} disabled={searching}>
                      <Icon name="search" size={18}/>{searching ? copy.searching : copy.search}
                    </button>
                    <button className="btn secondary" type="button" onClick={toggleVoiceAssistant}>
                      <Icon name="mic" size={18}/>Voice
                    </button>
                  </div>

                  {searchError && <div className="notice-banner error" role="alert">{searchError}</div>}

                  <div className="recent-block">
                    <div className="recent-head">
                      <h3>{copy.recent}</h3>
                      {recent.length > 0 && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setRecent([]);
                            try { localStorage.removeItem(RECENTS_KEY); } catch { /* optional */ }
                          }}
                        >
                          {copy.clear}
                        </button>
                      )}
                    </div>
                    {recent.length ? (
                      <div className="recent-list">
                        {recent.map((item) => (
                          <button
                            className="recent-item"
                            type="button"
                            key={item.originId + "-" + item.destinationId + "-" + item.at}
                            onClick={() => {
                              const from = PLACES.find((place) => place.id === item.originId);
                              const to = PLACES.find((place) => place.id === item.destinationId);
                              if (!from || !to) return;
                              chooseOrigin(from);
                              chooseDestination(to);
                              setQuery("");
                              void runSearch({ originId: from.id, destinationId: to.id, query: "", targetView: "plan" });
                            }}
                          >
                            {placeName(item.originId, uiLanguage)} → {placeName(item.destinationId, uiLanguage)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="transcript-note">{copy.noRecent}</p>
                    )}
                  </div>
                </section>

                <section className="card plan-output" aria-labelledby="results-title" aria-busy={searching}>
                  <h3 id="results-title">{copy.results}</h3>
                  <p className="small">{copy.resultsHint}</p>
                  {searchError && <div className="notice-banner error" role="alert">{searchError}</div>}
                  {!result && <div className="note empty">{copy.emptyBody}</div>}
                  {result && (
                    <>
                      <div className="note">
                        {result.status === "found" ? copy.feedDisclaimer : result.status === "unavailable" ? copy.unavailable : result.answer || ""}
                      </div>
                      {result.status === "found" && routes.length > 0 && (
                        <RouteModeSummary journeys={routes} language={uiLanguage === "ta" || inputLanguage === "ta" ? "ta" : "en"} />
                      )}
                      {result.answerEnglish && (
                        <div className="answer-card">
                          {(uiLanguage === "ta" || inputLanguage === "ta") ? (
                            <>
                              <p className="answer-tamil" style={{ whiteSpace: "pre-line", marginTop: 0 }}>{result.answerTamil}</p>
                              <p style={{ whiteSpace: "pre-line", marginTop: 8 }}>{result.answerEnglish}</p>
                            </>
                          ) : (
                            <>
                              <p style={{ whiteSpace: "pre-line" }}>{result.answerEnglish}</p>
                              <p className="answer-tamil" style={{ whiteSpace: "pre-line" }}>{result.answerTamil}</p>
                            </>
                          )}
                          <button className="listen-button" type="button" onClick={() => void playAnswer()} disabled={listenState === "loading"}>
                            <Icon name={listenState === "playing" ? "stop" : "speaker"} size={16}/>
                            {listenState === "loading" ? copy.preparingAudio : listenState === "playing" ? copy.stopPlayback : copy.listen}
                          </button>
                          {speechError && <p className="speech-status" role="status">{speechError}</p>}
                        </div>
                      )}
                      {result.status === "clarification" && (
                        <div className="chips" role="group" aria-label={copy.routeSelect}>
                          {result.clarificationOptions.map((place) => (
                            <button
                              className="chip"
                              type="button"
                              key={place.id}
                              onClick={() => {
                                const field = result.clarificationField;
                                const nextOrigin = field === "destination" ? originId : place.id;
                                const nextDestination = field === "destination" ? place.id : destinationId;
                                if (field === "destination") chooseDestination(place);
                                else chooseOrigin(place);
                                void runSearch({ originId: nextOrigin || undefined, destinationId: nextDestination || undefined, targetView: "plan" });
                              }}
                            >
                              {uiLanguage === "ta" ? place.nameTa : place.nameEn}
                            </button>
                          ))}
                        </div>
                      )}
                      {routes.length > 0 && (
                        <>
                          <div className="results-toolbar">
                            <span className="results-count">{visibleRoutes.length} {copy.routes}</span>
                            <div className="filter-group" role="group" aria-label={uiLanguage === "ta" ? "வழி வடிகட்டி" : "Filter journeys"}>
                              <button className="filter-button" type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{copy.all}</button>
                              <button className="filter-button" type="button" aria-pressed={filter === "cheapest"} disabled={lowestFare === null} onClick={() => setFilter("cheapest")}>{copy.cheapest}</button>
                              <button className="filter-button" type="button" aria-pressed={filter === "fastest"} onClick={() => setFilter("fastest")}>{copy.fastest}</button>
                            </div>
                          </div>
                          <div className="journey-list">
                            {visibleRoutes.map((journey) => (
                              <JourneyCard
                                key={journey.id}
                                journey={journey}
                                result={result}
                                language={uiLanguage}
                                copy={copy}
                                cheapest={lowestFare !== null && journey.totalFareINR === lowestFare}
                                fastest={shortestTime !== null && journey.estimatedDurationMinutes === shortestTime}
                                selected={selectedJourney?.id === journey.id}
                                onShowOnMap={() => setSelectedJourneyId(journey.id)}
                                onListen={() => void playAnswer()}
                                listenState={listenState}
                                speechAvailable={true}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </section>
              </div>

              <div className="mapslot">
                <div className="map-caption">
                  <strong>{selectedJourney ? `${placeName(selectedJourney.originId, uiLanguage)} → ${placeName(selectedJourney.destinationId, uiLanguage)}` : "Chennai"}</strong>
                  <span>{copy.mapNote}</span>
                </div>
                <TransitMap
                  active={activeNavigation === "plan"}
                  ready={leafletReady}
                  failed={leafletFailed}
                  segments={mapSegments}
                  origin={routeOriginPoint}
                  destination={routeDestinationPoint}
                  language={uiLanguage}
                />
              </div>
            </div>
          </div>
        </section>

        {/* EXPLORE MAP VIEW */}
        <section id="explore" className="view view-animate" hidden={activeNavigation !== "explore"} aria-labelledby="explore-title">
          <div className="wrap">
            <div className="view-head">
              <p className="eyebrow">EXPLORE THE MAP</p>
              <h2 id="explore-title">Stops across the city</h2>
            </div>
            <div className="split">
              <div className="side">
                <label className="sr-only" htmlFor="explore-search">Search locations</label>
                <input
                  id="explore-search"
                  className="qin"
                  type="search"
                  value={exploreQuery}
                  placeholder="Search a stop or area (e.g. Guindy, Perungudi, CMBT)..."
                  onChange={(event) => setExploreQuery(event.target.value)}
                />
                <div className="chips">
                  <button type="button" className="chip" aria-pressed="true">MTC Bus · Metro · Suburban Rail</button>
                </div>
                <div className="note">Place pins use the supplied GTFS station coordinates across Chennai.</div>
                {exploreSelection && (
                  <div className="explore-selection">
                    <h3>{uiLanguage === "ta" ? exploreSelection.nameTa : exploreSelection.nameEn}</h3>
                    <p>{uiLanguage === "ta" ? exploreSelection.nameEn : exploreSelection.nameTa}</p>
                    <div className="explore-selection-actions">
                      <button className="btn sm" type="button" onClick={() => { chooseOrigin(exploreSelection); navigateTo("plan"); }}>
                        Plan from {uiLanguage === "ta" ? exploreSelection.nameTa : exploreSelection.nameEn}
                      </button>
                      <button className="btn secondary sm" type="button" onClick={() => { chooseDestination(exploreSelection); navigateTo("plan"); }}>
                        Set as Destination
                      </button>
                    </div>
                  </div>
                )}
                <div className="list">
                  {filteredPlaces.map((place) => (
                    <button
                      type="button"
                      key={place.id}
                      className={exploreSelection?.id === place.id ? "on" : ""}
                      onClick={() => setExploreSelection(place)}
                    >
                      <strong>{uiLanguage === "ta" ? place.nameTa : place.nameEn}</strong>
                      <small className="suggestion-ta">{uiLanguage === "ta" ? place.nameEn : place.nameTa}</small>
                    </button>
                  ))}
                  {filteredPlaces.length === 0 && <p className="note empty">No matching places.</p>}
                </div>
              </div>
              <div className="mapslot">
                <div className="map-caption">
                  <strong>{exploreSelection ? (uiLanguage === "ta" ? exploreSelection.nameTa : exploreSelection.nameEn) : "Chennai"}</strong>
                  <span>OpenStreetMap · GTFS mapped location</span>
                </div>
                <TransitMap
                  active={activeNavigation === "explore"}
                  ready={leafletReady}
                  failed={leafletFailed}
                  selectedPlace={exploreMapPoint}
                  language={uiLanguage}
                />
              </div>
            </div>
          </div>
        </section>

        {/* DEDICATED VOICE ASSISTANT VIEW */}
        <section id="voice" className="view view-animate" hidden={activeNavigation !== "voice"} aria-labelledby="voice-title">
          <div className="wrap">
            <div className="assistant-heading">
              <div>
                <p className="eyebrow">VOICE ASSISTANT</p>
                <h2 id="voice-title">Vanakkam, Chennai.</h2>
              </div>
              <p>Ask by voice or text in English or தமிழ். Recognition and speech use your browser &amp; connected voice API; answers check Bus, Metro, and Suburban Rail GTFS routes.</p>
            </div>
            <div className="assistant-shell">
              <aside className="companion" aria-label="Voice controls">
                <span className="badge mint">NAMMA</span>
                <svg id="avatar" viewBox="0 0 120 120" role="img" aria-label="Namma, the friendly voice assistant">
                  <defs><clipPath id="avatarClip"><circle cx="60" cy="60" r="58"/></clipPath></defs>
                  <g clipPath="url(#avatarClip)">
                    <rect width="120" height="120" fill="#E7EEFF"/>
                    <path d="M8 124C10 98 34 92 60 92s50 6 52 32Z" fill="#AEEFD3"/>
                    <path d="M45 92Q60 106 75 92" stroke="#fff" strokeWidth="6" fill="none"/>
                    <rect x="52" y="76" width="16" height="20" fill="#F4B99C"/>
                    <circle cx="33" cy="54" r="5.5" fill="#FAD3BC"/>
                    <circle cx="87" cy="54" r="5.5" fill="#FAD3BC"/>
                    <ellipse cx="60" cy="52" rx="26" ry="29" fill="#FAD3BC"/>
                    <path d="M33 52C28 22 52 12 68 19c12 3 20 14 19 33-3-11-11-17-27-17-12 0-21 6-27 17Z" fill="#34405F"/>
                    <path d="M42 45q6-3 11 0M67 45q6-3 11 0" stroke="#34405F" strokeWidth="3" fill="none" strokeLinecap="round"/>
                    <circle cx="48" cy="54" r="2.8" fill="#34405F"/>
                    <circle cx="72" cy="54" r="2.8" fill="#34405F"/>
                    <path d="M60 56l-2.5 9h5Z" fill="#F4B99C"/>
                    <path
                      id="mouth"
                      d={listenState === "playing" ? "M50 74Q60 77 70 74Q60 89 50 74Z" : "M50 74Q60 81 70 74"}
                      stroke="#C26A5A"
                      strokeWidth="2.5"
                      fill={listenState === "playing" ? "#8A3B3B" : "none"}
                      strokeLinecap="round"
                    />
                  </g>
                </svg>
                <button
                  className={`mic-graphic${voiceState === "recording" ? " listening" : listenState === "playing" ? " speaking" : ""}`}
                  type="button"
                  aria-label={copy.record}
                  disabled={!voiceAgentReady}
                  onClick={toggleVoiceAssistant}
                >
                  <Icon name="mic" size={40}/>
                  <span className="demo-wave" aria-hidden="true"><i/><i/><i/><i/><i/></span>
                </button>
                <p className="vstatus" role="status" aria-live="polite">
                  {voiceAgentReady ? copy.recordHint : copy.agentLoading}{voiceError ? " " + voiceError : ""}
                </p>
                <div className="lang-selector" role="group" aria-label={copy.chooseLanguage}>
                  <button type="button" className="lang-toggle-btn" aria-pressed={inputLanguage === "en"} onClick={() => setUiLang("en")}>English</button>
                  <button type="button" className="lang-toggle-btn" aria-pressed={inputLanguage === "ta"} onClick={() => setUiLang("ta")}>தமிழ்</button>
                </div>
                <p className="cap">{copy.recordingNotice}</p>
              </aside>

              <div className="chat">
                <div className="chat-top">
                  <h3>Ask Namma</h3>
                  <span className="badge mint">{copy.feed}</span>
                </div>
                <div className="chat-log" role="log" aria-live="polite">
                  {!result && <p className="bubble answer">{copy.homeGreet}</p>}
                  {result && (
                    <>
                      {query && <p className="bubble user">{query}</p>}
                      <div className="bubble answer msg">
                        {result.status === "found" && routes.length > 0 && (
                          <RouteModeSummary journeys={routes} language={uiLanguage === "ta" || inputLanguage === "ta" ? "ta" : "en"} />
                        )}
                        {(uiLanguage === "ta" || inputLanguage === "ta") ? (
                          <>
                            {result.answerTamil && <p className="reply answer-tamil" style={{ whiteSpace: "pre-line", marginTop: 0 }}>{result.answerTamil}</p>}
                            {result.answerEnglish && <p className="reply" style={{ whiteSpace: "pre-line", marginTop: 8 }}>{result.answerEnglish}</p>}
                          </>
                        ) : (
                          <>
                            {result.answerEnglish && <p className="reply" style={{ whiteSpace: "pre-line" }}>{result.answerEnglish}</p>}
                            {result.answerTamil && <p className="reply answer-tamil" style={{ whiteSpace: "pre-line" }}>{result.answerTamil}</p>}
                          </>
                        )}
                        {!result.answerEnglish && !result.answerTamil && result.answer && <p className="reply" style={{ whiteSpace: "pre-line" }}>{result.answer}</p>}
                        <div className="vh-route-actions">
                          {result.speechText && (
                            <button className="listen-button" type="button" onClick={() => void playAnswer()} disabled={listenState === "loading"}>
                              <Icon name={listenState === "playing" ? "stop" : "speaker"} size={16}/>
                              {listenState === "loading" ? copy.preparingAudio : listenState === "playing" ? copy.stopPlayback : copy.listen}
                            </button>
                          )}
                          {routes.length > 0 && (
                            <button className="btn sm" type="button" onClick={() => navigateTo("plan")}>
                              <Icon name="route" size={16}/>{copy.openInPlan}
                            </button>
                          )}
                        </div>
                      </div>
                      {result.status === "clarification" && (
                        <div className="chips">
                          {result.clarificationOptions.map((place) => (
                            <button
                              className="chip"
                              type="button"
                              key={place.id}
                              onClick={() => {
                                const field = result.clarificationField;
                                const nextOrigin = field === "destination" ? originId : place.id;
                                const nextDestination = field === "destination" ? place.id : destinationId;
                                if (field === "destination") chooseDestination(place);
                                else chooseOrigin(place);
                                void runVoiceSearchWithPlaces(nextOrigin, nextDestination);
                              }}
                            >
                              {uiLanguage === "ta" ? place.nameTa : place.nameEn}
                            </button>
                          ))}
                        </div>
                      )}
                      {routes.length > 0 && (
                        <div className="journey-list">
                          {visibleRoutes.map((journey) => (
                            <JourneyCard
                              key={journey.id}
                              journey={journey}
                              result={result}
                              language={uiLanguage}
                              copy={copy}
                              cheapest={lowestFare !== null && journey.totalFareINR === lowestFare}
                              fastest={shortestTime !== null && journey.estimatedDurationMinutes === shortestTime}
                              selected={selectedJourney?.id === journey.id}
                              onShowOnMap={() => { setSelectedJourneyId(journey.id); navigateTo("plan"); }}
                              onListen={() => void playAnswer()}
                              listenState={listenState}
                              speechAvailable={true}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {searchError && <p className="note error">{searchError}</p>}
                </div>

                <form
                  className="ask"
                  autoComplete="off"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runVoiceSearch();
                  }}
                >
                  <button type="button" className="ask-mic" aria-label="Speak" onClick={toggleVoiceAssistant}>
                    <Icon name="mic" size={20}/>
                  </button>
                  <input
                    value={query}
                    aria-label={copy.questionLabel}
                    placeholder={copy.queryPlaceholder}
                    onChange={(event) => { setQuery(event.target.value); setTranscriptReady(false); }}
                  />
                  <button type="submit" aria-label="Send" disabled={searching}>
                    <Icon name="arrow" size={20}/>
                  </button>
                </form>

                <div>
                  <p className="exh">{copy.examples}</p>
                  <div className="chips">
                    {examples.map((example) => (
                      <button
                        key={example}
                        className="chip"
                        type="button"
                        onClick={() => {
                          setQuery(example);
                          void runSearch({ query: example, originId: "", destinationId: "", targetView: "voice" });
                        }}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="preview-note">
                  The supplied GTFS feeds are static. Confirm current service, fares and arrival times with operators.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer-top">
            <strong>namma mobility</strong>
            <p className="small">Your Voice. Your City. Your Journey.</p>
          </div>
          <p className="small">
            Student concept prototype. Not affiliated with CUMTA, MTC or Chennai Metro Rail. Route paths and scheduled ride estimates are generated from the supplied static GTFS feeds; map pins cover supported Chennai locations. There is no live vehicle tracking or official Chennai One integration. Verify current service and fares with official sources.
          </p>
        </div>
      </footer>
    </>
  );
}
