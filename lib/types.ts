export type Language = "en" | "ta";
export type TransportMode = "bus" | "metro" | "train" | "walk";
export type Intent = "route" | "fare" | "duration" | "cheapest" | "fastest" | "unsupported";

export interface Place {
  id: string;
  nameEn: string;
  nameTa: string;
  aliases: string[];
}

export interface JourneyLeg {
  mode: TransportMode;
  originId: string;
  destinationId: string;
  serviceName?: string;
  routeNumber?: string;
  fareINR: number | null;
  walkingMinutes: number | null;
  waitingMinutes: number | null;
  inVehicleMinutes: number | null;
}

export interface Journey {
  id: string;
  originId: string;
  destinationId: string;
  legs: JourneyLeg[];
  totalFareINR: number | null;
  estimatedDurationMinutes: number | null;
  transfers: number;
  source: string;
  updatedAt: string;
  dataStatus: "verified" | "sample" | "gtfs";
}

export interface PreviousJourneyContext {
  originId: string;
  destinationId: string;
}

export interface SearchInput {
  query: string;
  language: Language;
  originId?: string;
  destinationId?: string;
  previousJourneyContext?: PreviousJourneyContext;
}

export interface SearchOutput {
  status: "found" | "missing" | "clarification" | "no_match" | "unsupported" | "unavailable";
  intent: Intent;
  origin: Place | null;
  destination: Place | null;
  answer: string;
  answerEnglish: string;
  answerTamil: string;
  speechText: string;
  journeys: Journey[];
  clarificationField: "origin" | "destination" | null;
  clarificationOptions: Place[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
