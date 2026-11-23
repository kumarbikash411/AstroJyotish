import type { BirthLocation } from "./astrology";

type GeocodingResponse = {
  results?: Array<{
    id: number;
    name: string;
    admin1?: string;
    country?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }>;
};

export async function searchBirthLocations(query: string): Promise<BirthLocation[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query.trim());
  url.searchParams.set("count", "5");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Place lookup is temporarily unavailable. Please try again.");
  }

  const data = (await response.json()) as GeocodingResponse;
  return (data.results ?? [])
    .filter(
      (result): result is NonNullable<GeocodingResponse["results"]>[number] & { timezone: string; country: string } =>
        Number.isFinite(result.latitude) &&
        Number.isFinite(result.longitude) &&
        Boolean(result.timezone) &&
        Boolean(result.country),
    )
    .map((result) => ({
      id: result.id,
      name: result.name,
      admin1: result.admin1,
      country: result.country,
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: result.timezone,
    }));
}

export function formatLocationName(location: BirthLocation): string {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}
