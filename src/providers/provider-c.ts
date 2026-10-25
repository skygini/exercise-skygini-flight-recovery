import { findInventory, isProviderOutage } from "../fixtures/flight-inventory.ts";
import { logger } from "../logger.ts";
import { ProviderRateLimitError, ProviderUnavailableError } from "./provider-errors.ts";
import {
  behaviorFor,
  delay,
  requestSeed,
  simulatedLatencyMs,
  type ProviderCallOptions,
  type ProviderSearchRequest,
} from "./simulation.ts";

/** Provider C ("LegacyFares"): unreliable legacy API with string-typed fields. */
export interface ProviderCResponse {
  status: "OK";
  data: {
    results: Array<{
      offer_id: string;
      route: string;
      /** DD/MM/YYYY */
      departure_date: string;
      /** HHMM */
      departure_time: string;
      airline_name: string;
      flight_code: string;
      duration_minutes: string;
      stops: string;
      total_price: string;
      currency: "USD";
    }>;
  };
}

export const PROVIDER_C_LATENCY_MS = { min: 200, max: 700 } as const;
export const PROVIDER_C_DEFAULT_MAX_CONCURRENT = 3;

export interface ProviderCCallOptions extends ProviderCallOptions {
  maxConcurrentRequests?: number;
}

const activeRequests = new Set<symbol>();

export function getProviderCActiveRequests(): number {
  return activeRequests.size;
}

export function resetProviderC(): void {
  activeRequests.clear();
}

function toLegacyDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

const MALFORMED_RESPONSE = {
  status: "OK",
  data: { results: [{ offer_id: "c-err", route: null, total_price: "N/A", currency: "???" }] },
};

/**
 * Returns `unknown` on purpose: Provider C sometimes sends payloads that do not match
 * its documented schema, so callers must validate before use.
 */
export async function searchProviderC(
  request: ProviderSearchRequest,
  options: ProviderCCallOptions = {},
): Promise<unknown> {
  const maxConcurrent = options.maxConcurrentRequests ?? PROVIDER_C_DEFAULT_MAX_CONCURRENT;
  if (activeRequests.size >= maxConcurrent) {
    logger.warn("provider C rate limited", { active: activeRequests.size, limit: maxConcurrent });
    throw new ProviderRateLimitError("C", `too many concurrent requests (limit ${maxConcurrent})`, 1000);
  }

  const token = Symbol("provider-c-request");
  activeRequests.add(token);
  try {
    const behavior = behaviorFor("C", request.scenario);
    const latencyMs = simulatedLatencyMs(
      requestSeed("C", request),
      PROVIDER_C_LATENCY_MS.min,
      PROVIDER_C_LATENCY_MS.max,
      options.latencyMultiplier,
    );
    logger.info("provider C invoked", { route: `${request.origin}-${request.destination}`, date: request.departureDate, behavior, simulatedLatencyMs: latencyMs, active: activeRequests.size });

    await delay(latencyMs, options.signal);

    if (behavior === "error" || isProviderOutage(request)) {
      throw new ProviderUnavailableError("C", "internal server error (HTTP 500)");
    }
    if (behavior === "malformed") return structuredClone(MALFORMED_RESPONSE);

    const inventory = behavior === "empty" ? [] : findInventory("C", request);
    const response: ProviderCResponse = {
      status: "OK",
      data: {
        results: inventory.map((offer) => ({
          offer_id: offer.offerId,
          route: `${offer.origin}-${offer.destination}`,
          departure_date: toLegacyDate(offer.departureDate),
          departure_time: offer.departureTime.replace(":", ""),
          airline_name: offer.airline,
          flight_code: offer.flightNumber,
          duration_minutes: String(offer.durationMinutes),
          stops: String(offer.stops),
          total_price: offer.priceUsd.toFixed(2),
          currency: "USD",
        })),
      },
    };
    return response;
  } finally {
    activeRequests.delete(token);
  }
}
