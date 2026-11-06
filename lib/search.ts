import type {
  Intent,
  Journey,
  Language,
  Place,
  SearchInput,
  SearchOutput,
} from "@/lib/types";
import type { TransportDataProvider } from "@/lib/provider";

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

function detectIntent(query: string): Intent {
  const text = normalize(query);
  if (/\b(cheapest|cheaper|lowest|low cost|least expensive|kuraindha)\b/.test(text) || /குறைந்த செலவு|குறைந்த கட்டணம்|மலிவு/.test(text)) return "cheapest";
  if (/\b(fastest|quickest|fast|quick|seekiram|vegam)\b/.test(text) || /விரைவாக|சீக்கிரம்|வேகமாக/.test(text)) return "fastest";
  if (/\b(fare|price|cost|ticket price|kattanam|evvalavu|evlo|evalo)\b/.test(text) || /கட்டணம்|விலை|செலவு|எவ்வளவு|டிக்கெட்/.test(text)) return "fare";
  if (/\b(how long|duration|travel time|journey time|time does it take|evlo neram|neram agum)\b/.test(text) || /எவ்வளவு நேரம்|பயண நேரம்|நேரம்/.test(text)) return "duration";
  return "route";
}

interface PlaceMatch {
  start: number;
  end: number;
  ids: string[];
  fuzzy?: boolean;
}

function findPlaceMatches(query: string, places: Place[]): PlaceMatch[] {
  for (const place of places) {
    for (const alias of [place.nameTa, ...place.aliases].filter(name => /[\u0B80-\u0BFF]/.test(name))) {
      for (const suffix of [
        "யிலிருந்தும்", "யிலிருந்து", "த்திலிருந்து", "விலிருந்து", "டமிருந்து",
        "இலிருந்து", "லிருந்து", "லருந்து", "த்திற்கு", "த்துக்கு", "யிற்கு",
        "விற்கு", "க்குப்", "க்குச்", "க்கு", "த்திலிருந்து", "த்துல", "யில", "ல",
      ]) {
        query = query.replaceAll(alias + suffix, alias + " ");
      }
    }
  }
  const text = ` ${normalize(query)} `;
  const candidates: Array<{ start: number; end: number; length: number; id: string }> = [];
  for (const place of places) {
    const aliases = [...new Set([place.nameEn, place.nameTa, ...place.aliases].map(normalize).filter(Boolean))];
    for (const alias of aliases) {
      const needle = ` ${alias} `;
      let from = 0;
      while (from < text.length) {
        const start = text.indexOf(needle, from);
        if (start < 0) break;
        candidates.push({ start: start + 1, end: start + 1 + alias.length, length: alias.length, id: place.id });
        from = start + 1;
      }
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.length - a.length);
  const longest: typeof candidates = [];
  for (const candidate of candidates) {
    const covered = candidates.some(
      (other) => other.length > candidate.length && other.start <= candidate.start && other.end >= candidate.end,
    );
    if (!covered) longest.push(candidate);
  }

  const groups = new Map<string, PlaceMatch>();
  for (const candidate of longest) {
    const key = `${candidate.start}:${candidate.end}`;
    const group = groups.get(key) ?? { start: candidate.start, end: candidate.end, ids: [] };
    if (!group.ids.includes(candidate.id)) group.ids.push(candidate.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.start - b.start || a.end - b.end);
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  if (a.length === b.length) {
    const diffs: number[] = [];
    for (let k = 0; k < a.length; k += 1) {
      if (a[k] !== b[k]) diffs.push(k);
      if (diffs.length > 2) return false;
    }
    if (diffs.length === 1) return true;
    if (diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]) {
      return true;
    }
    return false;
  }
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else j += 1;
  }
  if (i < a.length || j < b.length) edits += 1;
  return edits === 1;
}

