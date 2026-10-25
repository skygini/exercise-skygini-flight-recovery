import { findInventory, isProviderOutage } from "../fixtures/flight-inventory.ts";
import { logger } from "../logger.ts";
import { ProviderTimeoutError, ProviderUnavailableError } from "./provider-errors.ts";
import {
  behaviorFor,
  delay,
  requestSeed,
  simulatedLatencyMs,
  type ProviderCallOptions,
  type ProviderSearchRequest,
} from "./simulation.ts";

/** Provider B ("SkyBazaar"): slow and variable, often has the best prices. */
export interface ProviderBResponse {
  searchRef: string;
  itineraries: Array<{
    ref: string;
    origin: { iata: string };
    destination: { iata: string };
    /** Local departure time, ISO 8601 without offset, e.g. 2027-11-15T06:10:00 */
    departureAt: string;
    marketingCarrier: string;
    flightNo: string;
    /** ISO 8601 duration, e.g. PT5H30M */
    duration: string;
    stopCount: number;
    priceCents: number;
    currencyCode: "USD";
  }>;
}

export const PROVIDER_B_LATENCY_MS = {
  normal: { min: 900, max: 1500 },
  slow: { min: 3000, max: 5000 },
  /** In the "hang" behavior B stays silent this long, then reports an upstream timeout. */
  hang: 30_000,
} as const;

function toIsoDuration(minutes: number): string {
  return `PT${Math.floor(minutes / 60)}H${minutes % 60}M`;
}

function latencyFor(request: ProviderSearchRequest, behavior: "slow" | "hang" | "normal", multiplier = 1): number {
  if (behavior === "hang") return Math.round(PROVIDER_B_LATENCY_MS.hang * multiplier);
  const range = PROVIDER_B_LATENCY_MS[behavior];
  return simulatedLatencyMs(requestSeed("B", request), range.min, range.max, multiplier);
}

export async function searchProviderB(
  request: ProviderSearchRequest,
  options: ProviderCallOptions = {},
): Promise<ProviderBResponse> {
  const behavior = behaviorFor("B", request.scenario);
  const latencyMs = latencyFor(request, behavior, options.latencyMultiplier);
  logger.info("provider B invoked", { route: `${request.origin}-${request.destination}`, date: request.departureDate, behavior, simulatedLatencyMs: latencyMs });

  await delay(latencyMs, options.signal);

  if (behavior === "hang") throw new ProviderTimeoutError("B", latencyMs);
  if (isProviderOutage(request)) throw new ProviderUnavailableError("B", "fares unavailable for this date (HTTP 503)");

  return {
    searchRef: `SB-${request.origin}${request.destination}-${request.departureDate.replaceAll("-", "")}`,
    itineraries: findInventory("B", request).map((offer) => ({
      ref: offer.offerId,
      origin: { iata: offer.origin },
      destination: { iata: offer.destination },
      departureAt: `${offer.departureDate}T${offer.departureTime}:00`,
      marketingCarrier: offer.airline,
      flightNo: offer.flightNumber,
      duration: toIsoDuration(offer.durationMinutes),
      stopCount: offer.stops,
      priceCents: offer.priceUsd * 100,
      currencyCode: "USD",
    })),
  };
}
