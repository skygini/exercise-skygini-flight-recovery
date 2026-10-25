import { describe, expect, it } from "vitest";
import type { FlightRecoveryResult } from "../../src/agent/agent-types.ts";
import { createEventBus } from "../../src/events/event-bus.ts";
import { searchFlights } from "../../src/search/search-service.ts";
import { createRecoveryStore } from "../../src/storage/recovery-store.ts";
import { buildRecoveryInput, registerRecoveryWorker } from "../../src/worker/recovery-worker.ts";
import { FAST_SEARCH_CONFIG } from "../helpers.ts";

describe("recovery store", () => {
  it("moves a record through pending → running → completed", () => {
    const store = createRecoveryStore();
    expect(store.createPending("s1").status).toBe("pending");
    expect(store.markRunning("s1").status).toBe("running");

    const result: FlightRecoveryResult = { searchId: "s1", outcome: "no_better_option", recommendations: [], summary: "none" };
    expect(store.markCompleted("s1", result)).toMatchObject({ status: "completed", result });
    expect(store.get("s1")?.status).toBe("completed");
  });

  it("records failures with an error message", () => {
    const store = createRecoveryStore();
    store.createPending("s2");
    expect(store.markFailed("s2", "LLM unavailable")).toMatchObject({ status: "failed", error: "LLM unavailable" });
  });

  it("returns undefined for unknown searches and refuses to update them", () => {
    const store = createRecoveryStore();
    expect(store.get("missing")).toBeUndefined();
    expect(() => store.markRunning("missing")).toThrow("No recovery record");
  });
});

describe("recovery worker", () => {
  it("creates a pending recovery for every completed search", async () => {
    const eventBus = createEventBus();
    const recoveryStore = createRecoveryStore();
    registerRecoveryWorker(eventBus, { recoveryStore, searchConfig: FAST_SEARCH_CONFIG });

    const response = await searchFlights(
      {
        origin: "TLV",
        destination: "LON",
        departureDate: "2027-11-15",
        preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
        scenario: "normal",
      },
      { config: FAST_SEARCH_CONFIG, eventBus },
    );
    await eventBus.waitForIdle();

    expect(recoveryStore.get(response.searchId)).toMatchObject({ searchId: response.searchId, status: "pending" });
  });

  it("builds the agent input from a SearchCompleted event", () => {
    const input = buildRecoveryInput({
      type: "SearchCompleted",
      eventId: "event-1",
      occurredAt: "2027-01-01T00:00:00.000Z",
      searchId: "search-1",
      origin: "TLV",
      destination: "LON",
      departureDate: "2027-11-15",
      preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
      scenario: "slow-provider",
      originalOffers: [],
      cheapestOriginalPrice: null,
      providerResults: {
        A: { status: "success", offerCount: 0 },
        B: { status: "success", offerCount: 0 },
        C: { status: "success", offerCount: 0 },
      },
    });
    expect(input).toEqual({
      search: {
        searchId: "search-1",
        origin: "TLV",
        destination: "LON",
        departureDate: "2027-11-15",
        preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
        scenario: "slow-provider",
      },
      originalOffers: [],
      cheapestOriginalPrice: null,
    });
  });
});