/** Close spellings are returned as a choice, never silently substituted. */
function findFuzzyMatches(query: string, places: Place[], exact: PlaceMatch[]): PlaceMatch[] {
  const normalized = normalize(query);
  const words = normalized.split(" ").filter((word) => word.length >= 5);
  const result = new Map<string, PlaceMatch>();
  const aliases = places.flatMap((place) => [...new Set([place.nameEn, ...place.aliases].map(normalize))]
    .filter((alias) => alias && !alias.includes(" ") && Array.from(alias).length >= 5)
    .map((alias) => ({ alias, id: place.id })));
  for (const word of words) {
    const candidates = aliases.filter((item) => editDistanceAtMostOne(word, item.alias));
    if (!candidates.length) continue;
    let index = normalized.indexOf(word);
    while (index >= 0) {
      const end = index + word.length;
      if (!exact.some((match) => match.start === index + 1 && match.end === end + 1)) {
        const key = `${index}:${end}`;
        const prior = result.get(key) ?? { start: index + 1, end: end + 1, ids: [], fuzzy: true };
        for (const candidate of candidates) if (!prior.ids.includes(candidate.id)) prior.ids.push(candidate.id);
        result.set(key, prior);
      }
      index = normalized.indexOf(word, index + word.length);
    }
  }
  return [...result.values()].sort((a, b) => a.start - b.start);
}

function getPlace(places: Place[], id: string | undefined): Place | null {
  return id ? places.find((place) => place.id === id) ?? null : null;
}

function singlePlaceRole(query: string, match: PlaceMatch): "origin" | "destination" {
  const text = normalize(query);
  const start = Math.max(0, match.start - 1);
  const end = Math.max(start, match.end - 1);
  const before = text.slice(0, start);
  const at = text.slice(start, end);
  const after = text.slice(end);
  if (/\bto\s*$/.test(before) || /க்கு$/.test(at) || /\bdestination\b/.test(before)) return "destination";
  if (/\bfrom\s*$/.test(before) || /\borigin\b/.test(before) || /இருந்து/.test(after)) return "origin";
  return "origin";
}

function answerFor(intent: Intent, origin: Place, destination: Place, journeys: Journey[], language: Language) {
  const fares = journeys.filter((journey) => journey.totalFareINR !== null).map((journey) => journey.totalFareINR as number);
  const times = journeys.filter((journey) => journey.estimatedDurationMinutes !== null).map((journey) => journey.estimatedDurationMinutes as number);
  const routeCount = journeys.length;
  const cheapest = fares.length ? Math.min(...fares) : null;
  const fastest = times.length ? Math.min(...times) : null;
  const routeSentenceEn = `I found ${routeCount} route ${routeCount === 1 ? "option" : "options"} in the supplied GTFS feeds from ${origin.nameEn} to ${destination.nameEn}.`;
  const routeSentenceTa = `${origin.nameTa} முதல் ${destination.nameTa} வரை வழங்கப்பட்ட GTFS தரவுகளில் ${routeCount} வழி விருப்பங்கள் உள்ளன.`;
  const fareSentenceEn = cheapest === null
    ? `Fare information is not available in the supplied GTFS feeds for ${origin.nameEn} to ${destination.nameEn}.`
    : `The lowest fare in the supplied route data from ${origin.nameEn} to ${destination.nameEn} is ₹${cheapest}.`;
  const fareSentenceTa = cheapest === null
    ? `வழங்கப்பட்ட GTFS தரவுகளில் ${origin.nameTa} முதல் ${destination.nameTa} வரையிலான கட்டண விவரம் இல்லை.`
    : `வழங்கப்பட்ட வழித் தரவுகளில் ${origin.nameTa} முதல் ${destination.nameTa} வரையிலான குறைந்த கட்டணம் ₹${cheapest}.`;
  const durationSentenceEn = fastest === null
    ? `Scheduled ride time is not available in the supplied GTFS feeds for ${origin.nameEn} to ${destination.nameEn}.`
    : `The shortest scheduled ride plus access walk is ${fastest} minutes. Waiting and transfer time are not included.`;
  const durationSentenceTa = fastest === null
    ? `${origin.nameTa} முதல் ${destination.nameTa} வரையிலான திட்டமிட்ட பயண நேரம் வழங்கப்பட்ட GTFS தரவுகளில் இல்லை.`
    : `திட்டமிட்ட பயண நேரமும் தொடக்க/இறுதி நடைப்பயணமும் ${fastest} நிமிடங்கள். காத்திருப்பு மற்றும் வழிமாற்ற நேரம் சேர்க்கப்படவில்லை.`;
  const cheapestSentenceEn = cheapest === null ? "Fare information is not included in the supplied GTFS feeds." : `Lowest fare in the supplied route data: ₹${cheapest}.`;
  const cheapestSentenceTa = cheapest === null ? "வழங்கப்பட்ட GTFS தரவுகளில் கட்டண விவரம் இல்லை." : `வழங்கப்பட்ட வழித் தரவுகளில் குறைந்த கட்டணம்: ₹${cheapest}.`;
  const fastestSentenceEn = fastest === null ? "Scheduled ride times are not available for comparison." : `Shortest scheduled ride plus access walk: ${fastest} minutes, excluding waits and transfer time.`;
  const fastestSentenceTa = fastest === null ? "ஒப்பிடுவதற்கான திட்டமிட்ட பயண நேரம் இல்லை." : `குறுகிய திட்டமிட்ட பயணமும் தொடக்க/இறுதி நடைப்பயணமும் ${fastest} நிமிடங்கள்; காத்திருப்பு, வழிமாற்ற நேரம் சேர்க்கப்படவில்லை.`;

  const english = intent === "fare" ? fareSentenceEn : intent === "duration" ? durationSentenceEn : intent === "cheapest" ? cheapestSentenceEn : intent === "fastest" ? fastestSentenceEn : routeSentenceEn;
  const tamil = intent === "fare" ? fareSentenceTa : intent === "duration" ? durationSentenceTa : intent === "cheapest" ? cheapestSentenceTa : intent === "fastest" ? fastestSentenceTa : routeSentenceTa;
  return { english, tamil, selected: language === "ta" ? tamil : english };
}

