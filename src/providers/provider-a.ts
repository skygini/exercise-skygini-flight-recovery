import { findInventory, isProviderOutage } from "../fixtures/flight-inventory.ts";
import { logger } from "../logger.ts";
import { ProviderUnavailableError } from "./provider-errors.ts";
import {
  behaviorFor,
  delay,
  requestSeed,
  simulatedLatencyMs,
  type ProviderCallOptions,
  type ProviderSearchRequest,
} from "./simulation.ts";

/** Provider A ("AeroFast"): fast and reliable. */
export interface ProviderAResponse {
  provider: "AeroFast";
  flights: Array<{
    flightId: string;
    from: string;
    to: string;
    date: string;
    departureTime: string;
    carrier: { name: string; flightNumber: string };
    durationMin: number;
    stops: number;
    fare: { amount: number; currency: "USD" };
  }>;
}

export const PROVIDER_A_LATENCY_MS = { min: 80, max: 200 } as const;

export async function searchProviderA(
  request: ProviderSearchRequest,
  options: ProviderCallOptions = {},
): Promise<ProviderAResponse> {
  const behavior = behaviorFor("A", request.scenario);
  const latencyMs = simulatedLatencyMs(
    requestSeed("A", request),
    PROVIDER_A_LATENCY_MS.min,
    PROVIDER_A_LATENCY_MS.max,
    options.latencyMultiplier,
  );
  logger.info("provider A invoked", { route: `${request.origin}-${request.destination}`, date: request.departureDate, behavior, simulatedLatencyMs: latencyMs });

  await delay(latencyMs, options.signal);

  if (behavior === "error") throw new ProviderUnavailableError("A");
  if (isProviderOutage(request)) throw new ProviderUnavailableError("A", "fares unavailable for this date (HTTP 503)");

  return {
    provider: "AeroFast",
    flights: findInventory("A", request).map((offer) => ({
      flightId: offer.offerId,
      from: offer.origin,
      to: offer.destination,
      date: offer.departureDate,
      departureTime: offer.departureTime,
      carrier: { name: offer.airline, flightNumber: offer.flightNumber },
      durationMin: offer.durationMinutes,
      stops: offer.stops,
      fare: { amount: offer.priceUsd, currency: "USD" },
    })),
  };
}
