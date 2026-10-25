import { describe, expect, it } from "vitest";
import { searchProviderB } from "../../src/providers/provider-b.ts";
import { ProviderTimeoutError } from "../../src/providers/provider-errors.ts";
import { activeTimers } from "../helpers.ts";

const LONDON = { origin: "TLV", destination: "LON", departureDate: "2027-11-15" };

async function elapsedMs(run: () => Promise<unknown>): Promise<number> {
  const startedAt = performance.now();
  await run();
  return performance.now() - startedAt;
}

describe("Provider B (slow, variable)", () => {
  it("normal latency is 900–1500 ms (measured at 10% scale)", async () => {
    const elapsed = await elapsedMs(() => searchProviderB(LONDON, { latencyMultiplier: 0.1 }));
    expect(elapsed).toBeGreaterThanOrEqual(85);
    expect(elapsed).toBeLessThan(190);
  });

  it("slow mode latency is 3000–5000 ms (measured at 10% scale)", async () => {
    const elapsed = await elapsedMs(() =>
      searchProviderB({ ...LONDON, scenario: "slow-provider" }, { latencyMultiplier: 0.1 }),
    );
    expect(elapsed).toBeGreaterThanOrEqual(295);
    expect(elapsed).toBeLessThan(560);
  });

  it("uses its own schema (cents, ISO durations) and carries the attractive $480 fare", async () => {
    const response = await searchProviderB({ ...LONDON, departureDate: "2027-11-14" }, { latencyMultiplier: 0 });
    expect(response.searchRef).toBe("SB-TLVLON-20271114");
    expect(response.itineraries).toContainEqual(
      expect.objectContaining({ ref: "203", priceCents: 48_000, duration: "PT6H35M", departureAt: "2027-11-14T07:30:00" }),
    );
  });

  it("in the provider-timeout scenario it hangs, then reports an upstream timeout", async () => {
    await expect(
      searchProviderB({ ...LONDON, scenario: "provider-timeout" }, { latencyMultiplier: 0.005 }),
    ).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it("aborting a hanging call rejects promptly and leaves no timer behind", async () => {
    const baseline = activeTimers();
    const controller = new AbortController();
    const call = searchProviderB({ ...LONDON, scenario: "provider-timeout" }, { signal: controller.signal });
    setTimeout(() => controller.abort(new Error("caller timeout")), 20);

    const elapsed = await elapsedMs(() => call.catch(() => undefined));
    await expect(call).rejects.toThrow("caller timeout");
    expect(elapsed).toBeLessThan(200);
    expect(activeTimers()).toBeLessThanOrEqual(baseline);
  });
});
