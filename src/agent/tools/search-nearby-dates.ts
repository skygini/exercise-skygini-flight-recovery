import { logger } from "../../logger.ts";
import { queryAllProviders } from "../../search/search-service.ts";
import type { ProviderQueryResult, SearchConfig } from "../../search/search-types.ts";
import type { FlightSearchContext } from "../agent-types.ts";
import { requireAnyProviderSuccess, ToolInputError } from "./tool-errors.ts";

export function shiftDate(isoDate: string, offsetDays: number): string {
  return Temporal.PlainDate.from(isoDate).add({ days: offsetDays }).toString();
}

/**
 * Re-runs the search on `departureDate + offsetDays` (same route) across all providers.
 * Rejects offsets outside the traveller's date flexibility. Partial provider failures are
 * reported in `providerResults`; if every provider fails it throws ToolExecutionError.
 */
export async function searchNearbyDates(
  search: FlightSearchContext,
  offsetDays: number,
  config: SearchConfig,
): Promise<ProviderQueryResult> {
  if (!Number.isInteger(offsetDays) || offsetDays === 0) {
    throw new ToolInputError(`offsetDays must be a non-zero integer, got ${offsetDays}`);
  }
  const flexibility = search.preferences.dateFlexibilityDays;
  if (Math.abs(offsetDays) > flexibility) {
    throw new ToolInputError(
      `offset of ${offsetDays} day(s) exceeds the traveller's date flexibility of ±${flexibility} day(s)`,
    );
  }

  const departureDate = shiftDate(search.departureDate, offsetDays);
  logger.info("tool searchNearbyDates", { searchId: search.searchId, offsetDays, departureDate });

  return requireAnyProviderSuccess(
    await queryAllProviders(
      { origin: search.origin, destination: search.destination, departureDate, scenario: search.scenario },
      config,
    ),
  );
}
