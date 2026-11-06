import mapRecords from "@/data/route-map.json";
import { searchTransport } from "@/lib/search";
import type { TransportDataProvider } from "@/lib/provider";
import type { Journey, Place, SearchInput, SearchOutput } from "@/lib/types";

type TransitMode = "bus" | "metro" | "train";

type RouteDetail = {
  boardingStop: string;
  alightingStop: string;
  boardingWalkMeters: number;
  alightingWalkMeters: number;
  routeNames: string[];
};

const details = mapRecords as unknown as Record<string, RouteDetail>;

const MODE_LABELS_EN: Record<TransitMode, string> = {
  bus: "Bus",
  metro: "Metro",
  train: "Suburban Train",
};

const MODE_LABELS_TA: Record<TransitMode, string> = {
  bus: "பேருந்து",
  metro: "மெட்ரோ ரயில்",
  train: "புறநகர் ரயில்",
};

const STOP_NAMES_TA: Record<string, string> = {
  "VELACHERY TANSI NAGAR": "வேளச்சேரி டான்சி நகர்",
  "GUINDY RAILWAY STATION": "கிண்டி ரயில் நிலையம்",
  "PERUNGUDI": "பெருங்குடி",
  "GUINDY": "கிண்டி",
  "Guindy": "கிண்டி மெட்ரோ",
  "GUINDY B.T": "கிண்டி பேருந்து நிலையம்",
  "KATHIPARA URBAN SQUARE": "கத்திப்பாரா சதுக்கம்",
  "ST. THOMAS MOUNT": "பரங்கிமலை (செயின்ட் தாமஸ் மவுண்ட்)",
  "Tambaram West Bus Stand": "தாம்பரம் மேற்கு பேருந்து நிலையம்",
  "TAMBARAM WEST BUS STAND": "தாம்பரம் மேற்கு பேருந்து நிலையம்",
  "TAMBARAM": "தாம்பரம்",
  "TAMBARAM SANATORIUM": "தாம்பரம் சானடோரியம்",
  "Velachery Railway Station": "வேளச்சேரி ரயில் நிலையம்",
  "Velachery railway station": "வேளச்சேரி ரயில் நிலையம்",
  "VELACHERY": "வேளச்சேரி",
  "Dr. MGR CHENNAI CENTRAL - return": "புரட்சித் தலைவர் டாக்டர் எம்.ஜி.ஆர் சென்னை சென்ட்ரல்",
  "Dr. MGR CHENNAI CENTRAL": "புரட்சித் தலைவர் டாக்டர் எம்.ஜி.ஆர் சென்னை சென்ட்ரல்",
  "M.G.R.CENTRAL R.S": "சென்னை சென்ட்ரல் ரயில் நிலையம்",
  "Chennai Central Metro": "சென்னை சென்ட்ரல் மெட்ரோ",
  "CHENNAI PARK TOWN": "சென்னை பார்க் டவுன்",
  "CHENNAI PARK": "சென்னை பார்க்",
  "TIRUSULAM": "திரிசூலம்",
  "MEEANAMBAKKAM INTERNATIONAL AIRPORT": "மீனம்பாக்கம் பன்னாட்டு விமான நிலையம்",
  "MEENAMBAKKAM OLD AIRPORT": "மீனம்பாக்கம் பழைய விமான நிலையம்",
  "MINAMBAKKAM": "மீனம்பாக்கம்",
  "Meenambakkam": "மீனம்பாக்கம் மெட்ரோ",
  "AIRPORT METRO": "விமான நிலைய மெட்ரோ",
  "Airport Metro": "விமான நிலைய மெட்ரோ",
  "CHENNAI AIRPORT": "சென்னை விமான நிலையம்",
  "THARAMANI BHARATHI NAGAR": "தரமணி பாரதி நகர்",
  "Egmore Railway Station": "எழும்பூர் ரயில் நிலையம்",
  "EGMORE RAILWAY STATION": "எழும்பூர் ரயில் நிலையம்",
  "EGMORE RAILWAY STATION - SOUTH": "எழும்பூர் தெற்கு ரயில் நிலையம்",
  "EGMORE R.S": "எழும்பூர் ரயில் நிலையம்",
  "CHENNAI EGMORE": "சென்னை எழும்பூர்",
  "Egmore Metro": "எழும்பூர் மெட்ரோ",
  "Y.W.C.A": "ஒய்.டபிள்யூ.சி.ஏ (எழும்பூர்)",
  "M.G.R.KOYAMBEDU B.T": "கோயம்பேடு பேருந்து நிலையம் (CMBT)",
  "M.G.R.KOYAMBEDU": "கோயம்பேடு (CMBT)",
  "CMBT Metro": "கோயம்பேடு மெட்ரோ (CMBT)",
  "KOYAMBEDU CHATRAM": "கோயம்பேடு சத்திரம்",
  "ALANDUR METRO R.S": "ஆலந்தூர் மெட்ரோ நிலையம்",
  "Alandur Metro": "ஆலந்தூர் மெட்ரோ",
  "Alanthur metro": "ஆலந்தூர் மெட்ரோ",
};

