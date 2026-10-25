import { airportsForCity, cityOf, resolveAirport } from "../../fixtures/airports.ts";
import { logger } from "../../logger.ts";
import { queryAllProviders } from "../../search/search-service.ts";
import type { ProviderQueryResult, SearchConfig } from "../../search/search-types.ts";
import type { FlightSearchContext } from "../agent-types.ts";
import { requireAnyProviderSuccess, ToolInputError } from "./tool-errors.ts";

/** Airports in the same city as the search's origin or destination (from the predefined mapping). */
export function alternativeAirportsFor(search: Pick<FlightSearchContext, "origin" | "destination">): {
  origin: string[];
  destination: string[];
} {
  const siblings = (code: string) => {
    const city = cityOf(code);
    return city ? airportsForCity(city).filter((airport) => airport !== resolveAirport(code)) : [];
  };
  return { origin: siblings(search.origin), destination: siblings(search.destination) };
}

/**
 * Re-runs the search with `airportCode` replacing the origin or destination it is an
 * alternative for (same date). Requires the traveller to allow alternative airports.
 * Partial provider failures are reported in `providerResults`; if every provider fails it throws ToolExecutionError.
 */
export async function searchAlternativeAirports(
  search: FlightSearchContext,
  airportCode: string,
  config: SearchConfig,
): Promise<ProviderQueryResult> {
  if (!search.preferences.allowAlternativeAirports) {
    throw new ToolInputError("the traveller does not allow alternative airports");
  }

  const airport = airportCode.trim().toUpperCase();
  const alternatives = alternativeAirportsFor(search);
  let origin = search.origin;
  let destination = search.destination;
  if (alternatives.destination.includes(airport)) destination = airport;
  else if (alternatives.origin.includes(airport)) origin = airport;
  else {
    const allowed = [...alternatives.origin, ...alternatives.destination];
    throw new ToolInputError(
      `${airport} is not an alternative airport for ${search.origin}-${search.destination}` +
        (allowed.length > 0 ? `; allowed: ${allowed.join(", ")}` : "; this route has no alternative airports"),
    );
  }

  logger.info("tool searchAlternativeAirports", { searchId: search.searchId, route: `${origin}-${destination}` });

  return requireAnyProviderSuccess(
    await queryAllProviders({ origin, destination, departureDate: search.departureDate, scenario: search.scenario }, config),
  );
}