function blankOutput(
  status: SearchOutput["status"],
  intent: Intent,
  language: Language,
  answerEn: string,
  answerTa: string,
  options: Place[] = [],
  field: "origin" | "destination" | null = null,
  origin: Place | null = null,
  destination: Place | null = null,
): SearchOutput {
  const optionNamesEn = options.length ? ` ${options.map((place) => place.nameEn).join(", or ")}?` : "";
  const optionNamesTa = options.length ? ` ${options.map((place) => place.nameTa).join(", அல்லது ")}?` : "";
  const speechEn = status === "clarification" && optionNamesEn ? `${answerEn.replace(/\?$/, ":")}${optionNamesEn}` : answerEn;
  const speechTa = status === "clarification" && optionNamesTa ? `${answerTa.replace(/\?$/, ":")}${optionNamesTa}` : answerTa;
  return {
    status,
    intent,
    origin,
    destination,
    answer: language === "ta" ? answerTa : answerEn,
    answerEnglish: answerEn,
    answerTamil: answerTa,
    speechText: language === "ta" ? speechTa : speechEn,
    journeys: [],
    clarificationField: field,
    clarificationOptions: options,
  };
}

function isTransportQuestion(query: string): boolean {
  const text = normalize(query);
  return /\b(route|travel|go|journey|bus|train|metro|station|how|fare|price|cost|time|cheapest|fastest|from|to|between|epdi|eppadi|polam|pogalam|irukka|iruka|vazhi|kattanam|evlo|evvalavu|neram)\b/.test(text) ||
    /போக|செல்ல|பயணம்|பாதை|வழி|பேருந்து|பஸ்|ரயில்|ட்ரெயின்|மெட்ரோ|கட்டணம்|செலவு|நேரம்|விரைவாக|குறைந்த|இருந்து|வரை|எப்படி|இருக்கா|உள்ளதா|டு|டூ/.test(text);
}

function containsUnsupportedIntent(query: string): boolean {
  const text = normalize(query);
  return /\b(weather|forecast|news|restaurant|pizza|food|joke|story|movie|cricket score|stock price)\b/.test(text) || /வானிலை|உணவகம்|நகைச்சுவை/.test(text);
}