function stopTa(stopName: string): string {
  return STOP_NAMES_TA[stopName] ?? stopName;
}

function joinListEn(items: string[], conjunction: "and" | "or" = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

function joinListTa(items: string[], conjunction = "மற்றும்"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function recoverSpokenPlaces(query: string, places: Place[]): { originId?: string; destinationId?: string } {
  const cleaned = query
    .toLocaleLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
  const stopWords = new Set([
    "how", "do", "i", "go", "from", "to", "between", "and", "the", "a", "an", "is", "there", "has", "have",
    "bus", "metro", "train", "rail", "suburban", "route", "routes", "way", "for", "in", "on", "or", "not",
    "nor", "show", "compare", "tell", "me", "please", "can", "you", "take", "get", "going", "travel",
    "what", "which", "option", "options", "direct", "without", "with", "less", "walking", "walk", "fare",
    "cost", "price", "time", "duration", "cheapest", "fastest", "irukka", "iruka", "epdi", "eppadi",
    "polam", "pogalam", "vazhi", "irundhu", "lendhu", "varai",
  ]);
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 4 && !stopWords.has(w));
  const matchedIds: string[] = [];

  for (const token of tokens) {
    let bestId = "";
    let bestDist = 99;
    for (const place of places) {
      const candidateAliases = [place.nameEn, place.nameTa, ...place.aliases]
        .map((s) => s.toLocaleLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim())
        .filter((s) => s && !s.includes(" ") && s.length >= 4);
      for (const alias of candidateAliases) {
        if (alias === token) {
          bestId = place.id;
          bestDist = 0;
          break;
        }
        const maxAllowed = Math.min(alias.length, token.length) >= 7 ? 2 : 1;
        if (Math.abs(alias.length - token.length) <= maxAllowed) {
          const d = editDistance(token, alias);
          if (d <= maxAllowed && d < bestDist) {
            bestDist = d;
            bestId = place.id;
          }
        }
      }
      if (bestDist === 0) break;
    }
    if (bestId && !matchedIds.includes(bestId)) {
      matchedIds.push(bestId);
    }
  }

  if (matchedIds.length >= 2) {
    return { originId: matchedIds[0], destinationId: matchedIds[matchedIds.length - 1] };
  }
  return {};
}

function buildModeAvailability(
  allJourneys: Journey[],
  originEn: string,
  destinationEn: string,
  originTa: string,
  destinationTa: string,
) {
  const modes: TransitMode[] = ["bus", "metro", "train"];
  const available = modes.filter((mode) => allJourneys.some((j) => j.legs.some((l) => l.mode === mode)));
  const unavailable = modes.filter((mode) => !available.includes(mode));

  const busJ = allJourneys.find((j) => j.legs.some((l) => l.mode === "bus"));
  const metroJ = allJourneys.find((j) => j.legs.some((l) => l.mode === "metro"));
  const trainJ = allJourneys.find((j) => j.legs.some((l) => l.mode === "train"));

  const busRoutes = busJ ? details[`bus:${busJ.originId}:${busJ.destinationId}`]?.routeNames.join(" → ") : "";
  const metroRoutes = metroJ ? details[`metro:${metroJ.originId}:${metroJ.destinationId}`]?.routeNames.join(" → ") : "";
  const trainRoutes = trainJ ? details[`train:${trainJ.originId}:${trainJ.destinationId}`]?.routeNames.join(" → ") : "";

  const statusBadgeEn = [
    `Route Mode Availability (${originEn} → ${destinationEn}):`,
    `• Bus: ${busJ ? `YES — Available (${busRoutes || "MTC Bus"}, ~${busJ.estimatedDurationMinutes ?? "?"} min)` : "NO — Not available on this route"}`,
    `• Metro: ${metroJ ? `YES — Available (${metroRoutes || "Chennai Metro"}, ~${metroJ.estimatedDurationMinutes ?? "?"} min)` : "NO — Not available on this route"}`,
    `• Suburban Train: ${trainJ ? `YES — Available (${trainRoutes || "Suburban Rail"}, ~${trainJ.estimatedDurationMinutes ?? "?"} min)` : "NO — Not available on this route"}`,
  ].join("\n");

  const statusBadgeTa = [
    `வழித்தட போக்குவரத்து விவரம் (${originTa} → ${destinationTa}):`,
    `• பேருந்து (Bus): ${busJ ? `உள்ளது (${busRoutes || "MTC"}, சுமார் ${busJ.estimatedDurationMinutes ?? "?"} நிமிடம்)` : "இல்லை (இந்த வழியில் பேருந்து சேவை இல்லை)"}`,
    `• மெட்ரோ (Metro): ${metroJ ? `உள்ளது (${metroRoutes || "மெட்ரோ"}, சுமார் ${metroJ.estimatedDurationMinutes ?? "?"} நிமிடம்)` : "இல்லை (இந்த வழியில் மெட்ரோ ரயில் வசதி இல்லை)"}`,
    `• புறநகர் ரயில் (Train): ${trainJ ? `உள்ளது (${trainRoutes || "புறநகர் ரயில்"}, சுமார் ${trainJ.estimatedDurationMinutes ?? "?"} நிமிடம்)` : "இல்லை (இந்த வழியில் புறநகர் ரயில் வசதி இல்லை)"}`,
  ].join("\n");

  const availNamesEn = available.map((m) => MODE_LABELS_EN[m]);
  const unavailNamesEn = unavailable.map((m) => MODE_LABELS_EN[m]);
  const availNamesTa = available.map((m) => MODE_LABELS_TA[m]);
  const unavailNamesTa = unavailable.map((m) => MODE_LABELS_TA[m]);

  const spokenSummaryEn = unavailable.length === 0
    ? `From ${originEn} to ${destinationEn}, Bus, Metro, and Suburban Train are all available.`
    : `From ${originEn} to ${destinationEn}, ${joinListEn(availNamesEn)} ${available.length === 1 ? "is" : "are"} available, and ${joinListEn(unavailNamesEn)} ${unavailable.length === 1 ? "is" : "are"} not available on this route.`;

  const spokenSummaryTa = unavailable.length === 0
    ? `${originTa} முதல் ${destinationTa} வரை பேருந்து, மெட்ரோ ரயில் மற்றும் புறநகர் ரயில் ஆகிய மூன்று வசதிகளும் உள்ளன.`
    : `${originTa} முதல் ${destinationTa} வரை ${joinListTa(availNamesTa)} வசதி உள்ளது. ஆனால் இந்த வழியில் ${joinListTa(unavailNamesTa)} வசதி இல்லை.`;

  return {
    available,
    unavailable,
    statusBadgeEn,
    statusBadgeTa,
    spokenSummaryEn,
    spokenSummaryTa,
  };
}

function buildSpokenRoutesEn(journeys: Journey[]): string {
  return journeys.map((j) => {
    const leg = j.legs[0];
    const d = details[`${leg.mode}:${j.originId}:${j.destinationId}`];
    const modeLabel = leg.mode === "train" ? "Suburban Train" : leg.mode === "metro" ? "Metro" : "Bus";
    const routePart = d?.routeNames?.length ? ` (${d.routeNames.slice(0, 3).join(" to ")})` : "";
    const stopsPart = d ? ` from ${d.boardingStop} to ${d.alightingStop}` : "";
    const timePart = j.estimatedDurationMinutes !== null ? `, about ${j.estimatedDurationMinutes} minutes` : "";
    const changePart = j.transfers === 0 ? " direct" : j.transfers === 1 ? " with 1 change" : ` with ${j.transfers} changes`;
    return `By ${modeLabel}${routePart}${stopsPart}${timePart}${changePart}.`;
  }).join(" ");
}

function buildSpokenRoutesTa(journeys: Journey[]): string {
  return journeys.map((j) => {
    const leg = j.legs[0];
    const d = details[`${leg.mode}:${j.originId}:${j.destinationId}`];
    const modeLabel = leg.mode === "bus" ? "பேருந்தில் செல்ல" : leg.mode === "metro" ? "மெட்ரோ ரயிலில் செல்ல" : "புறநகர் ரயிலில் செல்ல";
    const routePart = d?.routeNames?.length ? ` தடம் ${d.routeNames.slice(0, 3).join(" மற்றும் ")} மூலம்` : "";
    const stopsPart = d ? ` ${stopTa(d.boardingStop)} நிறுத்தத்தில் ஏறி ${stopTa(d.alightingStop)} நிறுத்தத்தில் இறங்கலாம்,` : "";
    const timePart = j.estimatedDurationMinutes !== null ? ` பயண நேரம் சுமார் ${j.estimatedDurationMinutes} நிமிடங்கள்` : "";
    const changePart = j.transfers === 0 ? " (நேரடி சேவை)." : ` (${j.transfers} முறை மாற வேண்டும்).`;
    return `${modeLabel}:${routePart}${stopsPart}${timePart}${changePart}`;
  }).join(" ");
}

/** Answers are assembled from the same imported Theme feed paths displayed on the map. */
export function answerTransport(input: SearchInput, provider: TransportDataProvider): SearchOutput {
  const rawQuery = input.query;
  const query = rawQuery.toLowerCase();
  const hasTamilScript = /[\u0B80-\u0BFF]/.test(rawQuery);
  const effectiveLang = hasTamilScript ? "ta" : input.language;

  const mentionedModes = ([
    /\bmetro\b|மெட்ரோ/.test(query) ? "metro" : null,
    /\bbus\b|பேருந்து|பஸ்/.test(query) ? "bus" : null,
    /\b(train|rail|suburban|mrts)\b|ரயில்|ட்ரெயின்/.test(query) ? "train" : null,
  ].filter(Boolean)) as TransitMode[];

  const isAvailabilityCheck = /\b(or not|nor not|available|have|has|is there|whether|know|check|irukka|iruka|uladha|ulladha)\b|இருக்கா|உள்ளதா|இல்லையா/.test(query);
  const lessWalking = /less walk|least walk|minimum walk|குறைந்த நடை/.test(query);
  const direct = /\bdirect\b|no transfers|without chang|நேரடி/.test(query);
  const followUp = /\b(which|compare|option|those|these|boarding|alight|walk|transfer|change|stops|bus|metro|train|rail|suburban|direct|available|have|has)\b|நடை|மாற்று|நிறுத்தம்|மெட்ரோ|பேருந்து|பஸ்|ரயில்|இருக்கா|உள்ளதா/.test(query);

  let currentInput: SearchInput = { ...input, language: effectiveLang };
  let output = searchTransport(currentInput, provider);

  if (
    followUp &&
    currentInput.previousJourneyContext &&
    !currentInput.originId &&
    !currentInput.destinationId &&
    (output.status === "missing" || output.status === "unsupported")
  ) {
    currentInput = {
      ...currentInput,
      originId: currentInput.previousJourneyContext.originId,
      destinationId: currentInput.previousJourneyContext.destinationId,
    };
    output = searchTransport(currentInput, provider);
  }

  // Auto-resolve single-option fuzzy matches and "airport" ambiguity so voice and chat queries never get stuck
  for (let pass = 0; pass < 2; pass += 1) {
    if (output.status === "clarification" && (output.clarificationField === "origin" || output.clarificationField === "destination")) {
      const opts = output.clarificationOptions;
      let resolvedId: string | undefined;
      if (opts.length === 1) {
        resolvedId = opts[0].id;
      } else if (opts.length === 2 && opts.some((p) => p.id === "airport-metro") && opts.some((p) => p.id === "chennai-airport")) {
        resolvedId = mentionedModes.includes("metro") ? "airport-metro" : "chennai-airport";
      }
      if (resolvedId) {
        currentInput = {
          ...currentInput,
          ...(output.clarificationField === "origin" ? { originId: resolvedId } : { destinationId: resolvedId }),
        };
        output = searchTransport(currentInput, provider);
        continue;
      }
    }
    break;
  }

  // If still missing places because of a 2-character speech-to-text typo, recover using phonetic/edit distance
  if ((output.status === "missing" || output.status === "unsupported") && !currentInput.originId && !currentInput.destinationId) {
    const recovered = recoverSpokenPlaces(rawQuery, provider.getPlaces());
    if (recovered.originId && recovered.destinationId) {
      currentInput = {
        ...currentInput,
        originId: recovered.originId,
        destinationId: recovered.destinationId,
      };
      output = searchTransport(currentInput, provider);
    }
  }

  const finish = (english: string, tamil: string, speechEn?: string, speechTa?: string): SearchOutput => ({
    ...output,
    answerEnglish: english,
    answerTamil: tamil,
    answer: effectiveLang === "ta" ? tamil : english,
    speechText: (effectiveLang === "ta" ? (speechTa ?? tamil) : (speechEn ?? english)).slice(0, 580),
  });

  if (/^(hi|hello|hey|help|vanakkam|வணக்கம்)[.!\s]*$/i.test(query.trim()) || /what can you|how to use|எப்படி பயன்படுத்துவது/.test(query)) {
    return finish(
      "Vanakkam! I can check whether MTC Bus, Chennai Metro, and Suburban Train are available between any Chennai places, and tell you the route numbers, stops, and travel time. Tell me your starting place and destination (for example: Perungudi to Guindy).",
      "வணக்கம்! சென்னையில் ஒரு இடத்திலிருந்து மற்றொரு இடத்திற்குச் செல்ல பேருந்து (Bus), மெட்ரோ ரயில் (Metro) மற்றும் புறநகர் ரயில் (Suburban Train) வசதி உள்ளதா என்பதை உடனடியாகக் கூறுவேன். நீங்கள் புறப்படும் இடத்தையும் செல்ல வேண்டிய இடத்தையும் சொல்லுங்கள் (எடுத்துக்காட்டு: பெருங்குடியிலிருந்து கிண்டி).",
    );
  }

  if (output.status !== "found" || !output.origin || !output.destination) return output;

  const origin = output.origin;
  const destination = output.destination;
  const allJourneys = output.journeys;
  const modeInfo = buildModeAvailability(
    allJourneys,
    origin.nameEn,
    destination.nameEn,
    origin.nameTa,
    destination.nameTa,
  );

  // If the user explicitly asked for fare, keep the fare answer crisp and include mode availability.
  if (output.intent === "fare") {
    return finish(
      `${output.answerEnglish}\n\n${modeInfo.statusBadgeEn}`,
      `${output.answerTamil}\n\n${modeInfo.statusBadgeTa}`,
      `${output.answerEnglish} ${modeInfo.spokenSummaryEn}`,
      `${output.answerTamil} ${modeInfo.spokenSummaryTa}`,
    );
  }

  // Only filter out other modes if the user is not asking a general availability check across modes
  const shouldFilterByMode = mentionedModes.length > 0 && !(isAvailabilityCheck && mentionedModes.length >= 2);
  let journeys = allJourneys.filter(
    (j) =>
      (!shouldFilterByMode || j.legs.some((l) => l.mode !== "walk" && mentionedModes.includes(l.mode))) &&
      (!direct || j.transfers === 0),
  );
  if (lessWalking) {
    journeys = [...journeys].sort(
      (a, b) =>
        a.legs.reduce((s, l) => s + (l.walkingMinutes ?? 0), 0) -
        b.legs.reduce((s, l) => s + (l.walkingMinutes ?? 0), 0),
    );
  }

  const missingRequestedModes = mentionedModes.filter((m) => !modeInfo.available.includes(m));
  let unavailableRequestedNoteEn = "";
  let unavailableRequestedNoteTa = "";
  let unavailableSpokenLeadEn = "";
  let unavailableSpokenLeadTa = "";

  if (!journeys.length && mentionedModes.length > 0 && !direct) {
    const missingEn = joinListEn(missingRequestedModes.map((m) => MODE_LABELS_EN[m]), "or");
    const missingTa = joinListTa(missingRequestedModes.map((m) => MODE_LABELS_TA[m]), "அல்லது");
    const altEn = joinListEn(modeInfo.available.map((m) => MODE_LABELS_EN[m]));
    const altTa = joinListTa(modeInfo.available.map((m) => MODE_LABELS_TA[m]));

    unavailableRequestedNoteEn = `No ${missingEn} route is available from ${origin.nameEn} to ${destination.nameEn} in the supplied feeds. Showing available ${altEn} options instead.\n\n`;
    unavailableRequestedNoteTa = `${origin.nameTa} முதல் ${destination.nameTa} வரை ${missingTa} வசதி இல்லை. அதற்குப் பதிலாக உள்ள ${altTa} வழிகள் கீழே கொடுக்கப்பட்டுள்ளன.\n\n`;
    unavailableSpokenLeadEn = `No, ${missingEn} is not available from ${origin.nameEn} to ${destination.nameEn}. Instead, ${altEn} ${modeInfo.available.length === 1 ? "is" : "are"} available on this route.`;
    unavailableSpokenLeadTa = `இல்லை, ${origin.nameTa} முதல் ${destination.nameTa} வரை ${missingTa} வசதி இல்லை. அதற்குப் பதிலாக ${altTa} வசதி உள்ளது.`;
    journeys = allJourneys;
  } else if (!journeys.length) {
    output = { ...output, status: "no_match", journeys: [] };
    return finish(
      `No direct option matching that filter was found from ${origin.nameEn} to ${destination.nameEn}.\n\n${modeInfo.statusBadgeEn}\n\nTry allowing line changes.`,
      `${origin.nameTa} முதல் ${destination.nameTa} வரை நேரடி சேவை இல்லை.\n\n${modeInfo.statusBadgeTa}`,
      `No direct option without line changes was found from ${origin.nameEn} to ${destination.nameEn}. ${modeInfo.spokenSummaryEn}`,
      `${origin.nameTa} முதல் ${destination.nameTa} வரை நேரடி சேவை இல்லை. ${modeInfo.spokenSummaryTa}`,
    );
  } else if (missingRequestedModes.length > 0) {
    const missingEn = joinListEn(missingRequestedModes.map((m) => MODE_LABELS_EN[m]));
    const missingTa = joinListTa(missingRequestedModes.map((m) => MODE_LABELS_TA[m]));
    const presentRequestedModes = mentionedModes.filter((m) => modeInfo.available.includes(m));
    const presentEn = joinListEn(presentRequestedModes.map((m) => MODE_LABELS_EN[m]));
    const presentTa = joinListTa(presentRequestedModes.map((m) => MODE_LABELS_TA[m]));
    unavailableRequestedNoteEn = `Note: ${presentEn} is available, but ${missingEn} is NOT available from ${origin.nameEn} to ${destination.nameEn}.\n\n`;
    unavailableRequestedNoteTa = `முக்கிய குறிப்பு: ${origin.nameTa} முதல் ${destination.nameTa} வரை ${presentTa} வசதி உள்ளது, ஆனால் ${missingTa} வசதி இந்த வழியில் இல்லை.\n\n`;
    unavailableSpokenLeadEn = `From ${origin.nameEn} to ${destination.nameEn}, ${presentEn} is available, and ${missingEn} is not available on this route.`;
    unavailableSpokenLeadTa = `${origin.nameTa} முதல் ${destination.nameTa} வரை ${presentTa} வசதி உள்ளது, ஆனால் ${missingTa} வசதி இந்த வழியில் இல்லை.`;
  }

  output = { ...output, journeys };

  const headerEn = output.intent === "route"
    ? `${modeInfo.statusBadgeEn}\n\n${journeys.length} matching ${journeys.length === 1 ? "option" : "options"} from ${origin.nameEn} to ${destination.nameEn}:`
    : `${modeInfo.statusBadgeEn}\n\n${output.answerEnglish}`;
  const headerTa = output.intent === "route"
    ? `${modeInfo.statusBadgeTa}\n\n${origin.nameTa} முதல் ${destination.nameTa} வரை உள்ள ${journeys.length} பயண வழிகள்:`
    : `${modeInfo.statusBadgeTa}\n\n${output.answerTamil}`;

  const en = journeys.map((j, i) => {
    const leg = j.legs[0];
    const d = details[`${leg.mode}:${j.originId}:${j.destinationId}`];
    const modeName = leg.mode === "train" ? "Suburban rail" : leg.mode === "metro" ? "Metro" : "Bus";
    return `${i + 1}. ${modeName}${d ? ` (${d.routeNames.join(" → ")}). Board at ${d.boardingStop}; get off at ${d.alightingStop}. Estimated access walks: ${d.boardingWalkMeters} m to board and ${d.alightingWalkMeters} m after alighting` : ""}. ${j.estimatedDurationMinutes ?? "Unknown"} min ride + access walk; ${j.transfers} line changes. Feed date: ${j.updatedAt}.`;
  });

  const ta = journeys.map((j, i) => {
    const l = j.legs[0];
    const d = details[`${l.mode}:${j.originId}:${j.destinationId}`];
    const modeLabel = l.mode === "bus" ? "பேருந்து (Bus)" : l.mode === "metro" ? "மெட்ரோ ரயில் (Metro)" : "புறநகர் ரயில் (Train)";
    const transferText = j.transfers === 0 ? "நேரடி பயணம் (மாற்றம் இல்லை)" : `${j.transfers} முறை மாற வேண்டும்`;
    return `${i + 1}. ${modeLabel}${d?.routeNames?.length ? ` — தடம்: ${d.routeNames.join(" → ")}` : ""}. ${d ? `${stopTa(d.boardingStop)} நிறுத்தத்தில் ஏறி ${stopTa(d.alightingStop)} நிறுத்தத்தில் இறங்கவும்.` : ""} பயண நேரம் சுமார் ${j.estimatedDurationMinutes ?? "தெரியாத"} நிமிடங்கள் (${transferText}${d ? `; நடை தூரம்: ஏற ${d.boardingWalkMeters} மீ, இறங்கிய பின் ${d.alightingWalkMeters} மீ` : ""}).`;
  });

  const limitation = "These are static feed paths. Walking distances are straight-line estimates; waiting time and transfer connections are not calculated. Fares and live arrivals are unavailable.";
  const requestedLive = /\b(now|today|tonight|last|first|departure|arriv|accessible|wheelchair)\b|இப்போது|இன்று/.test(query);
  const livePrefixEn = requestedLive ? "I cannot confirm live departures or accessibility from static feeds. " : "";

  const spokenEn = `${livePrefixEn}${unavailableSpokenLeadEn || modeInfo.spokenSummaryEn} ${buildSpokenRoutesEn(journeys)}`.trim();
  const spokenTa = `${unavailableSpokenLeadTa || modeInfo.spokenSummaryTa} ${buildSpokenRoutesTa(journeys)}`.trim();

  return finish(
    `${livePrefixEn}${unavailableRequestedNoteEn}${headerEn}\n\n${en.join("\n\n")}\n\n${lessWalking ? "Options are ordered by estimated access walking. " : ""}${limitation}`,
    `${unavailableRequestedNoteTa}${headerTa}\n\n${ta.join("\n\n")}\n\nகுறிப்பு: இவை நிலையான GTFS அட்டவணைத் தகவல்கள். காத்திருப்பு நேரம், கட்டணம் மற்றும் நேரடி வருகைத் தகவல் இதில் இல்லை.`,
    spokenEn,
    spokenTa,
  );
}
