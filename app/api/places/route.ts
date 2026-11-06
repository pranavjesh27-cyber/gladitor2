import { NextResponse } from "next/server";
import { checkRateLimit, apiError, tooManyRequests } from "@/lib/http";
import { getTransportDataProvider } from "@/lib/provider";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!checkRateLimit(request, "places", 90)) return tooManyRequests();
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  if (query.length > 100) return apiError(400, "QUERY_TOO_LONG", "Place search must be 100 characters or fewer.");
  const provider = getTransportDataProvider();
  return NextResponse.json({
    places: provider.getPlaces(query).slice(0, 12),
    provider: provider.id,
    configured: provider.configured,
  });
}
