import type { FlightRecoveryDependencies, FlightRecoveryInput, FlightRecoveryResult } from "./agent-types.ts";

/**
 * AI Flight Recovery Agent — CANDIDATE TASK.
 *
 * Available tools (fully implemented, no LLM required):
 *   - searchNearbyDates(search, offsetDays, config)         ./tools/search-nearby-dates.ts
 *   - searchAlternativeAirports(search, airportCode, config) ./tools/search-alternative-airports.ts
 *   - alternativeAirportsFor(search)                         ./tools/search-alternative-airports.ts
 * Both search tools throw ToolInputError when the traveller's preferences forbid the call,
 * and ToolExecutionError when no provider could answer (./tools/tool-errors.ts).
 */
export async function runFlightRecoveryAgent(
  input: FlightRecoveryInput,
  deps: FlightRecoveryDependencies,
): Promise<FlightRecoveryResult> {
  // TODO(candidate):
  // 1. Integrate an LLM.
  // 2. Expose the available search tools to the model.
  // 3. Implement dynamic tool calling.
  // 4. Validate that recommendations come from real tool results.
  // 5. Return a structured FlightRecoveryResult.

  throw new Error("NOT_IMPLEMENTED");
}
