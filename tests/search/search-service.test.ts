import { beforeEach, describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/event-bus.ts";
import type { SearchCompletedEvent } from "../../src/events/search-completed.ts";
import { getProviderCActiveRequests, resetProviderC } from "../../src/providers/provider-c.ts";
import { requestSeed, simulatedLatencyMs, type ScenarioName } from "../../src/providers/simulation.ts";
import { queryAllProviders, searchFlights } from "../../src/search/search-service.ts";
import type { FlightSearchRequest, ProviderQuery } from "../../src/search/search-types.ts";
import { activeTimers, FAST_SEARCH_CONFIG } from "../helpers.ts";

const query = (scenario: ScenarioName = "normal"): ProviderQuery => ({
  origin: "TLV",
  destination: "LON",
  departureDate: "2027-11-15",
  scenario,
});

const request = (scenario: ScenarioName = "normal"): FlightSearchRequest => ({
  ...query(scenario),
  preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
});

beforeEach(() => resetProviderC());

describe("queryAllProviders", () => {
  it("merges, de-duplicates and sorts offers from all providers", async () => {
    const result = await queryAllProviders(query(), FAST_SEARCH_CONFIG);

    expect(result.providerResults).toEqual({
      A: { status: "success", offerCount: 4 },
      B: { status: "success", offerCount: 2 },
      C: { status: "success", offerCount: 2 },
    });
    const prices = result.offers.map((o) => o.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(prices[0]).toBe(630);
    // LV315 is sold by A ($655) and C ($649): only the cheaper C offer survives.
    expect(result.offers.map((o) => o.id)).toContain("C-301");
    expect(result.offers.map((o) => o.id)).not.toContain("A-101");
  });

  it("calls the providers concurrently, not sequentially", async () => {
    const config = { ...FAST_SEARCH_CONFIG, latencyMultiplier: 1, providerTimeoutMs: 2000 };
    const latencies = {
      A: simulatedLatencyMs(requestSeed("A", query()), 80, 200),
      B: simulatedLatencyMs(requestSeed("B", query()), 900, 1500),
      C: simulatedLatencyMs(requestSeed("C", query()), 200, 700),
    };
    const sequentialMs = latencies.A + latencies.B + latencies.C;
    const slowestMs = Math.max(latencies.A, latencies.B, latencies.C);

    const startedAt = performance.now();
    await queryAllProviders(query(), config);
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(slowestMs - 5);
    expect(elapsed).toBeLessThan(slowestMs + 150);
    expect(elapsed).toBeLessThan(sequentialMs - 150);
  });

  it("returns partial results when Provider B exceeds the provider timeout (slow-provider)", async () => {
    const baselineTimers = activeTimers();
    const startedAt = performance.now();
    const result = await queryAllProviders(query("slow-provider"), FAST_SEARCH_CONFIG);
    const elapsed = performance.now() - startedAt;

    expect(result.providerResults.B).toEqual({
      status: "failed",
      error: { code: "timeout", message: "Provider B: no response within 250 ms" },
    });
    expect(result.providerResults.A.status).toBe("success");
    expect(result.providerResults.C.status).toBe("success");
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers.every((o) => o.provider !== "B")).toBe(true);
    expect(elapsed).toBeLessThan(FAST_SEARCH_CONFIG.providerTimeoutMs + 100);
    expect(activeTimers()).toBeLessThanOrEqual(baselineTimers);
  });

  it("times out a hanging Provider B (provider-timeout)", async () => {
    const result = await queryAllProviders(query("provider-timeout"), FAST_SEARCH_CONFIG);
    expect(result.providerResults.B).toMatchObject({ status: "failed", error: { code: "timeout" } });
  });

  it("returns A and B offers when Provider C throws a server error (provider-failure)", async () => {
    const result = await queryAllProviders(query("provider-failure"), FAST_SEARCH_CONFIG);
    expect(result.providerResults.C).toMatchObject({ status: "failed", error: { code: "unavailable" } });
    expect(new Set(result.offers.map((o) => o.provider))).toEqual(new Set(["A", "B"]));
  });

  it("survives a Provider A failure", async () => {
    const result = await queryAllProviders(query("provider-a-failure"), FAST_SEARCH_CONFIG);
    expect(result.providerResults.A).toMatchObject({ status: "failed", error: { code: "unavailable" } });
    expect(result.offers.length).toBeGreaterThan(0);
  });

  it("reports a malformed Provider C response as invalid_response", async () => {
    const result = await queryAllProviders(query("provider-c-malformed"), FAST_SEARCH_CONFIG);
    expect(result.providerResults.C).toMatchObject({ status: "failed", error: { code: "invalid_response" } });
  });

  it("treats an empty Provider C response as a success with zero offers", async () => {
    const result = await queryAllProviders(query("provider-c-empty"), FAST_SEARCH_CONFIG);
    expect(result.providerResults.C).toEqual({ status: "success", offerCount: 0 });
  });
});

describe("searchFlights", () => {
  it("returns a search id and status, and publishes SearchCompleted", async () => {
    const eventBus = createEventBus();
    const events: SearchCompletedEvent[] = [];
    eventBus.subscribe("SearchCompleted", (event) => {
      events.push(event);
    });

    const response = await searchFlights(request(), { config: FAST_SEARCH_CONFIG, eventBus });
    await eventBus.waitForIdle();

    expect(response.searchId).toMatch(/^search-/);
    expect(response.status).toBe("completed");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "SearchCompleted",
      searchId: response.searchId,
      origin: "TLV",
      destination: "LON",
      departureDate: "2027-11-15",
      preferences: { dateFlexibilityDays: 1, allowAlternativeAirports: true },
      cheapestOriginalPrice: 630,
      originalOffers: response.offers,
    });
    expect(events[0]?.eventId).toMatch(/^event-/);
  });

  it("marks the search partial when a provider fails", async () => {
    const response = await searchFlights(request("provider-failure"), { config: FAST_SEARCH_CONFIG, eventBus: createEventBus() });
    expect(response.status).toBe("partial");
  });

  it("rate-limits Provider C across concurrent searches while A and B keep working", async () => {
    const eventBus = createEventBus();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => searchFlights(request(), { config: FAST_SEARCH_CONFIG, eventBus })),
    );

    const cStatuses = responses.map((r) => r.providerResults.C);
    expect(cStatuses.filter((s) => s.status === "success")).toHaveLength(3);
    expect(cStatuses.filter((s) => s.status === "failed" && s.error.code === "rate_limited")).toHaveLength(2);
    expect(responses.every((r) => r.providerResults.A.status === "success" && r.providerResults.B.status === "success")).toBe(true);
    expect(new Set(responses.map((r) => r.searchId)).size).toBe(5);
    expect(getProviderCActiveRequests()).toBe(0);
  });
});
