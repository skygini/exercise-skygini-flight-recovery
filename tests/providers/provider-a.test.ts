import { describe, expect, it } from "vitest";
import { searchProviderA } from "../../src/providers/provider-a.ts";
import { ProviderUnavailableError } from "../../src/providers/provider-errors.ts";

const LONDON = { origin: "TLV", destination: "LON", departureDate: "2027-11-15" };

describe("Provider A (fast, reliable)", () => {
  it("responds within its 80–200 ms latency window", async () => {
    const startedAt = performance.now();
    await searchProviderA(LONDON);
    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(75);
    expect(elapsed).toBeLessThan(260);
  });

  it("returns 3–5 offers in its own schema for every fixture route", async () => {
    const routes = [
      LONDON,
      { origin: "TLV", destination: "LON", departureDate: "2027-11-14" },
      { origin: "TLV", destination: "LTN", departureDate: "2027-05-20" },
      { origin: "TLV", destination: "PAR", departureDate: "2027-04-10" },
      { origin: "TLV", destination: "NYC", departureDate: "2027-06-10" },
    ];
    for (const route of routes) {
      const response = await searchProviderA(route, { latencyMultiplier: 0 });
      expect(response.provider).toBe("AeroFast");
      expect(response.flights.length).toBeGreaterThanOrEqual(3);
      expect(response.flights.length).toBeLessThanOrEqual(5);
    }
    const [first] = (await searchProviderA(LONDON, { latencyMultiplier: 0 })).flights;
    expect(first).toMatchObject({ flightId: "101", from: "TLV", to: "LHR", fare: { amount: 655, currency: "USD" } });
  });

  it("returns no flights for a route without inventory", async () => {
    const response = await searchProviderA({ origin: "TLV", destination: "NYC", departureDate: "2027-01-01" }, { latencyMultiplier: 0 });
    expect(response.flights).toEqual([]);
  });

  it("throws ProviderUnavailableError in the provider-a-failure scenario", async () => {
    await expect(
      searchProviderA({ ...LONDON, scenario: "provider-a-failure" }, { latencyMultiplier: 0.1 }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("can be cancelled with an AbortSignal", async () => {
    const reason = new Error("cancelled");
    await expect(searchProviderA(LONDON, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
  });
});
