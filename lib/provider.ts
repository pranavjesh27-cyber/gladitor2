import journeyRecords from "@/data/gtfs-journeys.json";
import placeRecords from "@/data/places.json";
import type { Journey, Place } from "@/lib/types";

export interface TransportDataProvider {
  readonly id: "gtfs" | "chennai-one";
  readonly configured: boolean;
  getPlaces(query?: string): Place[];
  getJourneys(originId: string, destinationId: string): Journey[];
}

const places = placeRecords as Place[];
const journeys = journeyRecords as Record<string, Journey[]>;

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

export class GtfsJsonProvider implements TransportDataProvider {
  readonly id = "gtfs" as const;
  readonly configured = true;

  getPlaces(query = ""): Place[] {
    const needle = normalize(query);
    if (!needle) return places;
    return places.filter((place) =>
      [place.nameEn, place.nameTa, ...place.aliases].some((item) => normalize(item).includes(needle)),
    );
  }

  getJourneys(originId: string, destinationId: string): Journey[] {
    return journeys[`${originId}:${destinationId}`] ?? [];
  }
}

/** Intentionally unconfigured until CUMTA/Chennai One supplies a documented API or dataset. */
export class ChennaiOneProvider implements TransportDataProvider {
  readonly id = "chennai-one" as const;
  readonly configured = false;

  getPlaces(): Place[] {
    return [];
  }

  getJourneys(): Journey[] {
    return [];
  }
}

export function getTransportDataProvider(): TransportDataProvider {
  return process.env.TRANSPORT_DATA_PROVIDER?.toLowerCase() === "chennai-one"
    ? new ChennaiOneProvider()
    : new GtfsJsonProvider();
}

export function getLocalPlaceById(id: string): Place | null {
  return places.find((place) => place.id === id) ?? null;
}
