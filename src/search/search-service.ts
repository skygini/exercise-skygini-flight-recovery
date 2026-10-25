import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.ts";
import { createSearchCompletedEvent } from "../events/search-completed.ts";
import { logger } from "../logger.ts";
import { mergeOffers, normalizeProviderA, normalizeProviderB, normalizeProviderC } from "../providers/normalization.ts";
import { searchProviderA } from "../providers/provider-a.ts";
import { searchProviderB } from "../providers/provider-b.ts";
import { searchProviderC } from "../providers/provider-c.ts";
import { ProviderError, ProviderTimeoutError } from "../providers/provider-errors.ts";
import {
  PROVIDER_NAMES,
  type FlightOffer,
  type FlightSearchRequest,
  type ProviderName,
  type ProviderQuery,
  type ProviderQueryResult,
  type ProviderResult,
  type SearchConfig,
  type SearchResponse,
  type SearchStatus,
} from "./search-types.ts";

type ProviderAdapter = (query: ProviderQuery, signal: AbortSignal, config: SearchConfig) => Promise<FlightOffer[]>;

const PROVIDER_ADAPTERS: Record<ProviderName, ProviderAdapter> = {
  A: async (query, signal, config) =>
    normalizeProviderA(await searchProviderA(query, { signal, latencyMultiplier: config.latencyMultiplier })),
  B: async (query, signal, config) =>
    normalizeProviderB(await searchProviderB(query, { signal, latencyMultiplier: config.latencyMultiplier })),
  C: async (query, signal, config) =>
    normalizeProviderC(
      await searchProviderC(query, {
        signal,
        latencyMultiplier: config.latencyMultiplier,
        maxConcurrentRequests: config.providerCMaxConcurrent,
      }),
    ),
};

async function callProvider(provider: ProviderName, query: ProviderQuery, config: SearchConfig): Promise<FlightOffer[]> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new ProviderTimeoutError(provider, config.providerTimeoutMs)),
    config.providerTimeoutMs,
  );
  const startedAt = performance.now();
  try {
    const offers = await PROVIDER_ADAPTERS[provider](query, controller.signal, config);
    logger.info(`provider ${provider} succeeded`, { offers: offers.length, durationMs: Math.round(performance.now() - startedAt) });
    return offers;
  } catch (error) {
    logger.warn(`provider ${provider} failed`, {
      error: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function toFailedResult(reason: unknown): ProviderResult {
  if (reason instanceof ProviderError) {
    return { status: "failed", error: { code: reason.code, message: reason.message } };
  }
  return { status: "failed", error: { code: "unknown", message: reason instanceof Error ? reason.message : String(reason) } };
}

/**
 * Queries every provider concurrently, each with its own timeout, and merges whatever
 * succeeded. Never throws because of a provider failure. Reused by the agent search tools.
 */
export async function queryAllProviders(query: ProviderQuery, config: SearchConfig): Promise<ProviderQueryResult> {
  const settled = await Promise.allSettled(PROVIDER_NAMES.map((provider) => callProvider(provider, query, config)));

  const offers: FlightOffer[] = [];
  const providerResults = {} as ProviderQueryResult["providerResults"];
  PROVIDER_NAMES.forEach((provider, index) => {
    const outcome = settled[index]!;
    if (outcome.status === "fulfilled") {
      offers.push(...outcome.value);
      providerResults[provider] = { status: "success", offerCount: outcome.value.length };
    } else {
      providerResults[provider] = toFailedResult(outcome.reason);
    }
  });

  return { query, offers: mergeOffers(offers), providerResults };
}

function overallStatus(result: ProviderQueryResult): SearchStatus {
  const failures = Object.values(result.providerResults).filter((r) => r.status === "failed").length;
  if (failures === 0) return "completed";
  return failures === PROVIDER_NAMES.length ? "failed" : "partial";
}

export interface SearchDependencies {
  config: SearchConfig;
  eventBus: EventBus;
}

export async function searchFlights(request: FlightSearchRequest, deps: SearchDependencies): Promise<SearchResponse> {
  const searchId = `search-${randomUUID()}`;
  const startedAt = performance.now();
  logger.info("search started", {
    searchId,
    route: `${request.origin}-${request.destination}`,
    date: request.departureDate,
    scenario: request.scenario,
  });

  const result = await queryAllProviders(
    {
      origin: request.origin,
      destination: request.destination,
      departureDate: request.departureDate,
      scenario: request.scenario,
    },
    deps.config,
  );

  const response: SearchResponse = {
    searchId,
    status: overallStatus(result),
    origin: request.origin,
    destination: request.destination,
    departureDate: request.departureDate,
    preferences: request.preferences,
    scenario: request.scenario,
    offers: result.offers,
    providerResults: result.providerResults,
    durationMs: Math.round(performance.now() - startedAt),
  };

  logger.info("search completed", {
    searchId,
    status: response.status,
    offers: response.offers.length,
    cheapest: response.offers[0]?.price,
    durationMs: response.durationMs,
  });

  deps.eventBus.publish(createSearchCompletedEvent(response));
  return response;
}
