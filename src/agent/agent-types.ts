import type { ScenarioName } from "../providers/simulation.ts";
import type { FlightOffer, SearchConfig, SearchPreferences } from "../search/search-types.ts";

/** Everything the agent and its tools need to know about the original search. */
export interface FlightSearchContext {
  searchId: string;
  origin: string;
  destination: string;
  departureDate: string;
  preferences: SearchPreferences;
  /** Provider scenario of the original search; tool searches reuse it. */
  scenario: ScenarioName;
}

export interface FlightRecoveryInput {
  search: FlightSearchContext;
  originalOffers: FlightOffer[];
  /** null when the original search returned no offers. */
  cheapestOriginalPrice: number | null;
}

export interface FlightRecoveryDependencies {
  searchConfig: SearchConfig;
}

// Suggested result shape. Candidates may change it if they can justify the change.
export interface FlightRecommendation {
  offer: FlightOffer;
  savingsUsd: number;
  rationale: string;
}

export interface FlightRecoveryResult {
  searchId: string;
  outcome: "better_option_found" | "no_better_option";
  recommendations: FlightRecommendation[];
  summary: string;
}
