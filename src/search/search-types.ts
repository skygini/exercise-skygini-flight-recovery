import type { ScenarioName } from "../providers/simulation.ts";

export const PROVIDER_NAMES = ["A", "B", "C"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface SearchPreferences {
  dateFlexibilityDays: number;
  allowAlternativeAirports: boolean;
}

export interface FlightSearchRequest {
  origin: string;
  destination: string;
  departureDate: string;
  preferences: SearchPreferences;
  scenario: ScenarioName;
}

export interface ProviderQuery {
  origin: string;
  destination: string;
  departureDate: string;
  scenario: ScenarioName;
}

export interface FlightOffer {
  /** Globally unique: `${provider}-${providerOfferId}`. */
  id: string;
  provider: ProviderName;
  providerOfferId: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  airline: string;
  flightNumber: string;
  durationMinutes: number;
  stops: number;
  price: number;
  currency: "USD";
}

export type ProviderErrorCode =
  | "timeout"
  | "unavailable"
  | "rate_limited"
  | "invalid_response"
  | "unknown";

export type ProviderResult =
  | { status: "success"; offerCount: number }
  | { status: "failed"; error: { code: ProviderErrorCode; message: string } };

export type ProviderResults = Record<ProviderName, ProviderResult>;

export interface ProviderQueryResult {
  query: ProviderQuery;
  offers: FlightOffer[];
  providerResults: ProviderResults;
}

/** completed: every provider answered. partial: some failed. failed: none answered. */
export type SearchStatus = "completed" | "partial" | "failed";

export interface SearchResponse {
  searchId: string;
  status: SearchStatus;
  origin: string;
  destination: string;
  departureDate: string;
  preferences: SearchPreferences;
  scenario: ScenarioName;
  offers: FlightOffer[];
  providerResults: ProviderResults;
  durationMs: number;
}

export interface SearchConfig {
  providerTimeoutMs: number;
  providerCMaxConcurrent: number;
  latencyMultiplier: number;
}
