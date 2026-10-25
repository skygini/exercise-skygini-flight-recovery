import type { FlightRecoveryInput } from "../agent/agent-types.ts";
import type { EventBus } from "../events/event-bus.ts";
import type { SearchCompletedEvent } from "../events/search-completed.ts";
import { logger } from "../logger.ts";
import type { SearchConfig } from "../search/search-types.ts";
import type { RecoveryStore } from "../storage/recovery-store.ts";

export interface RecoveryWorkerDependencies {
  recoveryStore: RecoveryStore;
  searchConfig: SearchConfig;
}

export function buildRecoveryInput(event: SearchCompletedEvent): FlightRecoveryInput {
  return {
    search: {
      searchId: event.searchId,
      origin: event.origin,
      destination: event.destination,
      departureDate: event.departureDate,
      preferences: event.preferences,
      scenario: event.scenario,
    },
    originalOffers: event.originalOffers,
    cheapestOriginalPrice: event.cheapestOriginalPrice,
  };
}

export async function handleSearchCompleted(
  event: SearchCompletedEvent,
  deps: RecoveryWorkerDependencies,
): Promise<void> {
  deps.recoveryStore.createPending(event.searchId);
  logger.info("recovery worker received search", {
    searchId: event.searchId,
    cheapestOriginalPrice: event.cheapestOriginalPrice,
  });

  // TODO(candidate): run the AI Flight Recovery Agent for this search.
  //   - Build its input with buildRecoveryInput(event) and call runFlightRecoveryAgent()
  //     (src/agent/flight-recovery-agent.ts) with { searchConfig: deps.searchConfig }.
  //   - Move the record through running → completed / failed via deps.recoveryStore.
  //   - Agent errors must never escape this handler or crash the process.
  // Until then the recovery stays "pending".
}

/** Entry point: subscribes the recovery worker to SearchCompleted events. */
export function registerRecoveryWorker(eventBus: EventBus, deps: RecoveryWorkerDependencies): () => void {
  return eventBus.subscribe("SearchCompleted", (event) => handleSearchCompleted(event, deps));
}
