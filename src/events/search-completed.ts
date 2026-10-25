import { randomUUID } from "node:crypto";
import type { ScenarioName } from "../providers/simulation.ts";
import type {
  FlightOffer,
  ProviderResults,
  SearchPreferences,
  SearchResponse,
} from "../search/search-types.ts";

export interface SearchCompletedEvent {
  type: "SearchCompleted";
  eventId: string;
  occurredAt: string;
  searchId: string;
  origin: string;
  destination: string;
  departureDate: string;
  preferences: SearchPreferences;
  scenario: ScenarioName;
  originalOffers: FlightOffer[];
  /** null when the original search returned no offers. */
  cheapestOriginalPrice: number | null;
  providerResults: ProviderResults;
}

export function createSearchCompletedEvent(search: SearchResponse): SearchCompletedEvent {
  return {
    type: "SearchCompleted",
    eventId: `event-${randomUUID()}`,
    occurredAt: new Date().toISOString(),
    searchId: search.searchId,
    origin: search.origin,
    destination: search.destination,
    departureDate: search.departureDate,
    preferences: search.preferences,
    scenario: search.scenario,
    originalOffers: search.offers,
    cheapestOriginalPrice: search.offers[0]?.price ?? null,
    providerResults: search.providerResults,
  };
}
