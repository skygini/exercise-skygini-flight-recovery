import { beforeEach, describe, expect, it } from "vitest";
import { normalizeProviderC } from "../../src/providers/normalization.ts";
import { getProviderCActiveRequests, resetProviderC, searchProviderC } from "../../src/providers/provider-c.ts";
import {
  ProviderInvalidResponseError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from "../../src/providers/provider-errors.ts";

const LONDON = { origin: "TLV", destination: "LON", departureDate: "2027-11-15" };
const FAST = { latencyMultiplier: 0.1 };

beforeEach(() => resetProviderC());

describe("Provider C (unreliable)", () => {
  it("returns results in its legacy string-typed schema", async () => {
    const response = (await searchProviderC(LONDON, FAST)) as { data: { results: unknown[] } };
    expect(response.data.results).toContainEqual(
      expect.objectContaining({
        offer_id: "301",
        route: "TLV-LHR",
        departure_date: "15/11/2027",
        departure_time: "0610",
        total_price: "649.00",
      }),
    );
  });

  it("latency is within 200–700 ms (measured at 10% scale)", async () => {
    const startedAt = performance.now();
    await searchProviderC(LONDON, FAST);
    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(19);
    expect(elapsed).toBeLessThan(110);
  });

  it("simulates a server error", async () => {
    await expect(searchProviderC({ ...LONDON, scenario: "provider-failure" }, FAST)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
    expect(getProviderCActiveRequests()).toBe(0);
  });

  it("can return empty results", async () => {
    const response = await searchProviderC({ ...LONDON, scenario: "provider-c-empty" }, FAST);
    expect(normalizeProviderC(response)).toEqual([]);
  });

  it("can return a malformed response that fails normalization", async () => {
    const response = await searchProviderC({ ...LONDON, scenario: "provider-c-malformed" }, FAST);
    expect(() => normalizeProviderC(response)).toThrow(ProviderInvalidResponseError);
  });

  describe("rate limiting", () => {
    it("rejects requests beyond the concurrent limit and releases slots afterwards", async () => {
      const calls = Array.from({ length: 5 }, () => searchProviderC(LONDON, { ...FAST, maxConcurrentRequests: 3 }));
      expect(getProviderCActiveRequests()).toBe(3);

      const results = await Promise.allSettled(calls);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      expect(rejected).toHaveLength(2);
      for (const r of rejected) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ProviderRateLimitError);

      expect(getProviderCActiveRequests()).toBe(0);
      await expect(searchProviderC(LONDON, FAST)).resolves.toBeDefined();
    });

    it("honours a configurable limit", async () => {
      const first = searchProviderC(LONDON, { ...FAST, maxConcurrentRequests: 1 });
      await expect(searchProviderC(LONDON, { ...FAST, maxConcurrentRequests: 1 })).rejects.toBeInstanceOf(
        ProviderRateLimitError,
      );
      await first;
    });

    it("releases the slot when a request is cancelled", async () => {
      const controller = new AbortController();
      const call = searchProviderC(LONDON, { signal: controller.signal });
      expect(getProviderCActiveRequests()).toBe(1);
      controller.abort(new Error("cancelled"));
      await expect(call).rejects.toThrow("cancelled");
      expect(getProviderCActiveRequests()).toBe(0);
    });
  });
});
