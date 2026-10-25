import type { FlightOffer } from "../search/search-types.ts";
import type { ProviderAResponse } from "./provider-a.ts";
import type { ProviderBResponse } from "./provider-b.ts";
import { ProviderInvalidResponseError } from "./provider-errors.ts";

export function normalizeProviderA(response: ProviderAResponse): FlightOffer[] {
  return response.flights.map((flight) => ({
    id: `A-${flight.flightId}`,
    provider: "A",
    providerOfferId: flight.flightId,
    origin: flight.from,
    destination: flight.to,
    departureDate: flight.date,
    departureTime: flight.departureTime,
    airline: flight.carrier.name,
    flightNumber: flight.carrier.flightNumber,
    durationMinutes: flight.durationMin,
    stops: flight.stops,
    price: flight.fare.amount,
    currency: flight.fare.currency,
  }));
}

function parseIsoDuration(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(duration);
  if (!match) throw new ProviderInvalidResponseError("B", `unparseable duration "${duration}"`);
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function normalizeProviderB(response: ProviderBResponse): FlightOffer[] {
  return response.itineraries.map((itinerary) => {
    const [departureDate = "", time = ""] = itinerary.departureAt.split("T");
    return {
      id: `B-${itinerary.ref}`,
      provider: "B",
      providerOfferId: itinerary.ref,
      origin: itinerary.origin.iata,
      destination: itinerary.destination.iata,
      departureDate,
      departureTime: time.slice(0, 5),
      airline: itinerary.marketingCarrier,
      flightNumber: itinerary.flightNo,
      durationMinutes: parseIsoDuration(itinerary.duration),
      stops: itinerary.stopCount,
      price: itinerary.priceCents / 100,
      currency: itinerary.currencyCode,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, field: string, pattern?: RegExp): string {
  const value = record[field];
  if (typeof value !== "string" || (pattern && !pattern.test(value))) {
    throw new ProviderInvalidResponseError("C", `invalid field "${field}": ${JSON.stringify(value)}`);
  }
  return value;
}

function normalizeProviderCResult(result: unknown): FlightOffer {
  if (!isRecord(result)) throw new ProviderInvalidResponseError("C", "result is not an object");

  const offerId = requireString(result, "offer_id");
  const [origin = "", destination = ""] = requireString(result, "route", /^[A-Z]{3}-[A-Z]{3}$/).split("-");
  const [day, month, year] = requireString(result, "departure_date", /^\d{2}\/\d{2}\/\d{4}$/).split("/");
  const time = requireString(result, "departure_time", /^\d{4}$/);
  const price = Number(requireString(result, "total_price", /^\d+(\.\d{1,2})?$/));
  if (requireString(result, "currency") !== "USD") {
    throw new ProviderInvalidResponseError("C", `unsupported currency ${JSON.stringify(result.currency)}`);
  }

  return {
    id: `C-${offerId}`,
    provider: "C",
    providerOfferId: offerId,
    origin,
    destination,
    departureDate: `${year}-${month}-${day}`,
    departureTime: `${time.slice(0, 2)}:${time.slice(2)}`,
    airline: requireString(result, "airline_name"),
    flightNumber: requireString(result, "flight_code"),
    durationMinutes: Number(requireString(result, "duration_minutes", /^\d+$/)),
    stops: Number(requireString(result, "stops", /^\d+$/)),
    price,
    currency: "USD",
  };
}

/** Provider C is untrusted: validate the whole payload and reject it if anything is off. */
export function normalizeProviderC(response: unknown): FlightOffer[] {
  if (!isRecord(response) || response.status !== "OK" || !isRecord(response.data)) {
    throw new ProviderInvalidResponseError("C", "unexpected response envelope");
  }
  const results = response.data.results;
  if (!Array.isArray(results)) throw new ProviderInvalidResponseError("C", "results is not an array");
  return results.map(normalizeProviderCResult);
}

function sameFlightKey(offer: FlightOffer): string {
  return `${offer.flightNumber}|${offer.origin}|${offer.destination}|${offer.departureDate}`;
}

function compareOffers(a: FlightOffer, b: FlightOffer): number {
  return a.price - b.price || a.durationMinutes - b.durationMinutes || a.id.localeCompare(b.id);
}

/**
 * Merges offers from all providers. When several providers sell the same physical flight,
 * only the cheapest offer is kept (it retains its own provider and providerOfferId).
 * Result is sorted by price, then duration, then id.
 */
export function mergeOffers(offers: readonly FlightOffer[]): FlightOffer[] {
  const cheapestByFlight = new Map<string, FlightOffer>();
  for (const offer of offers) {
    const key = sameFlightKey(offer);
    const current = cheapestByFlight.get(key);
    if (!current || compareOffers(offer, current) < 0) cheapestByFlight.set(key, offer);
  }
  return [...cheapestByFlight.values()].sort(compareOffers);
}