export function searchTransport(input: SearchInput, provider: TransportDataProvider): SearchOutput {
  const places = provider.getPlaces();
  const intent = detectIntent(input.query);
  if (!provider.configured) {
    return blankOutput(
      "unavailable", intent, input.language,
      "Chennai One data is not configured. Search the supplied GTFS feeds instead.",
      "Chennai One தரவு அமைக்கப்படவில்லை. வழங்கப்பட்ட GTFS தரவுகளில் தேடுங்கள்.",
    );
  }

  if (containsUnsupportedIntent(input.query)) {
    return blankOutput("unsupported", "unsupported", input.language,
      "I can find route options from the supplied Chennai bus, Metro and suburban rail feeds, and show scheduled ride segments. Fare information and live arrivals are not included.",
      "வழங்கப்பட்ட சென்னை பேருந்து, மெட்ரோ, புறநகர் ரயில் தரவுகளில் வழிகளைத் தேடி திட்டமிட்ட பயண நேரத்தைக் காட்ட முடியும். கட்டண விவரமும் நேரடி வருகைத் தகவலும் இல்லை.");
  }

  const exactMatches = findPlaceMatches(input.query, places);
  const fuzzyMatches = exactMatches.length < 2 ? findFuzzyMatches(input.query, places, exactMatches) : [];
  const textMatches = [...exactMatches, ...fuzzyMatches].sort((a, b) => a.start - b.start || a.end - b.end);
  const suppliedOrigin = getPlace(places, input.originId);
  const suppliedDestination = getPlace(places, input.destinationId);
  if (input.originId && !suppliedOrigin) {
    return blankOutput("missing", intent, input.language, "That starting place is not in the place list.", "தொடக்க இடம் இடங்களின் பட்டியலில் இல்லை.");
  }
  if (input.destinationId && !suppliedDestination) {
    return blankOutput("missing", intent, input.language, "That destination is not in the place list.", "அந்த இலக்கு இடங்களின் பட்டியலில் இல்லை.");
  }

  const isFollowUp = (intent === "fare" || intent === "duration" || intent === "cheapest" || intent === "fastest") &&
    textMatches.length === 0 && Boolean(input.previousJourneyContext);
  let origin = suppliedOrigin;
  let destination = suppliedDestination;

  if (isFollowUp && input.previousJourneyContext) {
    origin = origin ?? getPlace(places, input.previousJourneyContext.originId);
    destination = destination ?? getPlace(places, input.previousJourneyContext.destinationId);
  }

  if (!origin || !destination) {
    let matches = textMatches;
    if (origin && !destination) matches = matches.filter((match) => !match.ids.includes(origin!.id));
    if (destination && !origin) matches = matches.filter((match) => !match.ids.includes(destination!.id));

    let originMatch = origin ? undefined : matches[0];
    let destinationMatch = destination ? undefined : matches.length > 1 ? matches[matches.length - 1] : undefined;
    if (!origin && !destination && matches.length === 1 && singlePlaceRole(input.query, matches[0]) === "destination") {
      originMatch = undefined;
      destinationMatch = matches[0];
    }
    if (originMatch?.ids.length && !origin) {
      if (originMatch.ids.length > 1 || originMatch.fuzzy) {
        const options = originMatch.ids.map((id) => getPlace(places, id)).filter((place): place is Place => Boolean(place));
        return blankOutput("clarification", intent, input.language, originMatch.fuzzy ? "Did you mean one of these starting places?" : "Which starting place did you mean?", originMatch.fuzzy ? "இந்த தொடக்க இடங்களில் ஒன்றைக் குறிப்பிட்டீர்களா?" : "எந்த தொடக்க இடத்தைக் குறிப்பிட்டீர்கள்?", options, "origin");
      }
      origin = getPlace(places, originMatch.ids[0]);
    }
    if (destinationMatch?.ids.length && !destination) {
      if (destinationMatch.ids.length > 1 || destinationMatch.fuzzy) {
        const options = destinationMatch.ids.map((id) => getPlace(places, id)).filter((place): place is Place => Boolean(place));
        return blankOutput("clarification", intent, input.language, destinationMatch.fuzzy ? "Did you mean one of these destinations?" : "Which destination did you mean?", destinationMatch.fuzzy ? "இந்த இலக்குகளில் ஒன்றைக் குறிப்பிட்டீர்களா?" : "எந்த இலக்கைக் குறிப்பிட்டீர்கள்?", options, "destination", origin);
      }
      destination = getPlace(places, destinationMatch.ids[0]);
    }

    // A lone ambiguous place is a clarification, not a guess about whether it is the origin or destination.
    if (!origin && !destination && matches.length === 1 && matches[0].ids.length > 1) {
      const options = matches[0].ids.map((id) => getPlace(places, id)).filter((place): place is Place => Boolean(place));
      return blankOutput("clarification", intent, input.language, "Which place did you mean?", "எந்த இடத்தைக் குறிப்பிட்டீர்கள்?", options);
    }
  }

  if (!origin || !destination) {
    if (!input.query.trim() && intent === "route") {
      return blankOutput("missing", intent, input.language, "Type a route or choose an origin and destination below.", "வழியைத் தட்டச்சு செய்யவும் அல்லது கீழே தொடக்க இடத்தையும் இலக்கையும் தேர்வு செய்யவும்.");
    }
    if (!isTransportQuestion(input.query) && !suppliedOrigin && !suppliedDestination) {
      return blankOutput("unsupported", "unsupported", input.language, "I can help with Chennai routes from the supplied GTFS feeds. Fare information and live arrivals are not included.", "வழங்கப்பட்ட GTFS தரவுகளில் சென்னை வழிகளைத் தேட உதவ முடியும். கட்டண விவரமும் நேரடி வருகைத் தகவலும் இல்லை.");
    }
    const needsOrigin = !origin;
    const en = needsOrigin ? "Where are you starting from? Choose an origin and destination below." : "Where would you like to go? Choose a destination below.";
    const ta = needsOrigin ? "எங்கிருந்து புறப்படுகிறீர்கள்? கீழே தொடக்க இடத்தையும் இலக்கையும் தேர்வு செய்யவும்." : "எங்கு செல்ல விரும்புகிறீர்கள்? கீழே இலக்கைத் தேர்வு செய்யவும்.";
    return blankOutput("missing", intent, input.language, en, ta, [], needsOrigin ? "origin" : "destination", origin, destination);
  }

  const found = provider.getJourneys(origin.id, destination.id);
  if (!found.length) {
    return blankOutput(
      "no_match", intent, input.language,
      `No connected route path was found in the supplied GTFS feeds from ${origin.nameEn} to ${destination.nameEn}. Try another pair of places.`,
      `வழங்கப்பட்ட GTFS தரவுகளில் ${origin.nameTa} முதல் ${destination.nameTa} வரை இணைந்த வழி கிடைக்கவில்லை. வேறு இடங்களைத் தேர்வு செய்யுங்கள்.`,
      [], null, origin, destination,
    );
  }

  const journeys = [...found].sort((a, b) => {
    if (intent === "cheapest") return (a.totalFareINR ?? Number.POSITIVE_INFINITY) - (b.totalFareINR ?? Number.POSITIVE_INFINITY);
    if (intent === "fastest") return (a.estimatedDurationMinutes ?? Number.POSITIVE_INFINITY) - (b.estimatedDurationMinutes ?? Number.POSITIVE_INFINITY);
    return 0;
  });
  const answers = answerFor(intent, origin, destination, journeys, input.language);
  const speechText = input.language === "ta"
    ? answers.tamil
    : journeys.length === 1
      ? `${origin.nameEn} to ${destination.nameEn}. ${journeys[0].totalFareINR === null ? "Fare unavailable." : `Fare rupees ${journeys[0].totalFareINR}.`} ${journeys[0].estimatedDurationMinutes === null ? "Travel time unavailable." : `Estimated ${journeys[0].estimatedDurationMinutes} minutes.`}`
      : `${origin.nameEn} to ${destination.nameEn}. ${answers.english}`;

  return {
    status: "found",
    intent,
    origin,
    destination,
    answer: answers.selected,
    answerEnglish: answers.english,
    answerTamil: answers.tamil,
    speechText,
    journeys,
    clarificationField: null,
    clarificationOptions: [],
  };
}
